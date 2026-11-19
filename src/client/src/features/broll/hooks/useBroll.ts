import { useState } from "react";
import { Project, BrollOverlay } from "../../../shared";
import { api } from "../../../shared";
import { useToast } from "../../../shared";

export function useBroll(currentProject: Project | null, onProjectUpdated: (project: Project) => void) {
  const [isMatchingBroll, setIsMatchingBroll] = useState<boolean>(false);
  const toast = useToast();

  const uploadBrollAsset = async (file: File) => {
    if (!currentProject) return;
    try {
      const updated = await api.uploadBrollAsset(currentProject.id, file);
      onProjectUpdated(updated);
      toast.success("נכס B-Roll הועלה בהצלחה.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בהעלאת B-Roll: ${msg}`);
    }
  };

  const updateBrollAssetHint = async (assetId: string, placementHint: string) => {
    if (!currentProject) return;
    try {
      const updated = await api.updateBrollAsset(currentProject.id, assetId, { placementHint });
      onProjectUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בשמירת מיקום מבוקש: ${msg}`);
    }
  };

  const deleteBrollAsset = async (assetId: string) => {
    if (!currentProject) return;
    try {
      const updated = await api.deleteBrollAsset(currentProject.id, assetId);
      onProjectUpdated(updated);
      toast.info("נכס B-Roll נמחק.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה במחיקת נכס: ${msg}`);
    }
  };

  const autoMatchBroll = async () => {
    if (!currentProject) return;
    setIsMatchingBroll(true);
    try {
      const updated = await api.autoMatchBroll(currentProject.id);
      onProjectUpdated(updated);
      toast.success("שיבוץ B-Roll הושלם בהצלחה. ניתן לראות את הנכסים בערוץ 2 בטיימליין.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בשיבוץ B-Roll: ${msg}`);
    } finally {
      setIsMatchingBroll(false);
    }
  };

  const updateBrollOverlays = async (overlays: BrollOverlay[]) => {
    if (!currentProject) return;
    try {
      const updated = await api.updateBrollOverlays(currentProject.id, overlays);
      onProjectUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`שגיאה בעדכון שכבות B-Roll: ${msg}`);
    }
  };

  return {
    isMatchingBroll,
    uploadBrollAsset,
    updateBrollAssetHint,
    deleteBrollAsset,
    autoMatchBroll,
    updateBrollOverlays
  };
}
