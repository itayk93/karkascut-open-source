import path from "path";
import fs from "fs";
import { Project, RenderPreferences } from "../types.js";
import { projectRepository } from "../repositories/projectRepository.js";
import { jobManager } from "./jobManager.js";
import {
  extractAudio,
  extractCutAudio,
  detectSilences,
  measureNoiseFloor,
  getVideoMetadata,
  rotateSourceVideo,
  renderCuts,
  RenderBrollItem
} from "./ffmpeg.js";
import { transcribeAudio } from "./transcription.js";
import { detectSpeechSilences } from "./acousticAnalysis.js";
import type { DetectedSilence } from "./ffmpeg.js";
import { analyzeTranscriptWithAI, refineLongCuts } from "./aiEditor.js";
import { buildCutSegments, computeKeepTimeline, calculateProjectStats, mergeOverlappingCuts } from "./timeline.js";
import { generateHormoziAssSubtitles } from "./subtitles.js";
import { runEyeContactCorrection } from "./eyeContact.js";
import { generateId } from "../utils/id.js";
import { env } from "../config/env.js";

export function logProject(project: Project, msg: string, stepIndex?: number): void {
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];
  if (!project.logs) project.logs = [];
  project.logs.push(`[${timeStr}] ${msg}`);
  if (stepIndex !== undefined) {
    project.currentStepIndex = stepIndex;
  }
  projectRepository.save(project);
}

export function getRenderBrollItems(project: Project): RenderBrollItem[] {
  if (!project.brollOverlays || !project.assets) return [];
  const assetMap = new Map(project.assets.map((a) => [a.id, a]));
  const items: RenderBrollItem[] = [];

  for (const o of project.brollOverlays) {
    const asset = assetMap.get(o.assetId);
    if (asset && fs.existsSync(asset.filePath)) {
      items.push({
        assetPath: asset.filePath,
        type: asset.type,
        start: o.start,
        end: o.end,
        position: o.position || "center"
      });
    }
  }
  return items;
}

export function getBackgroundMusicPath(project: Project): string | undefined {
  const music = project.renderPreferences?.backgroundMusic;
  if (!music || !music.enabled) return undefined;
  const trackId = music.trackId || "lofi_chill";
  const p = path.resolve(process.cwd(), `assets/audio/${trackId}.mp3`);
  return fs.existsSync(p) ? p : undefined;
}

