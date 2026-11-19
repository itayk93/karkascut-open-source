import { spawn, ChildProcess } from "child_process";
import fs from "fs";

export async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);

    let output = "";
    let errorOutput = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const dur = parseFloat(output.trim());
        if (!isNaN(dur)) {
          resolve(dur);
        } else {
          reject(new Error(`Failed to parse duration: ${output}`));
        }
      } else {
        reject(new Error(`ffprobe failed (code ${code}): ${errorOutput}`));
      }
    });
  });
}

export interface VideoMetaInfo {
  width: number;
  height: number;
  rotation: number;
  isVertical: boolean;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetaInfo> {
  return new Promise((resolve) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
      "-of",
      "json",
      filePath
    ]);

    let output = "";
    ffprobe.stdout.on("data", (d) => (output += d.toString()));
    ffprobe.on("close", (code) => {
      let rawW = 1920;
      let rawH = 1080;
      let rot = 0;

      if (code === 0 && output) {
        try {
          const parsed = JSON.parse(output);
          const st = parsed.streams?.[0];
          if (st) {
            rawW = st.width || rawW;
            rawH = st.height || rawH;
            if (st.side_data_list) {
              for (const sd of st.side_data_list) {
                if (typeof sd.rotation === "number") rot = sd.rotation;
              }
            } else if (st.tags?.rotate) {
              rot = parseInt(st.tags.rotate, 10) || 0;
            }
          }
        } catch {}
      }

      // Display dimensions accounting for rotation
      const dispW = Math.abs(rot) === 90 || Math.abs(rot) === 270 ? rawH : rawW;
      const dispH = Math.abs(rot) === 90 || Math.abs(rot) === 270 ? rawW : rawH;
      const isVertical = dispH > dispW;

      resolve({
        width: dispW,
        height: dispH,
        rotation: rot,
        isVertical
      });
    });
  });
}

export async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const meta = await getVideoMetadata(filePath);
  return { width: meta.width, height: meta.height };
}

export function stripMp4RotationMatrix(mp4Path: string): boolean {
  if (!fs.existsSync(mp4Path)) return false;
  try {
    const fd = fs.openSync(mp4Path, "r+");
    const buffer = fs.readFileSync(mp4Path);
    let idx = 0;
    let modified = false;

    while (true) {
      const pos = buffer.indexOf(Buffer.from("tkhd"), idx);
      if (pos === -1) break;
      const version = buffer[pos + 4];
      const matrixOffset = pos + (version === 1 ? 56 : 44);

      if (matrixOffset + 36 <= buffer.length) {
        // Read 36 bytes and check if already identity
        const identity = Buffer.alloc(36);
        identity.writeInt32BE(0x10000, 0);
        identity.writeInt32BE(0, 4);
        identity.writeInt32BE(0, 8);
        identity.writeInt32BE(0, 12);
        identity.writeInt32BE(0x10000, 16);
        identity.writeInt32BE(0, 20);
        identity.writeInt32BE(0, 24);
        identity.writeInt32BE(0, 28);
        identity.writeInt32BE(0x40000000, 32);

        if (!buffer.subarray(matrixOffset, matrixOffset + 36).equals(identity)) {
          fs.writeSync(fd, identity, 0, 36, matrixOffset);
          modified = true;
        }
      }
      idx = pos + 4;
    }

    fs.closeSync(fd);
    return modified;
  } catch (err) {
    console.warn("stripMp4RotationMatrix error:", err);
    return false;
  }
}

export async function rotateSourceVideo(videoPath: string, degrees: 90 | 180 | 270): Promise<string> {
  const rotatedPath = videoPath.replace(/(\.[^.]+)$/, `_rot${degrees}$1`);
  // FFmpeg transpose: 1 = 90Clockwise, 2 = 90CounterClockwise
  let transposeFilter = "transpose=1";
  if (degrees === 90) transposeFilter = "transpose=1";
  else if (degrees === 180) transposeFilter = "transpose=1,transpose=1";
  else if (degrees === 270) transposeFilter = "transpose=2";

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vf",
      transposeFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "copy",
      "-metadata:s:v:0",
      "rotate=0",
      rotatedPath
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));
    ffmpeg.on("close", (code) => {
      if (code === 0 && fs.existsSync(rotatedPath)) {
        stripMp4RotationMatrix(rotatedPath);
        resolve(rotatedPath);
      } else {
        reject(new Error(`Failed to rotate source video (${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}

export async function extractAudio(videoPath: string, outputAudioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 16kHz mono MP3, optimal for OpenAI Whisper / speech transcription
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-b:a",
      "64k",
      outputAudioPath
    ]);

    let errorOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputAudioPath)) {
        resolve();
      } else {
        reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${errorOutput}`));
      }
    });
  });
}

