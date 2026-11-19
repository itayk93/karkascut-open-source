import { Router } from "express";
import path from "path";
import fs from "fs";
import { projectRepository } from "../repositories/projectRepository.js";
import { computeKeepTimeline, calculateProjectStats, mergeOverlappingCuts } from "../services/timeline.js";
import { generateHormoziAssSubtitles } from "../services/subtitles.js";
import { logProject } from "../services/processingService.js";
import { validateBody } from "../middleware/validate.js";
import { updateCutsSchema, updateTranscriptSchema } from "../schemas/api.schemas.js";
import { CutSegment, Word } from "../types.js";
import { analyzeSegmentForDeadTime, refineLongCuts } from "../services/aiEditor.js";
import { detectSilences, measureNoiseFloor } from "../services/ffmpeg.js";
import { env } from "../config/env.js";
import { excludeSpeechFromSilence } from "../services/speechProtection.js";
import { detectSpeechSilences } from "../services/acousticAnalysis.js";

interface SegmentSubCut {
  start: number;
  end: number;
  type: "filler" | "false_start" | "retake" | "repetition" | "correction" | "dead_content";
  confidence: number;
  reason: string;
  text: string;
}

/** Silence inside the window, shortened to a natural pause (same as the main pipeline). */
async function detectSegmentSilenceCuts(audioPath: string, winStart: number, winEnd: number, words: Word[]): Promise<SegmentSubCut[]> {
  if (!audioPath || !fs.existsSync(audioPath)) return [];
  try {
    const pad = env.SILENCE_PAD_SECONDS;
    const toSubCut = (s: { start: number; end: number; duration: number }) => {
      const cs = Math.max(winStart, Math.round((s.start + pad / 2) * 1000) / 1000);
      const ce = Math.min(winEnd, Math.round((s.end - pad / 2) * 1000) / 1000);
      return {
        start: cs,
        end: ce,
        type: "dead_content" as const,
        confidence: 1,
        reason: `קיצור שקט (${s.duration.toFixed(1)}s) להפוגה טבעית`,
        text: "[שקט]"
      };
    };

    // VAD path: speech position is measured from the audio, so no transcript
    // protection is needed and a wrong ASR timestamp cannot mask a real pause.
    const acoustic = await detectSpeechSilences(audioPath, words, env.SILENCE_THRESHOLD_SECONDS);
    if (acoustic) {
      return acoustic.silences
        .filter((s) => s.end > winStart + 0.05 && s.start < winEnd - 0.05)
        .map(toSubCut)
        .filter((c) => c.end - c.start >= 0.15);
    }

    const { meanDb } = await measureNoiseFloor(audioPath);
    const noiseDb = Math.max(
      env.SILENCE_NOISE_FLOOR_DB,
      Math.min(env.SILENCE_NOISE_CEIL_DB, Math.round(meanDb + env.SILENCE_NOISE_MARGIN_DB))
    );
    const silences = await detectSilences(audioPath, env.SILENCE_THRESHOLD_SECONDS, noiseDb);
    return excludeSpeechFromSilence(silences
      .filter((s) => s.end > winStart + 0.05 && s.start < winEnd - 0.05)
      .map(toSubCut)
      .filter((c) => c.end - c.start >= 0.15), words);
  } catch (err) {
    console.error("Segment silence detection failed:", err);
    return [];
  }
}

const router = Router();

router.post("/api/projects/:id/cuts/reanalyze-segment", async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    const start = Number(req.body?.start);
    const end = Number(req.body?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.15) {
      return res.status(400).json({ error: "טווח מקטע לא תקין לניתוח מחודש" });
    }

    const words = (project.transcript?.words || []) as Word[];

    const customKey = (
      (req.headers["x-openai-key"] as string) ||
      req.body?.apiKey ||
      env.OPENAI_API_KEY ||
      ""
    ).trim();

    const [analysis, silenceCuts] = await Promise.all([
      words.length > 0
        ? analyzeSegmentForDeadTime(words, start, end, customKey, project.originalScript)
        : Promise.resolve({ cuts: [] as SegmentSubCut[], usedAI: false, aiUnavailableReason: "no_transcript" as const }),
      detectSegmentSilenceCuts(project.audioFilePath, start, end, words)
    ]);

    // Merge silence + AI cuts, then collapse overlaps so the list the user sees
    // is a clean set of non-redundant pieces (not 5 stacked cuts for one span).
    const all = [...silenceCuts, ...(analysis.cuts as SegmentSubCut[])].sort(
      (a, b) => a.start - b.start || b.end - a.end
    );
    const merged: SegmentSubCut[] = [];
    for (const c of all) {
      const prev = merged[merged.length - 1];
      if (prev && c.start <= prev.end - 0.1) {
        // overlapping — extend the previous piece, keep the more meaningful label
        if (c.end > prev.end) prev.end = c.end;
        if (prev.type === "dead_content" && c.type !== "dead_content") {
          prev.type = c.type;
          prev.reason = c.reason;
        }
      } else {
        merged.push({ ...c });
      }
    }

    logProject(
      project,
      `ניתוח מחודש של מקטע [${start.toFixed(1)}s - ${end.toFixed(1)}s]: ${merged.length} חתכים ` +
        `(${silenceCuts.length} שקט${analysis.usedAI ? " + AI" : ""}).`
    );

    res.json({ subCuts: merged, usedAI: analysis.usedAI, aiUnavailableReason: analysis.aiUnavailableReason });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בניתוח מחודש של המקטע" });
  }
});

