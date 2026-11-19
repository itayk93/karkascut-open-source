import { Router } from "express";
import path from "path";
import fs from "fs";
import { projectRepository } from "../repositories/projectRepository.js";
import { mainVideoUpload } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { rotateProjectSchema } from "../schemas/api.schemas.js";
import { getVideoDuration, getVideoMetadata } from "../services/ffmpeg.js";
import { ProcessingService, logProject } from "../services/processingService.js";
import { Project } from "../types.js";
import { generateId } from "../utils/id.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/api/projects", (_req, res) => {
  res.json(projectRepository.list());
});

router.get("/api/projects/:id", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
  res.json(project);
});

router.delete("/api/projects/:id", (req, res) => {
  const success = projectRepository.delete(String(req.params.id));
  if (!success) return res.status(404).json({ error: "פרויקט לא נמצא" });
  res.json({ success: true, message: "פרויקט נמחק בהצלחה" });
});

router.post("/api/projects/batch-delete", (req, res) => {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "לא סופקו מזהי פרויקטים למחיקה" });
  }

  let deletedCount = 0;
  for (const id of ids) {
    if (typeof id === "string" && projectRepository.delete(id)) {
      deletedCount++;
    }
  }

  res.json({ success: true, deletedCount, message: `${deletedCount} פרויקטים נמחקו בהצלחה` });
});

router.post("/api/upload", mainVideoUpload.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "לא נבחר קובץ וידאו" });

    const projectId = generateId("proj");
    const projectDir = projectRepository.getDir(projectId);

    const ext = path.extname(req.file.originalname).toLowerCase() || ".mp4";
    const targetVideoPath = path.join(projectDir, `original${ext}`);
    const targetAudioPath = path.join(projectDir, "audio.mp3");

    fs.copyFileSync(req.file.path, targetVideoPath);
    try {
      fs.unlinkSync(req.file.path);
    } catch {}

    const duration = await getVideoDuration(targetVideoPath);
    const meta = await getVideoMetadata(targetVideoPath);

    const project: Project = {
      id: projectId,
      originalFileName: req.file.originalname,
      originalFilePath: targetVideoPath,
      rawOriginalFilePath: targetVideoPath,
      audioFilePath: targetAudioPath,
      duration: Math.round(duration * 100) / 100,
      videoWidth: meta.width,
      videoHeight: meta.height,
      isVertical: meta.isVertical,
      status: "uploaded",
      logs: [
        `[${new Date().toTimeString().split(" ")[0]}] סרטון הועלה בהצלחה: ${req.file.originalname} (${duration.toFixed(1)}s, ${meta.width}x${meta.height}, ${meta.isVertical ? "סרטון לאורך 9:16" : "סרטון לרוחב 16:9"})`
      ],
      cuts: [],
      keepTimeline: [{ start: 0, end: duration }],
      assets: [],
      brollOverlays: [],
      renderPreferences: {
        makeVertical: meta.isVertical,
        burnCaptions: true,
        captionsStyle: "hormozi"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    projectRepository.save(project);
    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בהעלאה" });
  }
});

router.post("/api/projects/:id/eye-contact", async (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const isNvidia = Boolean(env.NVIDIA_API_KEY && env.NVIDIA_API_KEY.trim().length > 10);
  const engineName = isNvidia ? "NVIDIA Maxine NIM (GPU בענן)" : "AI OpenCV (מקומי)";
  project.status = "processing";
  project.processingStep = `מתקן קשר עין עם מצלמה בעזרת ${engineName}...`;
  logProject(project, `👁️ מפעיל תיקון קשר עין (Gaze Correction) באמצעות ${engineName}...`);
  projectRepository.save(project);

  res.status(202).json(project);
  ProcessingService.runEyeContact(project.id);
});

router.post("/api/projects/:id/rotate", validateBody(rotateProjectSchema), async (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const degrees = req.body.degrees as 90 | 180 | 270;
  project.status = "processing";
  project.processingStep = `מסובב את סרטון המקור ב-${degrees}° ומעדכן את הפיקסלים...`;
  logProject(project, `🔄 מסובב את סרטון המקור ב-${degrees}° באמצעות FFmpeg...`);
  projectRepository.save(project);

  res.status(202).json(project);
  ProcessingService.rotateVideo(project.id, degrees);
});

export default router;