export interface DetectedSilence {
  start: number;
  end: number;
  duration: number;
}

/**
 * Measure the clip's loudness profile with ffmpeg `volumedetect`.
 * Used to set a silence gate relative to the recording's own noise floor
 * instead of a fixed dB value (quiet mic vs noisy room).
 */
export async function measureNoiseFloor(
  audioPath: string
): Promise<{ meanDb: number; maxDb: number }> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-i", audioPath, "-af", "volumedetect", "-f", "null", "-"]);
    let stderr = "";
    ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));
    ffmpeg.on("close", () => {
      const mean = stderr.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/);
      const max = stderr.match(/max_volume:\s*(-?[0-9.]+)\s*dB/);
      resolve({
        meanDb: mean ? parseFloat(mean[1]!) : -30,
        maxDb: max ? parseFloat(max[1]!) : -3
      });
    });
  });
}

export async function detectSilences(
  audioPath: string,
  minDurationSec = 0.7,
  noiseDb = -32
): Promise<DetectedSilence[]> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      audioPath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      "-f",
      "null",
      "-"
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0 && !stderr.includes("silence_")) {
        return reject(new Error(`ffmpeg silencedetect failed (code ${code}): ${stderr}`));
      }

      const silences: DetectedSilence[] = [];
      const silenceStartRegex = /silence_start:\s*([0-9.]+)/g;
      const silenceEndRegex = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;

      const starts: number[] = [];
      let match: RegExpExecArray | null;

      while ((match = silenceStartRegex.exec(stderr)) !== null) {
        const val = match[1];
        if (val) starts.push(parseFloat(val));
      }

      let i = 0;
      while ((match = silenceEndRegex.exec(stderr)) !== null) {
        const endStr = match[1];
        const durStr = match[2];
        if (!endStr || !durStr) continue;
        const end = parseFloat(endStr);
        const dur = parseFloat(durStr);
        const matchedStart = starts[i];
        const start = matchedStart !== undefined ? matchedStart : Math.max(0, end - dur);
        silences.push({
          start: Math.round(start * 1000) / 1000,
          end: Math.round(end * 1000) / 1000,
          duration: Math.round(dur * 1000) / 1000
        });
        i++;
      }

      resolve(silences);
    });
  });
}

export interface RenderBrollItem {
  assetPath: string;
  type: "image" | "video";
  start: number;
  end: number;
  position?: "center" | "pip" | "fullscreen";
}

export interface RenderOptions {
  makeVertical?: boolean;
  subtitlesPath?: string;
  brollOverlays?: RenderBrollItem[];
  studioAudio?: boolean;
  autoZoom?: boolean;
  transitionSfx?: boolean;
  backgroundMusicPath?: string;
  musicVolume?: number;
  faceGlow?: boolean;
  onProcess?: (proc: ChildProcess) => void;
}