export class ProcessingService {
  static async runPipeline(
    projectId: string,
    options: {
      apiKey?: string;
      originalScript?: string;
      renderPreferences?: RenderPreferences;
    }
  ): Promise<void> {
    const project = projectRepository.get(projectId);
    if (!project) return;

    try {
      const projectDir = projectRepository.getDir(project.id);
      const effectiveKey = (options.apiKey || env.OPENAI_API_KEY).trim();

      // Step 1: Extract Audio
      project.processingStep = "שלב 1 מתוך 5: מחלץ אודיו באמצעות FFmpeg...";
      logProject(project, "חילוץ אודיו 16kHz Mono MP3 עם FFmpeg...", 1);
      await extractAudio(project.originalFilePath, project.audioFilePath);
      logProject(project, "חילוץ אודיו הושלם בהצלחה.", 1);

      // Step 2: OpenAI Transcription
      project.processingStep = "שלב 2 מתוך 5: מתמלל דיבור ומפיק זמני מילים ב-OpenAI...";
      logProject(
        project,
        `שולח אודיו לתמלול מילים מדויק (${env.OPENAI_TRANSCRIBE_MODEL})...`,
        2
      );
      const transcript = await transcribeAudio(project.audioFilePath, effectiveKey, project.originalScript);
      project.transcript = transcript;
      fs.writeFileSync(path.join(projectDir, "transcript.json"), JSON.stringify(transcript, null, 2));
      logProject(project, `תמלול הסתיים: זוהו ${transcript.words.length} מילים עם חותמות זמן.`, 2);

      // Step 3: Detect Silences with FFmpeg
      project.processingStep = "שלב 3 מתוך 5: מזהה שתיקות באמצעות FFmpeg...";
      const silenceThreshold = env.SILENCE_THRESHOLD_SECONDS;
      const silencePad = env.SILENCE_PAD_SECONDS;

      // Prefer acoustic speech detection (Silero VAD): the pause is measured from
      // the audio itself, never inferred from a possibly-wrong ASR timestamp.
      let silences: DetectedSilence[];
      const acoustic = await detectSpeechSilences(project.audioFilePath, transcript.words, silenceThreshold);
      if (acoustic) {
        silences = acoustic.silences;
        logProject(
          project,
          `זיהוי דיבור אקוסטי (${acoustic.analysis.vadModel}): ${silences.length} שתיקות ארוכות, ` +
            `${acoustic.analysis.alignedCount}/${acoustic.analysis.totalWords} מילים יושרו לאודיו.`,
          3
        );
      } else {
        // Noise-floor-relative silence gate: adapt to this clip's own loudness
        const { meanDb, maxDb } = await measureNoiseFloor(project.audioFilePath);
        const noiseDb = Math.max(
          env.SILENCE_NOISE_FLOOR_DB,
          Math.min(env.SILENCE_NOISE_CEIL_DB, Math.round(meanDb + env.SILENCE_NOISE_MARGIN_DB))
        );
        logProject(
          project,
          `רמות אודיו: ממוצע ${meanDb.toFixed(1)}dB, שיא ${maxDb.toFixed(1)}dB → סף שקט מותאם ${noiseDb}dB`,
          3
        );
        logProject(project, `סורק שתיקות עם FFmpeg (סף: >${silenceThreshold}s @ ${noiseDb}dB)...`, 3);
        silences = await detectSilences(project.audioFilePath, silenceThreshold, noiseDb);
        logProject(project, `זוהו ${silences.length} שתיקות ארוכות.`, 3);
      }

      // Step 4: OpenAI Semantic AI Editor
      project.processingStep = "שלב 4 מתוך 5: עורך AI מנתח גמגומים, טייקים חוזרים וטעויות...";
      logProject(
        project,
        `מפעיל OpenAI Semantic Editor (${env.OPENAI_EDITOR_MODEL})${project.originalScript ? " בהשוואה לסקריפט המקורי" : ""}...`,
        4
      );
      logProject(
        project,
        project.originalScript
          ? "מיישר את התמלול מול הסקריפט המתוכנן (keep-last-take) + מחלק לחלונות חופפים..."
          : "מחלק את התמלול לחלונות חופפים (90s) לניתוח ממוקד ומדויק יותר...",
        4
      );
      const aiCuts = await analyzeTranscriptWithAI(transcript.words, effectiveKey, project.originalScript);
      logProject(project, `עורך ה-AI + דטקטורים דטרמיניסטיים זיהו ${aiCuts.length} מקטעים למחיקה.`, 4);

      // Step 5: Build Cuts, Subtitles & Render
      project.processingStep = "שלב 5 מתוך 5: מחשב כתוביות Hormozi, פורמט 9:16 ומרנדר וידאו...";
      logProject(
        project,
        `מחשב מרווחי ביטחון (Cut Padding ${env.CUT_PADDING_MS}ms / גבול משפט ${env.CUT_PADDING_BOUNDARY_MS}ms) וציר מקטעי KEEP...`,
        5
      );

      const cutPaddingMs = env.CUT_PADDING_MS;
      const confThreshold = env.CONFIDENCE_THRESHOLD_AUTO;

      let cuts = buildCutSegments(
        project.duration,
        silences,
        aiCuts,
        silenceThreshold,
        silencePad,
        cutPaddingMs,
        confThreshold,
        env.SILENCE_PAD_SENTENCE_SECONDS,
        env.CUT_PADDING_BOUNDARY_MS
      );

      if (env.REFINE_LONG_CUTS) {
        const longCount = cuts.filter((c) => c.status === "cut" && c.end - c.start >= env.REFINE_MIN_SEC).length;
        if (longCount > 0) {
          logProject(project, `מריץ fine-tuning אוטומטי על ${longCount} חתכים ארוכים (>${env.REFINE_MIN_SEC}s)...`, 5);
          const refined = await refineLongCuts(
            cuts,
            transcript.words,
            silences,
            env.REFINE_MIN_SEC,
            effectiveKey,
            project.originalScript
          );
          cuts = mergeOverlappingCuts(refined.cuts).sort((a, b) => a.start - b.start);
          if (refined.refinedCount > 0) {
            logProject(
              project,
              `עידון הושלם: ${refined.refinedCount} חתכים פוצלו, ${refined.restoredSeconds}s של תוכן תקין חזרו לסרטון.`,
              5
            );
          }
        }
      }

      const keepTimeline = computeKeepTimeline(project.duration, cuts);
      const stats = calculateProjectStats(project.duration, cuts, keepTimeline);

      project.cuts = cuts;
      project.keepTimeline = keepTimeline;
      project.stats = stats;

      const subPath = path.join(projectDir, "subtitles.ass");
      const prefs = project.renderPreferences || {
        makeVertical: true,
        burnCaptions: true,
        captionsStyle: "hormozi",
        studioAudio: false,
        autoZoom: false,
        transitionSfx: false
      };

      // Extract clean cut audio and transcribe it directly for 100% accurate subtitles
      let cleanWords = undefined;
      const cutAudioPath = path.join(projectDir, "cut_audio.mp3");

      try {
        logProject(project, "מחלץ אודיו ערוך (Post-Cut Audio) לתמלול כתוביות מדויק...", 5);
        await extractCutAudio(project.originalFilePath, keepTimeline, cutAudioPath);
        logProject(project, "מתמלל את האודיו החתוך והסופי (סנכרון 1:1 ללא סטיות זמנים)...", 5);
        const cutTranscript = await transcribeAudio(cutAudioPath, effectiveKey, project.originalScript);
        project.cleanTranscript = cutTranscript;
        fs.writeFileSync(path.join(projectDir, "cut_transcript.json"), JSON.stringify(cutTranscript, null, 2));
        cleanWords = cutTranscript.words;
        logProject(project, `כתוביות חולצו ישירות מהאודיו הערוך (${cleanWords.length} מילים בסנכרון מושלם).`, 5);
      } catch (subErr) {
        console.warn(`[${project.id}] Post-cut audio transcription failed, falling back to mapped transcript:`, subErr);
      }

      if (cleanWords && cleanWords.length > 0) {
        generateHormoziAssSubtitles(
          cleanWords,
          undefined,
          subPath,
          1080,
          1920,
          prefs.captionsStyle || "hormozi"
        );
      } else {
        generateHormoziAssSubtitles(
          transcript.words,
          keepTimeline,
          subPath,
          1080,
          1920,
          prefs.captionsStyle || "hormozi"
        );
      }
      logProject(project, `נוצרו כתוביות מונפשות (סגנון: ${prefs.captionsStyle || "hormozi"}).`, 5);

      const previewPath = path.join(projectDir, "preview.mp4");
      logProject(
        project,
        `מרנדר וידאו (9:16: ${prefs.makeVertical ? "כן" : "לא"} | סאונד אולפן: ${prefs.studioAudio ? "כן" : "לא"} | זום חכם: ${prefs.autoZoom ? "כן" : "לא"} | אפקטי SFX: ${prefs.transitionSfx ? "כן" : "לא"})...`,
        5
      );

      await renderCuts(project.originalFilePath, keepTimeline, previewPath, {
        makeVertical: prefs.makeVertical,
        subtitlesPath: prefs.burnCaptions ? subPath : undefined,
        brollOverlays: getRenderBrollItems(project),
        studioAudio: prefs.studioAudio,
        autoZoom: prefs.autoZoom,
        transitionSfx: prefs.transitionSfx,
        backgroundMusicPath: getBackgroundMusicPath(project),
        musicVolume: prefs.backgroundMusic?.volume ?? 0.25,
        faceGlow: prefs.faceGlow,
        onProcess: (proc) => {
          jobManager.register(project.id, () => {
            try {
              proc.kill("SIGTERM");
            } catch {}
            try {
              proc.kill("SIGKILL");
            } catch {}
          });
        }
      });

      jobManager.unregister(project.id);
      project.previewVideoPath = previewPath;
      project.status = "ready";
      project.processingStep = undefined;
      project.currentStepIndex = undefined;
      project.errorMessage = undefined;
      logProject(
        project,
        `🎉 הושלם בהצלחה! משך מקורי: ${stats.originalDuration}s, ערוך: ${stats.cleanedDuration}s (נחסכו ${stats.totalRemovedSeconds}s).`
      );
      projectRepository.save(project);
    } catch (err: unknown) {
      jobManager.unregister(project.id);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${project.id}] Pipeline failed:`, message);
      project.status = "error";
      project.errorMessage = message || "שגיאה בעיבוד הסרטון";
      project.processingStep = undefined;
      project.currentStepIndex = undefined;
      logProject(project, `❌ שגיאה: ${message || "שגיאה לא ידועה"}`);
      projectRepository.save(project);
    }
  }

  static async reRenderPreview(projectId: string): Promise<void> {
    const project = projectRepository.get(projectId);
    if (!project) return;

    try {
      const projectDir = projectRepository.getDir(project.id);
      const previewPath = path.join(projectDir, "preview.mp4");
      const keepTimeline = computeKeepTimeline(project.duration, project.cuts);

      let subPath: string | undefined = undefined;
      const prefs = project.renderPreferences || {
        makeVertical: true,
        burnCaptions: true,
        captionsStyle: "hormozi" as const,
        studioAudio: false,
        autoZoom: false,
        transitionSfx: false
      };

      if (prefs.burnCaptions) {
        subPath = path.join(projectDir, "subtitles.ass");
        if (project.cleanTranscript && project.cleanTranscript.words.length > 0) {
          generateHormoziAssSubtitles(
            project.cleanTranscript.words,
            undefined,
            subPath,
            1080,
            1920,
            prefs.captionsStyle || "hormozi"
          );
        } else if (project.transcript) {
          generateHormoziAssSubtitles(
            project.transcript.words,
            keepTimeline,
            subPath,
            1080,
            1920,
            prefs.captionsStyle || "hormozi"
          );
        }
      }

      await renderCuts(project.originalFilePath, keepTimeline, previewPath, {
        makeVertical: prefs.makeVertical ?? true,
        subtitlesPath: subPath,
        brollOverlays: getRenderBrollItems(project),
        studioAudio: prefs.studioAudio,
        autoZoom: prefs.autoZoom,
        transitionSfx: prefs.transitionSfx,
        backgroundMusicPath: getBackgroundMusicPath(project),
        musicVolume: prefs.backgroundMusic?.volume ?? 0.25,
        faceGlow: prefs.faceGlow,
        onProcess: (proc) => {
          jobManager.register(project.id, () => {
            try {
              proc.kill("SIGTERM");
            } catch {}
            try {
              proc.kill("SIGKILL");
            } catch {}
          });
        }
      });

      jobManager.unregister(project.id);
      project.previewVideoPath = previewPath;
      project.status = "ready";
      project.processingStep = undefined;
      logProject(project, "תצוגה מקדימה עודכנה ורונדרה בהצלחה!");
      projectRepository.save(project);
    } catch (err: unknown) {
      jobManager.unregister(project.id);
      project.status = "ready";
      project.processingStep = undefined;
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RENDER_CANCELLED") {
        logProject(project, "🛑 הרינדור בוטל על ידי המשתמש.");
      } else {
        project.errorMessage = `שגיאה ברינדור: ${message}`;
        logProject(project, `שגיאה ברינדור: ${message}`);
      }
      projectRepository.save(project);
    }
  }

  static async exportFinalVideo(projectId: string): Promise<void> {
    const project = projectRepository.get(projectId);
    if (!project) return;

    try {
      const projectDir = projectRepository.getDir(project.id);
      const finalPath = path.join(projectDir, "final.mp4");
      const keepTimeline = computeKeepTimeline(project.duration, project.cuts);
      const prefs = project.renderPreferences || {
        makeVertical: true,
        burnCaptions: true,
        captionsStyle: "hormozi" as const,
        studioAudio: false,
        autoZoom: false,
        transitionSfx: false
      };

      let subPath: string | undefined = undefined;
      if (prefs.burnCaptions) {
        subPath = path.join(projectDir, "subtitles.ass");
        if (project.cleanTranscript && project.cleanTranscript.words.length > 0) {
          generateHormoziAssSubtitles(
            project.cleanTranscript.words,
            undefined,
            subPath,
            1080,
            1920,
            prefs.captionsStyle || "hormozi"
          );
        } else if (project.transcript) {
          generateHormoziAssSubtitles(
            project.transcript.words,
            keepTimeline,
            subPath,
            1080,
            1920,
            prefs.captionsStyle || "hormozi"
          );
        }
      }

      await renderCuts(project.originalFilePath, keepTimeline, finalPath, {
        makeVertical: prefs.makeVertical ?? true,
        subtitlesPath: subPath,
        brollOverlays: getRenderBrollItems(project),
        studioAudio: prefs.studioAudio,
        autoZoom: prefs.autoZoom,
        transitionSfx: prefs.transitionSfx,
        backgroundMusicPath: getBackgroundMusicPath(project),
        musicVolume: prefs.backgroundMusic?.volume ?? 0.25,
        faceGlow: prefs.faceGlow,
        onProcess: (proc) => {
          jobManager.register(project.id, () => {
            try {
              proc.kill("SIGTERM");
            } catch {}
            try {
              proc.kill("SIGKILL");
            } catch {}
          });
        }
      });

      jobManager.unregister(project.id);
      project.finalVideoPath = finalPath;
      project.status = "exported";
      project.processingStep = undefined;
      logProject(project, "✅ וידאו סופי יוצא בהצלחה ומוכן להורדה!");
      projectRepository.save(project);
    } catch (err: unknown) {
      jobManager.unregister(project.id);
      project.status = "ready";
      project.processingStep = undefined;
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RENDER_CANCELLED") {
        logProject(project, "🛑 תהליך הייצוא בוטל על ידי המשתמש.");
      } else {
        project.errorMessage = `שגיאה בייצוא: ${message}`;
        logProject(project, `❌ שגיאה בייצוא: ${message}`);
      }
      projectRepository.save(project);
    }
  }

  static async runEyeContact(projectId: string): Promise<void> {
    const project = projectRepository.get(projectId);
    if (!project) return;

    try {
      const projectDir = projectRepository.getDir(project.id);
      const outputEyeContactPath = path.join(projectDir, `eye_contact_${generateId()}.mp4`);

      if (!project.rawOriginalFilePath) {
        project.rawOriginalFilePath = project.originalFilePath;
      }

      await runEyeContactCorrection(
        project.originalFilePath,
        outputEyeContactPath,
        (pct) => {
          project.processingStep = `מתקן קשר עין: ${pct}% הושלמו`;
          projectRepository.save(project);
        },
        (proc) => {
          jobManager.register(project.id, () => {
            try {
              proc.kill("SIGTERM");
            } catch {}
            try {
              proc.kill("SIGKILL");
            } catch {}
          });
        }
      );

      jobManager.unregister(project.id);
      project.originalFilePath = outputEyeContactPath;
      project.eyeContactApplied = true;
      project.hasEyeContactOriginal = true;
      project.status = "ready";
      project.processingStep = undefined;
      logProject(project, "✅ תיקון קשר עין הושלם בהצלחה! הסרטון המקורי עודכן.");
      projectRepository.save(project);
    } catch (err: unknown) {
      jobManager.unregister(project.id);
      project.status = "ready";
      project.processingStep = undefined;
      const message = err instanceof Error ? err.message : String(err);
      if (message === "RENDER_CANCELLED") {
        logProject(project, "🛑 תהליך תיקון קשר עין נעצר על ידי המשתמש.");
      } else {
        project.errorMessage = `שגיאה בתיקון קשר עין: ${message}`;
        logProject(project, `❌ שגיאה בתיקון קשר עין: ${message}`);
      }
      projectRepository.save(project);
    }
  }

  static async rotateVideo(projectId: string, degrees: 90 | 180 | 270): Promise<void> {
    const project = projectRepository.get(projectId);
    if (!project) return;

    try {
      const rotatedPath = await rotateSourceVideo(project.originalFilePath, degrees);
      project.originalFilePath = rotatedPath;

      const meta = await getVideoMetadata(rotatedPath);
      project.videoWidth = meta.width;
      project.videoHeight = meta.height;
      project.isVertical = meta.isVertical;
      if (project.renderPreferences) {
        project.renderPreferences.makeVertical = meta.isVertical;
      }

      project.status = "ready";
      project.processingStep = undefined;
      logProject(
        project,
        `✅ סרטון המקור סובב בהצלחה ב-${degrees}° (${meta.width}x${meta.height}, ${meta.isVertical ? "לאורך 9:16" : "לרוחב 16:9"})!`
      );
      projectRepository.save(project);
    } catch (err: unknown) {
      project.status = "ready";
      const message = err instanceof Error ? err.message : String(err);
      project.errorMessage = `שגיאה בסיבוב סרטון המקור: ${message}`;
      logProject(project, `❌ שגיאה בסיבוב סרטון המקור: ${message}`);
      projectRepository.save(project);
    }
  }
}
