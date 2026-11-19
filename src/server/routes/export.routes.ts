import { Router } from "express";
import path from "path";
import { projectRepository } from "../repositories/projectRepository.js";
import { generatePremiereXml } from "../services/exportXml.js";
import { generateHormoziAssSubtitles } from "../services/subtitles.js";
import { ProcessingService, logProject } from "../services/processingService.js";
import { validateBody } from "../middleware/validate.js";
import { renderProjectSchema, importJsonSchema } from "../schemas/api.schemas.js";
import { Project } from "../types.js";

const router = Router();

router.get("/api/projects/:id/export-json", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  res.setHeader("Content-Disposition", `attachment; filename="autocut_plan_${project.id}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.json(project);
});

router.post("/api/projects/:id/import-json", validateBody(importJsonSchema), (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const imported = req.body as Partial<Project>;

  if (Array.isArray(imported.cuts)) project.cuts = imported.cuts;
  if (Array.isArray(imported.keepTimeline)) project.keepTimeline = imported.keepTimeline;
  if (Array.isArray(imported.brollOverlays)) project.brollOverlays = imported.brollOverlays;
  if (imported.transcript && Array.isArray(imported.transcript.words)) {
    project.transcript = imported.transcript;
  }
  if (imported.renderPreferences) {
    project.renderPreferences = imported.renderPreferences;
  }
  if (imported.stats) {
    project.stats = imported.stats;
  }

  if (project.transcript && project.keepTimeline) {
    const projectDir = projectRepository.getDir(project.id);
    const subPath = path.join(projectDir, "subtitles.ass");
    generateHormoziAssSubtitles(project.transcript.words, project.keepTimeline, subPath, 1080, 1920);
  }

  logProject(project, "תוכנית עריכה מיובאת נטענה בהצלחה מ-JSON!");
  projectRepository.save(project);
  res.json(project);
});

router.get("/api/projects/:id/export-premiere-xml", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const xmlContent = generatePremiereXml(project);
  const safeName = project.originalFileName.replace(/\.[^/.]+$/, "");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}_premiere.xml"`);
  res.setHeader("Content-Type", "application/xml");
  res.send(xmlContent);
});

router.post("/api/projects/:id/export", validateBody(renderProjectSchema), async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    if (req.body?.renderPreferences) {
      project.renderPreferences = { ...project.renderPreferences, ...req.body.renderPreferences };
    }

    project.status = "exporting";
    project.processingStep = "מייצא וידאו סופי 9:16 לאורך עם כתוביות ו-B-Roll...";
    logProject(project, "מתחיל ייצוא וידאו סופי (9:16 + כתוביות + B-Roll Overlays)...");
    projectRepository.save(project);

    res.status(202).json(project);

    ProcessingService.exportFinalVideo(project.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בהפעלת ייצוא" });
  }
});

export default router;