export async function renderCuts(
  videoPath: string,
  keepSegments: Array<{ start: number; end: number }>,
  outputPath: string,
  options: RenderOptions = {}
): Promise<void> {
  // Filter out any zero-duration or micro segments (< 0.08s) that would yield 0 frames and fail concat (-22)
  const validKeepSegments = keepSegments.filter((seg) => seg.end - seg.start >= 0.08);
  if (validKeepSegments.length === 0) {
    throw new Error("Cannot render: keepSegments list is empty or all segments are too short (< 0.08s).");
  }

  const {
    makeVertical,
    subtitlesPath,
    brollOverlays = [],
    studioAudio = false,
    autoZoom = false,
    transitionSfx = false,
    backgroundMusicPath,
    musicVolume = 0.25,
    faceGlow = false
  } = options;

  // Filter valid existing broll files
  const validBroll = brollOverlays.filter((b) => fs.existsSync(b.assetPath));

  // Build input arguments
  const ffmpegArgs: string[] = ["-y", "-i", videoPath];

  validBroll.forEach((b) => {
    if (b.type === "image") {
      ffmpegArgs.push("-loop", "1", "-i", b.assetPath);
    } else {
      ffmpegArgs.push("-i", b.assetPath);
    }
  });

  // If transition SFX enabled, add synthetic whoosh sound as input
  let sfxInputIdx = -1;
  if (transitionSfx) {
    sfxInputIdx = validBroll.length + 1;
    ffmpegArgs.push(
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=420:duration=0.2,afade=t=in:ss=0:d=0.04,afade=t=out:st=0.12:d=0.08,volume=0.25"
    );
  }

  // If background music provided, loop it infinitely as an input
  let bgMusicInputIdx = -1;
  if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
    bgMusicInputIdx = ffmpegArgs.length > 0 ? (sfxInputIdx > 0 ? sfxInputIdx + 1 : validBroll.length + 1) : 1;
    ffmpegArgs.push("-stream_loop", "-1", "-i", backgroundMusicPath);
  }

  // Build trim & concat filters for input 0
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  validKeepSegments.forEach((seg, idx) => {
    const s = Math.max(0, seg.start).toFixed(3);
    const e = Math.max(0, seg.end).toFixed(3);

    // Apply Punch Zoom every alternate cut if autoZoom is enabled
    const shouldZoomThisCut = autoZoom && idx % 2 === 1 && seg.end - seg.start > 1.2;
    if (shouldZoomThisCut) {
      filterParts.push(
        `[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,crop=w='trunc(in_w*0.87/2)*2':h='trunc(in_h*0.87/2)*2',scale=w='trunc(in_w/0.87/2)*2':h='trunc(in_h/0.87/2)*2'[v${idx}]`
      );
    } else {
      filterParts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${idx}]`);
    }

    const segDur = seg.end - seg.start;
    const fadeDur = Math.min(0.008, segDur / 4);
    const fadeOutStart = Math.max(0, segDur - fadeDur).toFixed(3);
    if (segDur >= 0.04) {
      filterParts.push(
        `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,afade=t=in:ss=0:d=${fadeDur.toFixed(3)},afade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(3)}[a${idx}]`
      );
    } else {
      filterParts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${idx}]`);
    }
    concatInputs.push(`[v${idx}][a${idx}]`);
  });

  let currentVideoTag = "[outv]";
  let currentAudioTag = "[outa]";

  filterParts.push(
    `${concatInputs.join("")}concat=n=${validKeepSegments.length}:v=1:a=1${currentVideoTag}${currentAudioTag}`
  );

  // AI Studio Audio: podcast-style voice cleanup — rumble cut, spectral denoise,
  // gentle compression to even out level, de-ess, then broadcast loudness (-16 LUFS)
  // with a brickwall limiter so nothing clips.
  if (studioAudio) {
    const nextAudioTag = "[a_studio]";
    filterParts.push(
      `${currentAudioTag}highpass=f=80,` +
        `afftdn=nr=12:nf=-25,` +
        `acompressor=threshold=-18dB:ratio=3:attack=10:release=200:makeup=3,` +
        `deesser,` +
        `loudnorm=I=-16:TP=-1.5:LRA=11,` +
        `alimiter=limit=0.97${nextAudioTag}`
    );
    currentAudioTag = nextAudioTag;
  }

  // Transition Whoosh SFX: Mix whoosh sound at B-roll overlay cut-ins
  if (transitionSfx && sfxInputIdx > 0 && validBroll.length > 0) {
    let prevAud = currentAudioTag;
    validBroll.slice(0, 3).forEach((b, sfxIdx) => {
      const delayedSfx = `[sfx_delay_${sfxIdx}]`;
      const mixedAud = `[a_sfx_${sfxIdx}]`;
      const delayMs = Math.max(0, Math.round(b.start * 1000));
      filterParts.push(`[${sfxInputIdx}:a]adelay=${delayMs}|${delayMs}${delayedSfx}`);
      filterParts.push(`${prevAud}${delayedSfx}amix=inputs=2:duration=first:dropout_transition=0${mixedAud}`);
      prevAud = mixedAud;
    });
    currentAudioTag = prevAud;
  }

  // Smart Background Music with Audio Ducking (Sidechain Compression)
  if (bgMusicInputIdx > 0) {
    const vol = Math.max(0.05, Math.min(1.0, musicVolume)).toFixed(2);
    const finalMixedAudioTag = "[a_final_mix]";

    // Split voice to voice track and sidechain trigger
    filterParts.push(
      `${currentAudioTag}aformat=channel_layouts=stereo,asplit=2[voice_main][voice_sidechain]`,
      `[${bgMusicInputIdx}:a]aformat=channel_layouts=stereo,volume=${vol}[bg_vol]`,
      `[bg_vol][voice_sidechain]sidechaincompress=threshold=0.08:ratio=6:attack=15:release=250[bg_ducked]`,
      `[voice_main][bg_ducked]amix=inputs=2:duration=first:dropout_transition=0${finalMixedAudioTag}`
    );
    currentAudioTag = finalMixedAudioTag;
  }

  // 9:16 Vertical background blur
  if (makeVertical) {
    const nextTag = "[v_vert]";
    filterParts.push(
      `${currentVideoTag}split=2[v_bg_in][v_fg_in];` +
        `[v_bg_in]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[v_bg];` +
        `[v_fg_in]scale=1080:1920:force_original_aspect_ratio=decrease[v_fg];` +
        `[v_bg][v_fg]overlay=(W-w)/2:(H-h)/2${nextTag}`
    );
    currentVideoTag = nextTag;
  }

  // B-Roll Overlays — framed + animated in/out like CapCut / Captions.
  validBroll.forEach((b, idx) => {
    const inputIdx = idx + 1;
    const nextTag = `[v_broll_${idx}]`;
    const s = b.start.toFixed(2);
    const e = b.end.toFixed(2);
    const dur = Math.max(0.4, b.end - b.start);
    const durS = dur.toFixed(2);
    const pos = b.position || "center";
    const fullscreen = pos === "fullscreen";

    // 1. Size the raw asset (Ken Burns zoom for stills via a time-addressable crop).
    const sizeChain: string[] = ["trim=duration=" + durS, "setpts=PTS-STARTPTS"];
    if (b.type === "image") {
      const eased = `(0.5-0.5*cos(min(t/${durS}\\,1)*PI))`; // ease-in-out
      const zoom = idx % 2 === 0 ? `(1+0.10*${eased})` : `(1.10-0.10*${eased})`;
      sizeChain.push("scale=3400:-2", `crop=w='iw/${zoom}':h='ih/${zoom}':x='(iw-ow)/2':y='(ih-oh)/2'`);
    }
    if (fullscreen) {
      sizeChain.push("scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "setsar=1");
    } else {
      const w = pos === "pip" ? 440 : 860;
      sizeChain.push(
        `scale=${w}:-1:force_original_aspect_ratio=decrease`,
        "setsar=1",
        "pad=iw+10:ih+10:5:5:color=white" // sticker frame
      );
    }
    // 2. Alpha + entrance/exit fade.
    sizeChain.push(
      "format=yuva420p",
      "fade=t=in:st=0:d=0.22:alpha=1",
      `fade=t=out:st=${Math.max(0, dur - 0.2).toFixed(2)}:d=0.2:alpha=1`,
      `setpts=PTS-STARTPTS+${s}/TB`
    );

    const layerTag = `[broll_layer_${idx}]`;
    filterParts.push(`[${inputIdx}:v]${sizeChain.join(",")}${layerTag}`);

    if (fullscreen) {
      filterParts.push(
        `${currentVideoTag}${layerTag}overlay=0:0:enable='between(t,${s},${e})':eof_action=pass${nextTag}`
      );
      currentVideoTag = nextTag;
      return;
    }

    // 3. Base position, plus a slide in from a side and back out (alternating).
    const baseX = pos === "pip" ? "W-w-46" : "(W-w)/2";
    const baseY = pos === "pip" ? "H-h-250" : "(H-h)/3";
    const travel = `(max(0\\,1-(t-${s})/0.28)+max(0\\,((t-${s})-(${durS}-0.24))/0.24))`;
    const dist = "W*0.38";
    const dir = idx % 3;
    const x = dir === 2 ? baseX : `${baseX}${dir === 0 ? "+" : "-"}${dist}*${travel}`;
    const y = dir === 2 ? `${baseY}+${dist}*${travel}` : baseY;

    // 4. Soft drop shadow behind the frame, then the frame itself.
    const mnTag = `[broll_mn_${idx}]`;
    const shTag = `[broll_sh_${idx}]`;
    const shBlurTag = `[broll_shb_${idx}]`;
    const shadowedTag = `[v_broll_shadowed_${idx}]`;
    filterParts.push(
      `${layerTag}split=2${mnTag}${shTag}`,
      `${shTag}lutyuv=y=16:u=128:v=128,boxblur=9:2${shBlurTag}`,
      `${currentVideoTag}${shBlurTag}overlay=x='${x}+5':y='${y}+8':enable='between(t,${s},${e})':eof_action=pass${shadowedTag}`,
      `${shadowedTag}${mnTag}overlay=x='${x}':y='${y}':enable='between(t,${s},${e})':eof_action=pass${nextTag}`
    );
    currentVideoTag = nextTag;
  });

  // Auto Color Grade & Face Glow (Vibrant Skin Tone + Soft Contrast + Sharp Eyes)
  if (faceGlow) {
    const nextTag = "[v_glow]";
    filterParts.push(
      `${currentVideoTag}eq=contrast=1.07:brightness=0.03:saturation=1.12,unsharp=5:5:0.7:5:5:0.0${nextTag}`
    );
    currentVideoTag = nextTag;
  }

  // Subtitles
  if (subtitlesPath && fs.existsSync(subtitlesPath)) {
    const nextTag = "[v_sub]";
    const escapedSubPath = subtitlesPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filterParts.push(`${currentVideoTag}ass='${escapedSubPath}'${nextTag}`);
    currentVideoTag = nextTag;
  }

  const fullFilter = filterParts.join("; ");

  ffmpegArgs.push(
    "-filter_complex",
    fullFilter,
    "-map",
    currentVideoTag,
    "-map",
    currentAudioTag,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-metadata:s:v:0",
    "rotate=0",
    outputPath
  );

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    if (options.onProcess) {
      options.onProcess(ffmpeg);
    }

    let stderr = "";
    ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));

    ffmpeg.on("error", (error) => reject(new Error(`Could not start FFmpeg: ${error.message}`)));
    ffmpeg.on("close", (code, signal) => {
      // FFmpeg can catch SIGTERM and exit with code 0 or 255 instead of a signal.
      // A successfully delivered cancellation still wins over an apparently clean exit.
      if (signal === "SIGTERM" || signal === "SIGKILL" || ffmpeg.killed) {
        return reject(new Error("RENDER_CANCELLED"));
      }
      if (code === 0 && fs.existsSync(outputPath)) {
        stripMp4RotationMatrix(outputPath);
        resolve();
      } else {
        reject(new Error(`FFmpeg render failed (code ${code}): ${stderr.slice(-1000)}`));
      }
    });
  });
}

