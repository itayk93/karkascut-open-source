import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { generateId } from "../utils/id.js";
import { env as appEnv } from "../config/env.js";

const SCRIPT_OPENCV_PATH = path.resolve(process.cwd(), "scripts/eye_contact.py");
const SCRIPT_NVIDIA_PATH = path.resolve(process.cwd(), "scripts/nvidia_eye_contact/scripts/eye-contact.py");

/**
 * Normalizes input video for NVIDIA Maxine NIM:
 * - Ensures H.264 codec (NVIDIA NIM cloud requires H.264, hangs indefinitely on HEVC/H.265)
 * - Constant Frame Rate (30 fps)
 * - Standard 1080p width maximum for fast cloud gRPC transfer & GPU processing
 * - Moov atom faststart
 */
function normalizeForNvidia(inputPath: string): Promise<string> {
  return new Promise((resolve) => {
    const outputPath = path.join(path.dirname(inputPath), `nv_norm_${generateId()}.mp4`);
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale='min(1080,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath
    ];

    const proc = spawn("ffmpeg", args);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        resolve(outputPath);
      } else {
        resolve(inputPath);
      }
    });
    proc.on("error", () => resolve(inputPath));
  });
}

/**
 * Ensures output video retains audio from input
 */
function ensureAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve) => {
    const tempMux = path.join(path.dirname(outputPath), `nv_mux_${generateId()}.mp4`);
    const args = ["-y", "-i", outputPath, "-i", inputPath, "-c:v", "copy", "-c:a", "aac", "-shortest", tempMux];
    const proc = spawn("ffmpeg", args);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(tempMux) && fs.statSync(tempMux).size > 1000) {
        try {
          fs.copyFileSync(tempMux, outputPath);
          fs.unlinkSync(tempMux);
        } catch {}
      }
      resolve();
    });
    proc.on("error", () => resolve());
  });
}

export function runEyeContactCorrection(
  inputVideoPath: string,
  outputVideoPath: string,
  onProgress?: (progressPct: number) => void,
  onProcess?: (proc: ChildProcess) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputVideoPath)) {
      return reject(new Error(`Input video not found: ${inputVideoPath}`));
    }

    const pythonBin = appEnv.PYTHON_BIN;
    const nvidiaKey = appEnv.NVIDIA_API_KEY.trim();
    const nvidiaFuncId = appEnv.NVIDIA_FUNCTION_ID.trim();
    const nvidiaTarget = appEnv.NVIDIA_TARGET.trim();

    // If NVIDIA API Key is present, use NVIDIA Maxine Cloud Eye Contact NIM (GPU Studio Quality)
    if (nvidiaKey.length > 10 && fs.existsSync(SCRIPT_NVIDIA_PATH)) {
      (async () => {
        let preparedInput = inputVideoPath;
        let isNormalized = false;

        try {
          if (onProgress) onProgress(5);
          const normalized = await normalizeForNvidia(inputVideoPath);
          if (normalized !== inputVideoPath) {
            preparedInput = normalized;
            isNormalized = true;
          }
          if (onProgress) onProgress(10);
        } catch (e) {
          console.warn("[NVIDIA Normalize] Error normalizing video:", e);
        }

        const env = {
          ...process.env,
          PYTHONPATH: [
            path.resolve(process.cwd(), "scripts/nvidia_eye_contact"),
            path.resolve(process.cwd(), "scripts/nvidia_eye_contact/interfaces"),
            path.resolve(process.cwd(), "scripts/nvidia_eye_contact/scripts")
          ].join(":")
        };

        const args = [
          SCRIPT_NVIDIA_PATH,
          "--preview-mode",
          "--target",
          nvidiaTarget,
          "--function-id",
          nvidiaFuncId,
          "--api-key",
          nvidiaKey,
          "--input",
          preparedInput,
          "--output",
          outputVideoPath
        ];

        const pyProcess = spawn(pythonBin, args, { env });
        if (onProcess) {
          onProcess(pyProcess);
        }

        // 3-minute safeguard timeout: if cloud hangs, kill process and fallback to local OpenCV
        let isTimedOut = false;
        const timeoutTimer = setTimeout(() => {
          isTimedOut = true;
          console.warn("[NVIDIA Maxine NIM] Timed out after 180s. Killing process and falling back to OpenCV.");
          try {
            pyProcess.kill("SIGKILL");
          } catch {}
        }, 180000);

        let spawnFailed = false;
        let stderr = "";
        pyProcess.stdout.on("data", (d) => {
          const str = d.toString();
          const match = str.match(/PROGRESS:(\d+)/);
          if (match && onProgress) {
            onProgress(parseInt(match[1], 10));
          }
        });
        pyProcess.stderr.on("data", (d) => (stderr += d.toString()));

        pyProcess.on("error", (error) => {
          spawnFailed = true;
          clearTimeout(timeoutTimer);
          if (isNormalized) fs.rmSync(preparedInput, { force: true });
          reject(new Error(`Could not start eye contact Python (${pythonBin}): ${error.message}`));
        });

        pyProcess.on("close", async (code, signal) => {
          if (spawnFailed) return;
          clearTimeout(timeoutTimer);
          if (isNormalized && fs.existsSync(preparedInput)) {
            try {
              fs.unlinkSync(preparedInput);
            } catch {}
          }

          if (!isTimedOut && (signal === "SIGTERM" || signal === "SIGKILL" || pyProcess.killed)) {
            return reject(new Error("RENDER_CANCELLED"));
          }
          if (code === 0 && fs.existsSync(outputVideoPath) && fs.statSync(outputVideoPath).size > 1000) {
            await ensureAudio(inputVideoPath, outputVideoPath);
            if (onProgress) onProgress(100);
            return resolve();
          }

          console.warn(
            `[NVIDIA Maxine NIM] Failed (code ${code}): ${stderr.slice(-300)}. Falling back to local OpenCV.`
          );
          runLocalOpenCVEyeContact(pythonBin, inputVideoPath, outputVideoPath, onProgress, onProcess)
            .then(resolve)
            .catch(reject);
        });
      })().catch(reject);
      return;
    }

    // Local OpenCV fallback
    runLocalOpenCVEyeContact(pythonBin, inputVideoPath, outputVideoPath, onProgress, onProcess)
      .then(resolve)
      .catch(reject);
  });
}

function runLocalOpenCVEyeContact(
  pythonBin: string,
  inputVideoPath: string,
  outputVideoPath: string,
  onProgress?: (progressPct: number) => void,
  onProcess?: (proc: ChildProcess) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pyProcess = spawn(pythonBin, [SCRIPT_OPENCV_PATH, inputVideoPath, outputVideoPath]);
    if (onProcess) {
      onProcess(pyProcess);
    }

    let stderr = "";

    pyProcess.stdout.on("data", (data) => {
      const str = data.toString();
      const match = str.match(/PROGRESS:(\d+)/);
      if (match && onProgress) {
        onProgress(parseInt(match[1], 10));
      }
    });

    pyProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pyProcess.on("error", (error) => {
      reject(new Error(`Could not start eye contact Python (${pythonBin}): ${error.message}`));
    });

    pyProcess.on("close", (code, signal) => {
      if (signal === "SIGTERM" || signal === "SIGKILL" || pyProcess.killed) {
        return reject(new Error("RENDER_CANCELLED"));
      }
      if (code === 0 && fs.existsSync(outputVideoPath)) {
        resolve();
      } else {
        reject(new Error(`Eye contact processing failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}
