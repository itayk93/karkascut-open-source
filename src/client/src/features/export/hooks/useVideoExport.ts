import { Project, RenderPreferences } from "../../../shared";
import { api, apiUrl } from "../../../shared";
import { useToast } from "../../../shared";

export function useVideoExport(currentProject: Project | null, onProjectUpdated: (project: Project) => void) {
  const toast = useToast();

  const exportFinalVideo = async (preferences?: RenderPreferences) => {
    if (!currentProject) return;
    try {
      const updated = await api.exportFinalVideo(currentProject.id, {
        renderPreferences: preferences || currentProject.renderPreferences
      });
      onProjectUpdated(updated);
      toast.info("מתחיל ייצוא וידאו סופי 9:16...");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בהפעלת ייצוא: ${msg}`);
    }
  };

  const downloadFinalVideo = async () => {
    if (!currentProject || !currentProject.finalVideoPath) return;
    try {
      const link = document.createElement("a");
      link.href = apiUrl(`/media/projects/${currentProject.id}/final.mp4?v=${Date.now()}`);
      link.download = `${currentProject.originalFileName.replace(/\.[^/.]+$/, "")}_autocut_final.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בהורדת הווידאו: ${msg}`);
    }
  };

  const exportPremiereXml = async () => {
    if (!currentProject) return;
    try {
      const link = document.createElement("a");
      link.href = apiUrl(`/api/projects/${currentProject.id}/export-premiere-xml`);
      link.download = `${currentProject.originalFileName.replace(/\.[^/.]+$/, "")}_premiere.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בייצוא פרימייר XML: ${msg}`);
    }
  };

  const exportJsonPlan = () => {
    if (!currentProject) return;
    const link = document.createElement("a");
    link.href = apiUrl(`/api/projects/${currentProject.id}/export-json`);
    link.download = `autocut_plan_${currentProject.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importJsonPlan = async (file: File) => {
    if (!currentProject) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const updated = await api.importJsonPlan(currentProject.id, parsed);
      onProjectUpdated(updated);
      toast.success("תוכנית העריכה (JSON) נטענה בהצלחה לפרויקט.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בטעינת קובץ JSON: ${msg}`);
    }
  };

  return {
    exportFinalVideo,
    downloadFinalVideo,
    exportPremiereXml,
    exportJsonPlan,
    importJsonPlan
  };
}