export async function extractCutAudio(
  videoPath: string,
  keepSegments: Array<{ start: number; end: number }>,
  outputPath: string
): Promise<void> {
  const validKeepSegments = keepSegments.filter((seg) => seg.end - seg.start >= 0.08);
  if (validKeepSegments.length === 0) {
    throw new Error("Cannot extract cut audio: keepSegments list is empty or all segments are too short (< 0.08s).");
  }

  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  validKeepSegments.forEach((seg, idx) => {
    const s = Math.max(0, seg.start).toFixed(3);
    const e = Math.max(0, seg.end).toFixed(3);
    const segDur = seg.end - seg.start;
    const fadeDur = Math.min(0.008, segDur / 4);
    const fadeOutStart = Math.max(0, segDur - fadeDur).toFixed(3);

    if (segDur >= 0.04) {
      filterParts.push(
        `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,afade=t=in:ss=0:d=${fadeDur.toFixed(3)},afade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(3)}[a${idx}]`
      );
    } else {
      filterParts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${idx}]`);
    }
    concatInputs.push(`[a${idx}]`);
  });

  filterParts.push(`${concatInputs.join("")}concat=n=${validKeepSegments.length}:v=0:a=1[outa]`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[outa]",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      outputPath
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));

    ffmpeg.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
      } else {
        reject(new Error(`FFmpeg cut audio extraction failed (code ${code}): ${stderr.slice(-1000)}`));
      }
    });
  });
}
