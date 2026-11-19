import { useState, useEffect, useRef } from "react";
import { Project, CutSegment, Word, RenderPreferences } from "../../../shared";
import { api } from "../../../shared";
import { useToast } from "../../../shared";

function playCompletionSound() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    playTone(587.33, 0, 0.2);
    playTone(880, 0.15, 0.35);
  } catch {
    // Audio context may be restricted
  }
}

function triggerNotification(title: string, body: string) {
  playCompletionSound();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/favicon.ico"
    });
  }
}

export function useProcessing(currentProject: Project | null, onProjectUpdated: (project: Project) => void) {
  const [videoCacheBuster, setVideoCacheBuster] = useState<number>(Date.now());
  const toast = useToast();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll project state when processing or exporting
  const projectId = currentProject?.id;
  const projectStatus = currentProject?.status;
  const projectFileName = currentProject?.originalFileName || "וידאו";

  useEffect(() => {
    if (!projectId || (projectStatus !== "processing" && projectStatus !== "exporting")) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const wasExporting = projectStatus === "exporting";

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await api.getProject(projectId);
        if (updated.status !== "processing" && updated.status !== "exporting") {
          setVideoCacheBuster(Date.now());
          if (updated.status === "ready" || updated.status === "exported") {
            triggerNotification(
              "AI Auto Cut",
              wasExporting ? `הייצוא הושלם בהצלחה: ${projectFileName}` : `עיבוד הווידאו הושלם: ${projectFileName}`
            );
            toast.success(wasExporting ? "הייצוא הושלם בהצלחה!" : "עיבוד הווידאו הושלם!");
          } else if (updated.status === "error") {
            toast.error(updated.errorMessage || "שגיאה בתהליך העיבוד");
          }
        }
        onProjectUpdated(updated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("Polling error:", msg);
      }
    }, 1500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [projectId, projectStatus, projectFileName, onProjectUpdated, toast]);

  const startProcessing = async (
    options: { apiKey?: string; originalScript?: string; renderPreferences?: RenderPreferences } = {},
    targetProjectId = currentProject?.id
  ) => {
    if (!targetProjectId) return;
    try {
      const updated = await api.startProcessing(targetProjectId, options);
      onProjectUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בהפעלת עיבוד: ${msg}`);
    }
  };

  const reRender = async (preferences?: RenderPreferences) => {
    if (!currentProject) return;
    try {
      const updated = await api.reRender(currentProject.id, {
        renderPreferences: preferences || currentProject.renderPreferences
      });
      onProjectUpdated(updated);
      toast.info("מרנדר תצוגה מקדימה מעודכנת...");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה ברינדור: ${msg}`);
    }
  };

  const cancelJob = async () => {
    if (!currentProject) return;
    try {
      const res = await api.cancelJob(currentProject.id);
      onProjectUpdated(res.project);
      toast.info("הפעולה נעצרה.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בעצירת הרינדור: ${msg}`);
    }
  };

  const updateCuts = async (cuts: CutSegment[]) => {
    if (!currentProject) return;
    try {
      const updated = await api.updateCuts(currentProject.id, cuts);
      onProjectUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בעדכון חיתוכים: ${msg}`);
    }
  };

  const toggleCut = async (cutId: string) => {
    if (!currentProject) return;
    try {
      const updated = await api.toggleCut(currentProject.id, cutId);
      onProjectUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בעדכון מקטע: ${msg}`);
    }
  };

  const updateTranscriptWords = async (words: Word[]) => {
    if (!currentProject) return;
    try {
      const updated = await api.updateTranscript(currentProject.id, words);
      onProjectUpdated(updated);
      setVideoCacheBuster(Date.now());
      toast.success("מילות התמלול והכתוביות עודכנו ונשמרו בהצלחה.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בעדכון כתוביות: ${msg}`);
    }
  };

  const rotateVideo = async (degrees: 90 | 180 | 270) => {
    if (!currentProject) return;
    try {
      const updated = await api.rotateVideo(currentProject.id, degrees);
      onProjectUpdated(updated);
      toast.info(`מסובב את הווידאו ב-${degrees}° עם FFmpeg...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בסיבוב סרטון המקור: ${msg}`);
    }
  };

  const runEyeContact = async () => {
    if (!currentProject) return;
    try {
      const updated = await api.runEyeContact(currentProject.id);
      onProjectUpdated(updated);
      toast.info("תיקון קשר עין פועל ברקע. נגן הווידאו יתעדכן בסיום.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בהפעלת תיקון קשר עין: ${msg}`);
    }
  };

  return {
    videoCacheBuster,
    setVideoCacheBuster,
    startProcessing,
    reRender,
    cancelJob,
    updateCuts,
    toggleCut,
    updateTranscriptWords,
    rotateVideo,
    runEyeContact
  };
}