/** Re-run focused fine-tuning on every long cut in the project and split the blobs. */
router.post("/api/projects/:id/refine-cuts", async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    const words = (project.transcript?.words || []) as Word[];
    const customKey = ((req.headers["x-openai-key"] as string) || req.body?.apiKey || env.OPENAI_API_KEY || "").trim();
    const minSec = Number(req.body?.minSec) > 0 ? Number(req.body.minSec) : env.REFINE_MIN_SEC;

    let silences: Awaited<ReturnType<typeof detectSilences>> = [];
    try {
      if (project.audioFilePath && fs.existsSync(project.audioFilePath)) {
        const acoustic = await detectSpeechSilences(project.audioFilePath, words, env.SILENCE_THRESHOLD_SECONDS);
        if (acoustic) {
          silences = acoustic.silences;
        } else {
          const { meanDb } = await measureNoiseFloor(project.audioFilePath);
          const noiseDb = Math.max(
            env.SILENCE_NOISE_FLOOR_DB,
            Math.min(env.SILENCE_NOISE_CEIL_DB, Math.round(meanDb + env.SILENCE_NOISE_MARGIN_DB))
          );
          silences = await detectSilences(project.audioFilePath, env.SILENCE_THRESHOLD_SECONDS, noiseDb);
        }
      }
    } catch (e) {
      console.error("refine-cuts silence scan failed:", e);
    }

    const refined = await refineLongCuts(project.cuts, words, silences, minSec, customKey, project.originalScript);
    project.cuts = mergeOverlappingCuts(refined.cuts).sort((a, b) => a.start - b.start);

    const keepTimeline = computeKeepTimeline(project.duration, project.cuts);
    project.keepTimeline = keepTimeline;
    project.stats = calculateProjectStats(project.duration, project.cuts, keepTimeline);
    logProject(
      project,
      `עידון אוטומטי של חתכים ארוכים: ${refined.refinedCount} פוצלו, ${refined.restoredSeconds}s חזרו לסרטון.`
    );
    projectRepository.save(project);

    res.json({ project, refinedCount: refined.refinedCount, restoredSeconds: refined.restoredSeconds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בעידון חתכים" });
  }
});

router.put("/api/projects/:id/cuts", validateBody(updateCutsSchema), async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    const rawCuts = req.body.cuts as CutSegment[];
    const cuts = mergeOverlappingCuts(rawCuts);
    project.cuts = cuts;
    const keepTimeline = computeKeepTimeline(project.duration, project.cuts);
    const stats = calculateProjectStats(project.duration, project.cuts, keepTimeline);

    project.keepTimeline = keepTimeline;
    project.stats = stats;
    logProject(project, `עודכנו ${cuts.length} מקטעים ע"י המשתמש`);
    projectRepository.save(project);

    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בעדכון מקטעים" });
  }
});

router.post("/api/projects/:id/cuts/:cutId/toggle", async (req, res) => {
  try {
    const project = projectRepository.get(String(req.params.id));
    if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

    const cut = project.cuts.find((c) => c.id === req.params.cutId);
    if (!cut) return res.status(404).json({ error: "מקטע חיתוך לא נמצא" });

    cut.status = cut.status === "cut" ? "restored" : "cut";
    logProject(project, `מקטע [${cut.start}s - ${cut.end}s] שונה ל-${cut.status === "restored" ? "משוחזר" : "נחתך"}`);

    const keepTimeline = computeKeepTimeline(project.duration, project.cuts);
    const stats = calculateProjectStats(project.duration, project.cuts, keepTimeline);

    project.keepTimeline = keepTimeline;
    project.stats = stats;
    projectRepository.save(project);

    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message || "שגיאה בעדכון מקטע" });
  }
});

router.put("/api/projects/:id/transcript", validateBody(updateTranscriptSchema), (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).json({ error: "פרויקט לא נמצא" });

  const words = req.body.words as Word[];
  const text = words.map((w) => w.word).join(" ");
  project.transcript = {
    text,
    words
  };

  const projectDir = projectRepository.getDir(project.id);
  fs.writeFileSync(path.join(projectDir, "transcript.json"), JSON.stringify(project.transcript, null, 2));

  if (project.keepTimeline && project.keepTimeline.length > 0) {
    const subPath = path.join(projectDir, "subtitles.ass");
    generateHormoziAssSubtitles(words, project.keepTimeline, subPath, 1080, 1920);
  }

  logProject(project, `תמלול עודכן ידנית: תוקנו מילים וכתוביות Hormozi`);
  projectRepository.save(project);
  res.json(project);
});

export default router;
