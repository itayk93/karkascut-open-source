import { Router } from "express";
import { projectRepository } from "../repositories/projectRepository.js";
import { jobManager } from "../services/jobManager.js";
import { ProcessingService, logProject } from "../services/processingService.js";
import { validateBody } from "../middleware/validate.js";
import { processProjectSchema, renderProjectSchema } from "../schemas/api.schemas.js";

import { env } from "../config/env.js";
import { validateOpenAiKey } from "../services/openaiHealth.js";

const router = Router();

router.post("/api/projects/:id/process", validateBody(processProjectSchema), async (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const customKey = (
    (req.headers["x-openai-key"] as string) ||
    req.body?.apiKey ||
    env.OPENAI_API_KEY ||
    ""
  ).trim();

  // Pre-flight: refuse to start (and never flip the project into "processing")
  // if the OpenAI key is missing/invalid — otherwise it fails mid-pipeline
  // and the project gets stuck.
  const keyCheck = await validateOpenAiKey(customKey || undefined);
  if (!keyCheck.valid) {
    return res.status(400).json({ error: keyCheck.error || "מפתח OpenAI API לא תקין" });
  }

  if (req.body?.renderPreferences) {
    project.renderPreferences = { ...project.renderPreferences, ...req.body.renderPreferences };
  }

  if (typeof req.body?.originalScript === "string") {
    project.originalScript = req.body.originalScript.trim();
  }

  project.status = "processing";
  project.processingStep = "מאתחל תהליך עריכה אוטומטי...";
  logProject(
    project,
    project.originalScript ? "מאתחל תהליך עיבוד AI (עם סקריפט מקור להשוואה)..." : "מאתחל תהליך עיבוד AI...",
    1
  );
  projectRepository.save(project);

  res.status(202).json(project);

  ProcessingService.runPipeline(project.id, {
    apiKey: customKey,
    originalScript: project.originalScript,
    renderPreferences: project.renderPreferences
  });
});

router.post("/api/projects/:id/render", validateBody(renderProjectSchema), async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    if (req.body?.renderPreferences) {
      project.renderPreferences = { ...project.renderPreferences, ...req.body.renderPreferences };
    }

    project.status = "processing";
    project.processingStep = "מרנדר תצוגה מקדימה מעודכנת עם שכבות B-Roll...";
    logProject(project, "מרנדר מחדש תצוגה מקדימה (9:16, כתוביות ושכבת B-Roll)...");
    projectRepository.save(project);

    res.status(202).json(project);

    ProcessingService.reRenderPreview(project.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה ברינדור" });
  }
});

router.post("/api/projects/:id/cancel", async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    jobManager.cancel(project.id);

    project.status = "ready";
    project.processingStep = undefined;
    logProject(project, "🛑 פעולת העיבוד/רינדור נעצרה על ידי המשתמש.");
    projectRepository.save(project);

    res.json({ success: true, project });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בביטול הפעולה" });
  }
});

export default router;
