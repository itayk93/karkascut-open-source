import { Router } from "express";
import path from "path";
import { projectRepository } from "../repositories/projectRepository.js";
import { assetUpload } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { updateBrollOverlaysSchema } from "../schemas/api.schemas.js";
import { getVideoDuration } from "../services/ffmpeg.js";
import { autoMatchBrollWithAI } from "../services/brollMatcher.js";
import { logProject } from "../services/processingService.js";
import { BrollAsset, BrollOverlay } from "../types.js";
import { generateId } from "../utils/id.js";
import { env } from "../config/env.js";

const router = Router();

router.post("/api/projects/:id/assets", assetUpload.single("asset"), async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });
    if (!req.file) return res.status(400).json({ error: "לא נבחר קובץ נכס B-Roll" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const isVideo = [".mp4", ".mov", ".webm", ".mkv"].includes(ext);

    const assetId = generateId("asset");
    const newAsset: BrollAsset = {
      id: assetId,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileUrl: `/media/projects/${project.id}/assets/${path.basename(req.file.path)}`,
      type: isVideo ? "video" : "image",
      title: req.body?.title || req.file.originalname
    };

    if (isVideo) {
      try {
        newAsset.duration = await getVideoDuration(req.file.path);
      } catch {}
    }

    if (!project.assets) project.assets = [];
    project.assets.push(newAsset);
    logProject(project, `הועלה נכס B-Roll חדש: ${newAsset.fileName} (${newAsset.type})`);
    projectRepository.save(project);

    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בהעלאת נכס B-Roll" });
  }
});

router.patch("/api/projects/:id/assets/:assetId", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const asset = (project.assets || []).find((a) => a.id === req.params.assetId);
  if (!asset) return res.status(404).json({ error: "נכס B-Roll לא נמצא" });

  if (typeof req.body?.placementHint === "string") {
    asset.placementHint = req.body.placementHint.trim().slice(0, 400) || undefined;
  }
  if (typeof req.body?.title === "string" && req.body.title.trim()) {
    asset.title = req.body.title.trim().slice(0, 200);
  }

  projectRepository.save(project);
  res.json(project);
});

router.delete("/api/projects/:id/assets/:assetId", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  project.assets = (project.assets || []).filter((a) => a.id !== req.params.assetId);
  project.brollOverlays = (project.brollOverlays || []).filter((o) => o.assetId !== req.params.assetId);

  logProject(project, "נכס B-Roll נמחק");
  projectRepository.save(project);
  res.json(project);
});

router.post("/api/projects/:id/broll/auto-match", async (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  if (!project.assets || project.assets.length === 0) {
    return res.status(400).json({ error: "אין נכסי B-Roll זמינים בפרויקט זה" });
  }
  if (!project.transcript || project.transcript.words.length === 0) {
    return res.status(400).json({ error: "טרם בוצע תמלול לווידאו" });
  }

  const customKey = ((req.headers["x-openai-key"] as string) || env.OPENAI_API_KEY).trim();

  logProject(project, `מנתח תמלול ומשבץ אוטומטית ${project.assets.length} נכסי B-Roll עם AI...`);

  try {
    const overlays = await autoMatchBrollWithAI(
      project.transcript.words,
      project.keepTimeline,
      project.assets,
      customKey
    );

    project.brollOverlays = overlays;
    logProject(project, `ה-AI שיבץ בהצלחה ${overlays.length} מקטעי B-Roll לפי התמלול!`);
    projectRepository.save(project);
    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בשיבוץ B-Roll" });
  }
});

router.put("/api/projects/:id/broll", validateBody(updateBrollOverlaysSchema), (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const overlays = req.body.overlays as BrollOverlay[];
  project.brollOverlays = overlays;
  logProject(project, `עודכנו ${overlays.length} שיבוצי B-Roll בשכבת המדיה`);
  projectRepository.save(project);
  res.json(project);
});

export default router;
