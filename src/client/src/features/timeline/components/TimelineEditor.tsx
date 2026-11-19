import React, { useMemo, useState } from "react";
import { replaceCutWindow } from "../../../../../shared/replaceCutWindow";
import { CutSegment, KeepSegment, BrollOverlay, BrollAsset, SegmentSubCut, Project, api, Word } from "../../../shared";
import { SegmentFineTuneModal } from "./SegmentFineTuneModal";
import { generateId, useToast } from "../../../shared";

interface TimelineEditorProps {
  projectId: string;
  duration: number;
  cuts: CutSegment[];
  keepTimeline: KeepSegment[];
  brollOverlays?: BrollOverlay[];
  assets?: BrollAsset[];
  words?: Word[];
  currentTime: number;
  originalVideoUrl?: string;
  onUpdateCuts: (updatedCuts: CutSegment[]) => void;
  onUpdateBrollOverlays?: (updatedOverlays: BrollOverlay[]) => void;
  onProjectUpdated?: (project: Project) => void;
  onSeek: (sec: number) => void;
  onPlaySegment?: (seg: { start: number; end: number; source?: "original" | "preview" }) => void;
  onReRender: () => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  projectId,
  duration,
  cuts,
  keepTimeline,
  brollOverlays = [],
  assets = [],
  words = [],
  currentTime,
  originalVideoUrl = "",
  onUpdateCuts,
  onUpdateBrollOverlays,
  onProjectUpdated,
  onSeek,
  onPlaySegment,
  onReRender
}) => {
  const toast = useToast();
  const [isRefining, setIsRefining] = useState<boolean>(false);

  // B-roll overlay start/end are stored in EDITED-video seconds — that is what the
  // renderer gates on. Track 1 and the drag surface are drawn in ORIGINAL seconds.
  // Convert between the two so an AI- or drag-placed overlay always sits over kept
  // (green) content and never lands on a removed (red) region.
  const keeps = useMemo(() => [...keepTimeline].sort((a, b) => a.start - b.start), [keepTimeline]);
  const editedDuration = useMemo(
    () => keeps.reduce((sum, k) => sum + (k.end - k.start), 0) || duration,
    [keeps, duration]
  );
  const editedToOriginal = (te: number): number => {
    let acc = 0;
    for (const k of keeps) {
      const d = k.end - k.start;
      if (te <= acc + d) return k.start + Math.max(0, te - acc);
      acc += d;
    }
    return keeps.length ? keeps[keeps.length - 1]!.end : te;
  };
  const originalToEdited = (to: number): number => {
    let acc = 0;
    for (const k of keeps) {
      if (to < k.start) return acc; // inside a cut → snap forward to the next keep
      if (to <= k.end) return acc + (to - k.start);
      acc += k.end - k.start;
    }
    return acc;
  };

  const longCutCount = cuts.filter((c) => c.status === "cut" && !c.locked && c.end - c.start >= 5).length;

  const handleRefineLongCuts = async () => {
    if (longCutCount === 0) {
      toast.info("אין חתכים ארוכים (מעל 5 שניות) לעדן");
      return;
    }
    setIsRefining(true);
    try {
      const res = await api.refineCuts(projectId);
      onProjectUpdated?.(res.project);
      if (res.refinedCount > 0) {
        toast.success(
          `${res.refinedCount} חתכים ארוכים פוצלו — ${res.restoredSeconds.toFixed(1)} שניות תקינות חזרו לסרטון`
        );
      } else {
        toast.info("נבדקו כל החתכים הארוכים — כולם אכן זבל, אין מה להחזיר");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעידון חתכים");
    } finally {
      setIsRefining(false);
    }
  };
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [selectedKeepIndex, setSelectedKeepIndex] = useState<number | null>(null);
  const [selectedBrollId, setSelectedBrollId] = useState<string | null>(null);
  const [manualStart, setManualStart] = useState<string>("");
  const [manualEnd, setManualEnd] = useState<string>("");

  // Fine Tune Modal state
  const [fineTuneModalOpen, setFineTuneModalOpen] = useState<boolean>(false);
  const [fineTuneConfig, setFineTuneConfig] = useState<{
    start: number;
    end: number;
    isCut: boolean;
    cutId?: string;
    keepIndex?: number;
    title: string;
  } | null>(null);

  // Range selection state (drag on track 1)
  const [isSelectingRange, setIsSelectingRange] = useState<boolean>(false);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);

  const selectedCut = cuts.find((c) => c.id === selectedCutId);
  const selectedKeep =
    selectedKeepIndex !== null && keepTimeline[selectedKeepIndex] ? keepTimeline[selectedKeepIndex] : null;
  const selectedBroll = brollOverlays.find((o) => o.id === selectedBrollId);
  const selectedBrollAsset = selectedBroll ? assets.find((a) => a.id === selectedBroll.assetId) : null;

  // History stacks for Undo / Redo
  const [history, setHistory] = useState<Array<{ cuts: CutSegment[]; brollOverlays: BrollOverlay[] }>>([]);
  const [future, setFuture] = useState<Array<{ cuts: CutSegment[]; brollOverlays: BrollOverlay[] }>>([]);

  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  // Helper to commit a state change to history before applying
  const pushStateToHistory = (newCuts: CutSegment[], newBroll?: BrollOverlay[]) => {
    setHistory((prev) => [...prev.slice(-30), { cuts, brollOverlays }]);
    setFuture([]);
    setHasPendingChanges(true);
    onUpdateCuts(newCuts);
    if (newBroll && onUpdateBrollOverlays) {
      onUpdateBrollOverlays(newBroll);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    if (!previous) return;
    const newHistory = history.slice(0, history.length - 1);

    setFuture((prev) => [{ cuts, brollOverlays }, ...prev.slice(0, 30)]);
    setHistory(newHistory);

    onUpdateCuts(previous.cuts);
    if (onUpdateBrollOverlays && previous.brollOverlays) {
      onUpdateBrollOverlays(previous.brollOverlays);
    }
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    if (!next) return;
    const newFuture = future.slice(1);

    setHistory((prev) => [...prev.slice(-30), { cuts, brollOverlays }]);
    setFuture(newFuture);

    onUpdateCuts(next.cuts);
    if (onUpdateBrollOverlays && next.brollOverlays) {
      onUpdateBrollOverlays(next.brollOverlays);
    }
  };

  const onKeyDownRef = React.useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyDownRef.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handleUndo();
      return;
    }

    if ((cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "z") || (cmdOrCtrl && e.key.toLowerCase() === "y")) {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (rangeStart !== null && rangeEnd !== null) {
        handleCutSelectedRange();
      } else if (selectedKeepIndex !== null) {
        handleCutSelectedKeep();
      } else if (selectedCutId) {
        handleDeleteSelectedCut();
      } else if (selectedBrollId) {
        handleDeleteBrollOverlay();
      }
    }
  };

  // Keyboard shortcut: Delete, Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDownRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Lock every cut that overlaps the marked range (mark a reviewed stretch as done)
  const handleLockSelectedRange = () => {
    if (rangeStart === null || rangeEnd === null) return;
    const s = Math.min(rangeStart, rangeEnd);
    const e = Math.max(rangeStart, rangeEnd);
    const hits = cuts.filter((c) => c.end > s && c.start < e);
    if (hits.length === 0) {
      toast.info("אין חתכים בטווח הזה לנעילה");
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    const allLocked = hits.every((c) => c.locked);
    const updated = cuts.map((c) => (c.end > s && c.start < e ? { ...c, locked: !allLocked } : c));
    pushStateToHistory(updated);
    toast.success(
      allLocked ? `🔓 ${hits.length} חתכים בטווח שוחררו` : `🔒 ${hits.length} חתכים בטווח ננעלו — AI לא יגע בהם`
    );
    setRangeStart(null);
    setRangeEnd(null);
  };

  // Handle Range Cut
  const handleCutSelectedRange = () => {
    if (rangeStart === null || rangeEnd === null) return;
    const s = Math.min(rangeStart, rangeEnd);
    const e = Math.max(rangeStart, rangeEnd);
    if (e - s < 0.05) {
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }

    const newCut: CutSegment = {
      id: generateId("manual_range"),
      start: Math.round(s * 100) / 100,
      end: Math.round(e * 100) / 100,
      type: "manual",
      confidence: 1.0,
      reason: "חיתוך טווח מסומן",
      status: "cut",
      text: "[חיתוך ידני]"
    };

    const updated = [...cuts, newCut].sort((a, b) => a.start - b.start);
    pushStateToHistory(updated);
    setSelectedCutId(newCut.id);
    setSelectedKeepIndex(null);
    setRangeStart(null);
    setRangeEnd(null);
  };

  // Handle Cut Selected Keep Segment (green) -> turns it into a cut (red)
  const handleCutSelectedKeep = () => {
    if (selectedKeepIndex === null || !keepTimeline[selectedKeepIndex]) return;
    const seg = keepTimeline[selectedKeepIndex];
    const newCut: CutSegment = {
      id: generateId("cut_keep"),
      start: Math.round(seg.start * 100) / 100,
      end: Math.round(seg.end * 100) / 100,
      type: "manual",
      confidence: 1.0,
      reason: "חיתוך מקטע ידני",
      status: "cut",
      text: "[מקטע שנחתך]"
    };

    const updated = [...cuts, newCut].sort((a, b) => a.start - b.start);
    pushStateToHistory(updated);
    setSelectedKeepIndex(null);
    setSelectedCutId(newCut.id);
  };

  // Open Fine Tune Modal for Keep or Cut
  const handleOpenFineTuneKeep = () => {
    if (selectedKeepIndex === null || !keepTimeline[selectedKeepIndex]) return;
    const seg = keepTimeline[selectedKeepIndex];
    setFineTuneConfig({
      start: seg.start,
      end: seg.end,
      isCut: false,
      keepIndex: selectedKeepIndex,
      title: `כוונון עדין למקטע שמור (ירוק: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s)`
    });
    setFineTuneModalOpen(true);
  };

  const handleOpenFineTuneCut = () => {
    if (!selectedCut) return;
    setFineTuneConfig({
      start: selectedCut.start,
      end: selectedCut.end,
      isCut: selectedCut.status === "cut",
      cutId: selectedCut.id,
      title: `כוונון עדין למקטע חיתוך (${selectedCut.reason}: ${selectedCut.start.toFixed(1)}s - ${selectedCut.end.toFixed(1)}s)`
    });
    setFineTuneModalOpen(true);
  };

  const handleSaveFineTune = (newStart: number, newEnd: number, newIsCut: boolean) => {
    if (!fineTuneConfig) return;

    if (fineTuneConfig.cutId) {
      // Editing an existing cut
      const updated = cuts.map((c) => {
        if (c.id === fineTuneConfig.cutId) {
          return {
            ...c,
            start: newStart,
            end: newEnd,
            status: (newIsCut ? "cut" : "restored") as "cut" | "restored"
          };
        }
        return c;
      });
      pushStateToHistory(updated);
    } else if (fineTuneConfig.keepIndex !== undefined) {
      // Editing a keep segment
      if (newIsCut) {
        // User turned it into a cut
        const newCut: CutSegment = {
          id: generateId("cut_ft"),
          start: newStart,
          end: newEnd,
          type: "manual",
          confidence: 1.0,
          reason: "חיתוך מכוונון עדין",
          status: "cut",
          text: "[מקטע שנחתך]"
        };
        const updated = [...cuts, newCut].sort((a, b) => a.start - b.start);
        pushStateToHistory(updated);
        setSelectedKeepIndex(null);
        setSelectedCutId(newCut.id);
      } else {
        // User adjusted keep boundaries -> any difference from original keep range becomes cuts
        const originalSeg = keepTimeline[fineTuneConfig.keepIndex];
        if (originalSeg) {
          const newCuts: CutSegment[] = [];
          if (newStart > originalSeg.start + 0.05) {
            newCuts.push({
              id: generateId("cut_trim_start"),
              start: Math.round(originalSeg.start * 100) / 100,
              end: Math.round(newStart * 100) / 100,
              type: "manual",
              confidence: 1.0,
              reason: "חיתוך קצה התחלה",
              status: "cut"
            });
          }
          if (newEnd < originalSeg.end - 0.05) {
            newCuts.push({
              id: generateId("cut_trim_end"),
              start: Math.round(newEnd * 100) / 100,
              end: Math.round(originalSeg.end * 100) / 100,
              type: "manual",
              confidence: 1.0,
              reason: "חיתוך קצה סיום",
              status: "cut"
            });
          }
          if (newCuts.length > 0) {
            const updated = [...cuts, ...newCuts].sort((a, b) => a.start - b.start);
            pushStateToHistory(updated);
          }
        }
      }
    }
  };

  // Apply AI micro-cuts produced by re-analyzing a segment inside the Fine Tune modal.
  // The re-analyzed window is REPLACED by the micro-cuts: the parent segment
  // (whether it was an active cut or a kept segment) is dropped, and only the
  // AI-flagged pieces inside it stay cut — so the gaps between them become kept.
  const handleApplySubCuts = (subCuts: SegmentSubCut[], window: { start: number; end: number }) => {
    if (!fineTuneConfig) return;

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const newCuts: CutSegment[] = (subCuts || [])
      .map((s) => ({
        id: generateId("cut_ai_seg"),
        start: Math.round(Math.min(s.start, s.end) * 100) / 100,
        end: Math.round(Math.max(s.start, s.end) * 100) / 100,
        type: (s.type || "dead_content") as CutSegment["type"],
        confidence: clamp01(typeof s.confidence === "number" ? s.confidence : 0.9),
        reason: s.reason || "ניתוח מחודש של מקטע",
        status: "cut" as const,
        text: s.text
      }))
      .filter((c) => c.end - c.start >= 0.05);

    const base = replaceCutWindow(cuts, [], window.start, window.end, () => generateId("cut_split"));
    const removedCount = cuts.filter((cut) => !base.includes(cut)).length;
    const windowSpan = window.end - window.start;

    if (newCuts.length === 0) {
      pushStateToHistory(base);
      setSelectedCutId(null);
      setSelectedKeepIndex(null);
      toast.success(`כל המקטע (${windowSpan.toFixed(1)}s) סומן כשמור וחזר לסרטון`);
      return;
    }

    const cutTotal = newCuts.reduce((sum, c) => sum + (c.end - c.start), 0);
    const keptSpan = Math.max(0, windowSpan - cutTotal);

    const updated = replaceCutWindow(cuts, newCuts, window.start, window.end, () => generateId("cut_split"));
    pushStateToHistory(updated);
    setSelectedCutId(null);
    setSelectedKeepIndex(null);

    if (keptSpan > 0.3) {
      toast.success(
        `המקטע פוצל ל-${newCuts.length} חתכים${removedCount ? ` (הוחלפו ${removedCount})` : ""} — ` +
          `${keptSpan.toFixed(1)} שניות תקינות נשארות בסרטון`
      );
    } else {
      toast.info(
        `נבחרו ${newCuts.length} חתכים — שאר המקטע נשאר בסרטון`
      );
    }
  };

  // 1. Toggle cut / restore
  const handleToggleSelected = () => {
    if (!selectedCut) return;
    const updated = cuts.map((c) =>
      c.id === selectedCut.id ? { ...c, status: (c.status === "cut" ? "restored" : "cut") as "cut" | "restored" } : c
    );
    pushStateToHistory(updated);
  };

  const handleToggleLockSelected = () => {
    if (!selectedCut) return;
    const willLock = !selectedCut.locked;
    const updated = cuts.map((c) => (c.id === selectedCut.id ? { ...c, locked: willLock } : c));
    pushStateToHistory(updated);
    toast.info(willLock ? "🔒 החתך ננעל — AI לא יגע בו" : "🔓 החתך שוחרר");
  };

  // 2. Delete cut entirely
  const handleDeleteSelectedCut = () => {
    if (!selectedCut) return;
    if (selectedCut.locked) {
      toast.info("החתך נעול — שחרר אותו קודם (🔓) כדי למחוק");
      return;
    }
    const updated = cuts.filter((c) => c.id !== selectedCut.id);
    setSelectedCutId(null);
    pushStateToHistory(updated);
  };

  // 3. Trim Start (+/- 0.2s)
  const handleAdjustStart = (delta: number) => {
    if (!selectedCut) return;
    const newStart = Math.max(0, Math.min(selectedCut.end - 0.1, Math.round((selectedCut.start + delta) * 100) / 100));
    const updated = cuts.map((c) => (c.id === selectedCut.id ? { ...c, start: newStart } : c));
    pushStateToHistory(updated);
  };

  // 4. Trim End (+/- 0.2s)
  const handleAdjustEnd = (delta: number) => {
    if (!selectedCut) return;
    const newEnd = Math.min(
      duration,
      Math.max(selectedCut.start + 0.1, Math.round((selectedCut.end + delta) * 100) / 100)
    );
    const updated = cuts.map((c) => (c.id === selectedCut.id ? { ...c, end: newEnd } : c));
    pushStateToHistory(updated);
  };

  // Move the playhead to the point clicked inside a timeline segment
  const seekFromTrackEvent = (e: React.MouseEvent) => {
    const track = (e.currentTarget as HTMLElement).parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const sec = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration));
    onSeek(Math.round(sec * 100) / 100);
  };

  // 5. Split keep or cut at playhead (falls back to the middle of the selected segment)
  const handleSplitAtPlayhead = () => {
    let playhead = Math.round(currentTime * 100) / 100;

    // Check if playhead is inside an ACTIVE (red) cut. Restored cuts are visually
    // part of the green keep track, so splitting there must split the keep instead.
    let targetCut = cuts.find(
      (c) => c.status === "cut" && playhead > c.start + 0.1 && playhead < c.end - 0.1
    );
    // fallback: a cut is selected but the playhead isn't in it -> split it in the middle
    if (!targetCut && selectedCut) {
      targetCut = selectedCut;
      playhead = Math.round(((selectedCut.start + selectedCut.end) / 2) * 100) / 100;
    }
    if (targetCut) {
      const firstHalf: CutSegment = { ...targetCut, id: generateId("cut_split"), end: playhead };
      const secondHalf: CutSegment = { ...targetCut, id: generateId("cut_split"), start: playhead };
      const updated = cuts.flatMap((c) => (c.id === targetCut!.id ? [firstHalf, secondHalf] : [c]));
      pushStateToHistory(updated);
      setSelectedCutId(secondHalf.id);
      setSelectedKeepIndex(null);
      toast.success(`המקטע פוצל ב-${playhead.toFixed(1)}s`);
      return;
    }

    // Check if playhead is inside a keep segment (green)
    let targetKeepIndex = keepTimeline.findIndex((k) => playhead > k.start + 0.15 && playhead < k.end - 0.15);
    // fallback: a keep segment is selected -> split it in the middle
    if (targetKeepIndex === -1 && selectedKeepIndex !== null && keepTimeline[selectedKeepIndex]) {
      targetKeepIndex = selectedKeepIndex;
      const k = keepTimeline[selectedKeepIndex]!;
      playhead = Math.round(((k.start + k.end) / 2) * 100) / 100;
    }
    if (targetKeepIndex !== -1) {
      // A keep track is derived from the cuts, so the only way to break a green
      // segment in two is to drop a thin cut at the split point.
      const sliceCut: CutSegment = {
        id: generateId("cut_split"),
        start: Math.round((playhead - 0.04) * 100) / 100,
        end: Math.round((playhead + 0.04) * 100) / 100,
        type: "manual",
        confidence: 1.0,
        reason: "פיצול בנקודת הסמן",
        status: "cut",
        text: "[פיצול]"
      };
      const updated = [...cuts, sliceCut].sort((a, b) => a.start - b.start);
      pushStateToHistory(updated);
      setSelectedCutId(sliceCut.id);
      setSelectedKeepIndex(null);
      toast.success(`המקטע פוצל ב-${playhead.toFixed(1)}s`);
      return;
    }

    toast.info("בחר מקטע (ירוק/אדום) או הזז את הסמן לתוך מקטע, ואז לחץ פצל");
  };

  // 6. Add manual cut range
  const handleAddManualCut = () => {
    const s = parseFloat(manualStart);
    const e = parseFloat(manualEnd);
    if (isNaN(s) || isNaN(e) || s >= e || s < 0 || e > duration) return;

    const newCut: CutSegment = {
      id: generateId("manual"),
      start: Math.round(s * 100) / 100,
      end: Math.round(e * 100) / 100,
      type: "manual",
      confidence: 1.0,
      reason: "חיתוך ידני",
      status: "cut",
      text: "[חיתוך ידני]"
    };

    const updated = [...cuts, newCut].sort((a, b) => a.start - b.start);
    pushStateToHistory(updated);
    setSelectedCutId(newCut.id);
    setManualStart("");
    setManualEnd("");
  };

  // 7. B-Roll Overlay Controls
  const handleAdjustBrollStart = (delta: number) => {
    if (!selectedBroll || !onUpdateBrollOverlays) return;
    const newStart = Math.max(
      0,
      Math.min(selectedBroll.end - 0.5, Math.round((selectedBroll.start + delta) * 100) / 100)
    );
    const updated = brollOverlays.map((o) => (o.id === selectedBroll.id ? { ...o, start: newStart } : o));
    pushStateToHistory(cuts, updated);
  };

  const handleAdjustBrollEnd = (delta: number) => {
    if (!selectedBroll || !onUpdateBrollOverlays) return;
    const newEnd = Math.min(
      editedDuration,
      Math.max(selectedBroll.start + 0.5, Math.round((selectedBroll.end + delta) * 100) / 100)
    );
    const updated = brollOverlays.map((o) => (o.id === selectedBroll.id ? { ...o, end: newEnd } : o));
    pushStateToHistory(cuts, updated);
  };

  const handleDeleteBrollOverlay = () => {
    if (!selectedBroll || !onUpdateBrollOverlays) return;
    const updated = brollOverlays.filter((o) => o.id !== selectedBroll.id);
    setSelectedBrollId(null);
    pushStateToHistory(cuts, updated);
  };

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="card" style={{ border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: 0 }}>עורך ציר זמן וערוצים</h3>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            onClick={handleUndo}
            disabled={history.length === 0}
            title="בטל פעולה אחרונה (Ctrl+Z / Cmd+Z)"
            style={{
              fontSize: "13px",
              padding: "6px 12px",
              opacity: history.length === 0 ? 0.5 : 1,
              cursor: history.length === 0 ? "not-allowed" : "pointer"
            }}
          >
            בטל (Ctrl+Z)
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleRedo}
            disabled={future.length === 0}
            title="בצע שוב פעולה שבוטלה (Ctrl+Y / Cmd+Shift+Z)"
            style={{
              fontSize: "13px",
              padding: "6px 12px",
              opacity: future.length === 0 ? 0.5 : 1,
              cursor: future.length === 0 ? "not-allowed" : "pointer"
            }}
          >
            בצע שוב (Ctrl+Y)
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSplitAtPlayhead}
            title="פצל את המקטע הנוכחי בנקודת הסמן"
            style={{ fontSize: "13px", padding: "6px 12px" }}
          >
            פצל בנקודת הסמן (<bdi className="bdi-num">{currentTime.toFixed(1)}s</bdi>)
          </button>
          {longCutCount > 0 && (
            <button
              className="btn btn-secondary"
              onClick={handleRefineLongCuts}
              disabled={isRefining}
              title="מריץ fine-tuning אוטומטי על כל חתך ארוך ומחזיר את החלקים התקינים"
              style={{
                fontSize: "13px",
                padding: "6px 12px",
                background: "#4f46e5",
                borderColor: "#4f46e5",
                color: "#fff"
              }}
            >
              {isRefining ? "מעדן…" : `🪄 עדן ${longCutCount} חתכים ארוכים`}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              setHasPendingChanges(false);
              onReRender();
            }}
            style={{
              fontSize: "13px",
              padding: "6px 16px",
              background: hasPendingChanges ? "#dc2626" : "#0f172a",
              borderColor: hasPendingChanges ? "#b91c1c" : "#0f172a",
              fontWeight: 700
            }}
            title={
              hasPendingChanges
                ? "ישנם שינויי חיתוך שטרם רונדרו לווידאו! לחץ לרנדור וסנכרון מיידי"
                : "רנדר מחדש את הווידאו"
            }
          >
            {hasPendingChanges ? "רנדר שינויים וסנכרן (חובה)" : "רנדר שינויים"}
          </button>
        </div>
      </div>

      {/* TRACK 1: Main Video & Cuts */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>
          ערוץ 1: וידאו ראשי וחיתוכים (גרור עכבר לסמן מקטע לחיתוך)
        </div>
        {rangeStart !== null && rangeEnd !== null && Math.abs(rangeEnd - rangeStart) > 0.1 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#b91c1c", fontWeight: 700 }}>
              טווח מסומן:{" "}
              <bdi className="bdi-num">
                {Math.min(rangeStart, rangeEnd).toFixed(1)}s - {Math.max(rangeStart, rangeEnd).toFixed(1)}s
              </bdi>
            </span>
            <button
              className="btn btn-secondary"
              onClick={handleCutSelectedRange}
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                background: "#fee2e2",
                borderColor: "#ef4444",
                color: "#991b1b"
              }}
            >
              חתוך טווח מסומן (Del)
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleLockSelectedRange}
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                background: "#fef3c7",
                borderColor: "#f59e0b",
                color: "#7c2d12",
                fontWeight: 700
              }}
              title="נעל את כל החתכים בטווח שסימנת — סימון שסיימת איתם, AI לא יגע בהם"
            >
              🔒 נעל טווח
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setRangeStart(null);
                setRangeEnd(null);
              }}
              style={{ fontSize: "11px", padding: "2px 6px" }}
            >
              ביטול
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "60px",
          background: "#f1f5f9",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          cursor: isSelectingRange ? "col-resize" : "pointer",
          marginBottom: "14px",
          userSelect: "none",
          direction: "ltr"
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickXFromLeft = e.clientX - rect.left;
          const sec = Math.max(0, Math.min(duration, (clickXFromLeft / rect.width) * duration));
          setIsSelectingRange(true);
          setRangeStart(sec);
          setRangeEnd(sec);
          onSeek(sec);
        }}
        onMouseMove={(e) => {
          if (!isSelectingRange) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickXFromLeft = e.clientX - rect.left;
          const sec = Math.max(0, Math.min(duration, (clickXFromLeft / rect.width) * duration));
          setRangeEnd(sec);
        }}
        onMouseUp={() => {
          setIsSelectingRange(false);
        }}
      >
        {/* KEEP Segments (Green) */}
        {keepTimeline.map((k, i) => {
          const left = (k.start / duration) * 100;
          const width = ((k.end - k.start) / duration) * 100;
          const isSelected = selectedKeepIndex === i;
          return (
            <div
              key={`k_${i}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                seekFromTrackEvent(e);
                setSelectedKeepIndex(i);
                setSelectedCutId(null);
                setSelectedBrollId(null);
                setRangeStart(null);
                setRangeEnd(null);
              }}
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                left: `${left}%`,
                width: `${width}%`,
                background: "#10b981",
                borderRadius: "4px",
                opacity: 0.95,
                border: isSelected ? "3px solid #047857" : "1px solid #059669",
                boxShadow: isSelected ? "0 0 10px rgba(5, 150, 105, 0.9)" : "none",
                zIndex: isSelected ? 15 : 9,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
              title={`שמור: ${k.start.toFixed(1)}s - ${k.end.toFixed(1)}s (לחץ לצפייה ועריכה)`}
            />
          );
        })}

        {/* CUT Segments (Red / Blue outline if restored & selected) */}
        {cuts.map((c) => {
          const left = (c.start / duration) * 100;
          const widthPct = Math.max(0, ((c.end - c.start) / duration) * 100);
          const isSelected = c.id === selectedCutId;
          const isCut = c.status === "cut";

          // If restored and not selected, it is now part of the green keep track
          if (!isCut && !isSelected) return null;

          return (
            <div
              key={c.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                seekFromTrackEvent(e);
                setSelectedCutId(c.id);
                setSelectedKeepIndex(null);
                setSelectedBrollId(null);
                setRangeStart(null);
                setRangeEnd(null);
              }}
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                left: `${left}%`,
                width: `${widthPct}%`,
                minWidth: "3px",
                background: isCut ? "#ef4444" : "rgba(59, 130, 246, 0.4)",
                borderRadius: "4px",
                border: isSelected
                  ? "3px solid #4f46e5"
                  : c.locked
                    ? "2px solid #f59e0b"
                    : isCut
                      ? "1px solid rgba(0,0,0,0.25)"
                      : "2px dashed #2563eb",
                boxShadow: isSelected
                  ? "0 0 8px rgba(79,70,229,0.8)"
                  : c.locked
                    ? "0 0 0 2px rgba(245,158,11,0.35)"
                    : "none",
                zIndex: isSelected ? 15 : 10,
                cursor: "pointer"
              }}
              title={`${c.type}: ${c.start.toFixed(2)}s - ${c.end.toFixed(2)}s (${c.reason})${c.locked ? " — 🔒 נעול" : ""}`}
            >
              {c.locked && !isSelected && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: 1,
                    fontSize: "9px",
                    lineHeight: 1,
                    pointerEvents: "none"
                  }}
                >
                  🔒
                </span>
              )}
              {isSelected && (
                <>
                  {/* Trim Handle Left (Start time) */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: -4,
                      width: 8,
                      background: "#4f46e5",
                      cursor: "ew-resize",
                      borderRadius: "2px"
                    }}
                    title="גרור לשינוי התחלה"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setHistory((prev) => [...prev.slice(-30), { cuts, brollOverlays }]);
                      setFuture([]);
                      const startX = e.clientX;
                      const initialStart = c.start;
                      const onMove = (me: MouseEvent) => {
                        const deltaPx = me.clientX - startX;
                        const deltaSec = (deltaPx / 600) * duration * 0.1;
                        const newStart = Math.max(0, Math.min(c.end - 0.1, initialStart + deltaSec));
                        const updated = cuts.map((item) =>
                          item.id === c.id ? { ...item, start: Math.round(newStart * 100) / 100 } : item
                        );
                        onUpdateCuts(updated);
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                  {/* Trim Handle Right (End time) */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: -4,
                      width: 8,
                      background: "#4f46e5",
                      cursor: "ew-resize",
                      borderRadius: "2px"
                    }}
                    title="גרור לשינוי סיום"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setHistory((prev) => [...prev.slice(-30), { cuts, brollOverlays }]);
                      setFuture([]);
                      const startX = e.clientX;
                      const initialEnd = c.end;
                      const onMove = (me: MouseEvent) => {
                        const deltaPx = me.clientX - startX;
                        const deltaSec = (deltaPx / 600) * duration * 0.1;
                        const newEnd = Math.min(duration, Math.max(c.start + 0.1, initialEnd + deltaSec));
                        const updated = cuts.map((item) =>
                          item.id === c.id ? { ...item, end: Math.round(newEnd * 100) / 100 } : item
                        );
                        onUpdateCuts(updated);
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                </>
              )}
            </div>
          );
        })}

        {/* Selected Range Overlay (Yellow preview) */}
        {rangeStart !== null &&
          rangeEnd !== null &&
          Math.abs(rangeEnd - rangeStart) > 0.05 &&
          (() => {
            const s = Math.min(rangeStart, rangeEnd);
            const e = Math.max(rangeStart, rangeEnd);
            const left = (s / duration) * 100;
            const width = ((e - s) / duration) * 100;
            return (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${left}%`,
                  width: `${width}%`,
                  background: "rgba(250, 204, 21, 0.45)",
                  border: "2px dashed #ca8a04",
                  zIndex: 20,
                  pointerEvents: "none"
                }}
              />
            );
          })()}

        {/* Playhead */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${playheadPercent}%`,
            width: "2px",
            background: "#dc2626",
            zIndex: 25,
            pointerEvents: "none"
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: -5,
              width: 12,
              height: 12,
              background: "#dc2626",
              borderRadius: "50%"
            }}
          />
        </div>
      </div>

      {/* TRACK 2: B-Roll / Media Overlays */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#7c3aed" }}>
          ערוץ 2: שכבת מדיה ו-B-Roll (גרור לכאן פריט מהספרייה)
        </div>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "48px",
          background: "#faf5ff",
          borderRadius: "8px",
          border: "1px dashed #c084fc",
          overflow: "hidden",
          cursor: "pointer",
          marginBottom: "12px",
          direction: "ltr"
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const assetId = e.dataTransfer.getData("assetId");
          if (!assetId || !onUpdateBrollOverlays) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickXFromLeft = e.clientX - rect.left;
          const dropOriginal = Math.max(0, Math.min(duration - 1, (clickXFromLeft / rect.width) * duration));
          const dropEdited = originalToEdited(dropOriginal);

          const newOverlay: BrollOverlay = {
            id: generateId("broll_drop"),
            assetId,
            start: Math.round(dropEdited * 10) / 10,
            end: Math.min(editedDuration, Math.round((dropEdited + 3) * 10) / 10),
            reason: "שיבוץ בגרירה",
            position: "center"
          };

          pushStateToHistory(cuts, [...brollOverlays, newOverlay]);
          setSelectedBrollId(newOverlay.id);
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickXFromLeft = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(1, clickXFromLeft / rect.width));
          onSeek(pct * duration);
        }}
      >
        {brollOverlays.map((o) => {
          const asset = assets.find((a) => a.id === o.assetId);
          const oStart = editedToOriginal(o.start);
          const oEnd = editedToOriginal(o.end);
          const left = (oStart / duration) * 100;
          const width = Math.max(1.2, ((oEnd - oStart) / duration) * 100);
          const isSelected = o.id === selectedBrollId;

          return (
            <div
              key={o.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBrollId(o.id);
                setSelectedCutId(null);
              }}
              style={{
                position: "absolute",
                top: 4,
                bottom: 4,
                left: `${left}%`,
                width: `${width}%`,
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#fff",
                borderRadius: "5px",
                border: isSelected ? "3px solid #facc15" : "1px solid #6d28d9",
                boxShadow: isSelected ? "0 0 10px rgba(250,204,21,0.9)" : "none",
                fontSize: "11px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
                padding: "0 6px",
                zIndex: isSelected ? 16 : 11,
                cursor: "pointer"
              }}
              title={`B-Roll: ${asset?.fileName || "נכס"} (${o.start.toFixed(1)}s - ${o.end.toFixed(1)}s)`}
            >
              {asset?.fileName || "B-Roll"}
            </div>
          );
        })}

        {/* Playhead on Track 2 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${playheadPercent}%`,
            width: "2px",
            background: "#dc2626",
            zIndex: 25,
            pointerEvents: "none"
          }}
        />
      </div>

      {/* Time axis (LTR: 00:00 on the left, duration on the right) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#64748b",
          marginBottom: "16px",
          direction: "ltr"
        }}
      >
        <span>00:00</span>
        <span>
          <bdi className="bdi-num">{(duration / 2).toFixed(1)}s</bdi>
        </span>
        <span>
          <bdi className="bdi-num">{duration.toFixed(1)}s</bdi>
        </span>
      </div>

      {/* Selected Segment Control (Cut OR B-Roll) */}
      {selectedBroll ? (
        <div
          style={{
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "16px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge badge-repetition">B-ROLL</span>
              <strong style={{ fontSize: "14px", color: "#4c1d95" }}>
                {selectedBrollAsset?.fileName || "נכס B-Roll"}
              </strong>
              <span style={{ color: "#6b21a8", fontSize: "13px" }}>({selectedBroll.reason})</span>
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleDeleteBrollOverlay}
              style={{ fontSize: "12px", padding: "4px 10px", color: "#b91c1c", borderColor: "#fca5a5" }}
            >
              הסר שיבוץ B-Roll
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", fontSize: "13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#475569" }}>התחלה:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustBrollStart(-0.2)}
              >
                -0.2s
              </button>
              <bdi className="bdi-num" style={{ fontWeight: 700, padding: "0 4px" }}>
                {selectedBroll.start.toFixed(2)}s
              </bdi>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustBrollStart(0.2)}
              >
                +0.2s
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#475569" }}>סיום:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustBrollEnd(-0.2)}
              >
                -0.2s
              </button>
              <bdi className="bdi-num" style={{ fontWeight: 700, padding: "0 4px" }}>
                {selectedBroll.end.toFixed(2)}s
              </bdi>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustBrollEnd(0.2)}
              >
                +0.2s
              </button>
            </div>
          </div>
        </div>
      ) : selectedKeep ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "16px"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              flexWrap: "wrap",
              gap: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge" style={{ background: "#059669", color: "#fff" }}>
                מקטע פעיל בסרטון (KEEP)
              </span>
              <strong style={{ fontSize: "14px", color: "#065f46" }}>
                טווח:{" "}
                <bdi className="bdi-num">
                  {selectedKeep.start.toFixed(2)}s - {selectedKeep.end.toFixed(2)}s
                </bdi>{" "}
                (אורך: <bdi className="bdi-num">{(selectedKeep.end - selectedKeep.start).toFixed(2)}s</bdi>)
              </strong>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn btn-secondary"
                onClick={handleOpenFineTuneKeep}
                style={{
                  fontSize: "12px",
                  padding: "5px 12px",
                  background: "#f0fdf4",
                  borderColor: "#86efac",
                  color: "#15803d",
                  fontWeight: 700
                }}
                title="פתח חלון כוונון עדין למקטע זה עם נגן בלופ"
              >
                כוונון עדין (Fine Tuning)
              </button>
              {onPlaySegment && (
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    onPlaySegment({ start: selectedKeep.start, end: selectedKeep.end, source: "original" })
                  }
                  style={{
                    fontSize: "12px",
                    padding: "5px 12px",
                    background: "#d1fae5",
                    borderColor: "#6ee7b7",
                    color: "#065f46",
                    fontWeight: 600
                  }}
                  title="נגן רק את המקטע הזה ועצור בסיומו"
                >
                  לראות רק אותו (Solo Preview)
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={handleCutSelectedKeep}
                style={{
                  fontSize: "12px",
                  padding: "5px 12px",
                  color: "#b91c1c",
                  borderColor: "#fca5a5",
                  background: "#fef2f2",
                  fontWeight: 700
                }}
                title="הפוך מקטע זה לחיתוך אדום (הנגן ידלג עליו) - מקש Del"
              >
                הפוך לאדום ודלג עליו (Del)
              </button>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "#047857" }}>
            לחיצה על כפתור זה תהפוך את החלק הירוק הזה למקטע אדום (חיתוך) — הנגן והסרטון המרונדר ידלגו מעליו לחלוטין.
          </div>
        </div>
      ) : selectedCut ? (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            padding: "14px 18px",
            marginBottom: "16px"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              flexWrap: "wrap",
              gap: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className={`badge badge-${selectedCut.type}`}>{selectedCut.type.toUpperCase()}</span>
              {selectedCut.locked && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#7c2d12",
                    background: "#fef3c7",
                    border: "1px solid #fcd34d",
                    borderRadius: "6px",
                    padding: "2px 6px"
                  }}
                >
                  🔒 נעול
                </span>
              )}
              <strong style={{ fontSize: "14px", color: "#0f172a" }}>{selectedCut.reason}</strong>
              {selectedCut.text && <span style={{ color: "#64748b", fontSize: "13px" }}>"{selectedCut.text}"</span>}
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn btn-secondary"
                onClick={handleToggleLockSelected}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  background: selectedCut.locked ? "#fef3c7" : "#f1f5f9",
                  borderColor: selectedCut.locked ? "#fcd34d" : "#cbd5e1",
                  color: selectedCut.locked ? "#7c2d12" : "#334155",
                  fontWeight: 700
                }}
                title="נעל חתך זה כדי שסימנת שסיימת איתו — AI (עידון / ניתוח מחדש) לא יגע בו"
              >
                {selectedCut.locked ? "🔓 שחרר נעילה" : "🔒 נעל (סיימתי איתו)"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleOpenFineTuneCut}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  background: "#fef2f2",
                  borderColor: "#fca5a5",
                  color: "#991b1b",
                  fontWeight: 700
                }}
                title="פתח חלון כוונון עדין למקטע זה עם נגן בלופ"
              >
                כוונון עדין (Fine Tuning)
              </button>
              {onPlaySegment && (
                <button
                  className="btn btn-secondary"
                  onClick={() => onPlaySegment({ start: selectedCut.start, end: selectedCut.end, source: "original" })}
                  style={{
                    fontSize: "12px",
                    padding: "4px 10px",
                    background: "#eff6ff",
                    borderColor: "#93c5fd",
                    color: "#1d4ed8",
                    fontWeight: 600
                  }}
                  title="נגן מקטע חתוך זה מתוך סרטון המקור המקורי כדי לשמוע מה נחתך"
                >
                  לראות רק אותו (מהמקור)
                </button>
              )}
              <button
                className={selectedCut.status === "cut" ? "btn btn-primary" : "btn btn-secondary"}
                onClick={handleToggleSelected}
                style={{ fontSize: "12px", padding: "4px 10px" }}
              >
                {selectedCut.status === "cut" ? "החזר לירוק (אל תדלג)" : "הפוך לאדום (דלג)"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDeleteSelectedCut}
                style={{ fontSize: "12px", padding: "4px 10px", color: "#166534", borderColor: "#bbf7d0", background: "#f0fdf4" }}
                title="מחק את החיתוך האדום והחזר את המקטע להיות ירוק בסרטון"
              >
                החזר לירוק (מחק חיתוך)
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", fontSize: "13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#475569" }}>התחלה:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustStart(-0.2)}
              >
                -0.2s
              </button>
              <bdi className="bdi-num" style={{ fontWeight: 700, padding: "0 4px" }}>
                {selectedCut.start.toFixed(2)}s
              </bdi>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustStart(0.2)}
              >
                +0.2s
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#475569" }}>סיום:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "2px 8px" }}
                onClick={() => handleAdjustEnd(-0.2)}
              >
                -0.2s
              </button>
              <bdi className="bdi-num" style={{ fontWeight: 700, padding: "0 4px" }}>
                {selectedCut.end.toFixed(2)}s
              </bdi>
              <button className="btn btn-secondary" style={{ padding: "2px 8px" }} onClick={() => handleAdjustEnd(0.2)}>
                +0.2s
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
          לחץ על מקטע ירוק (סרטון שמור), אדום (חיתוך) או סגול (B-Roll) כדי לראות רק אותו, להתאים זמנים או למחוק.
        </div>
      )}

      {/* Add Custom Cut Section */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          borderTop: "1px solid #e2e8f0",
          paddingTop: "14px",
          flexWrap: "wrap"
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>הוסף חיתוך ידני:</span>
        <input
          type="number"
          placeholder="התחלה (שניות)"
          value={manualStart}
          onChange={(e) => setManualStart(e.target.value)}
          className="input-text"
          style={{ width: "130px", fontSize: "13px", padding: "5px 10px" }}
          step="0.1"
          min="0"
          max={duration}
        />
        <input
          type="number"
          placeholder="סיום (שניות)"
          value={manualEnd}
          onChange={(e) => setManualEnd(e.target.value)}
          className="input-text"
          style={{ width: "130px", fontSize: "13px", padding: "5px 10px" }}
          step="0.1"
          min="0"
          max={duration}
        />
        <button
          className="btn btn-secondary"
          onClick={handleAddManualCut}
          style={{ fontSize: "13px", padding: "5px 14px" }}
        >
          הוסף חיתוך
        </button>
      </div>

      {/* Segment Fine Tune Modal */}
      {fineTuneConfig && (
        <SegmentFineTuneModal
          isOpen={fineTuneModalOpen}
          onClose={() => setFineTuneModalOpen(false)}
          videoSrc={originalVideoUrl}
          projectId={projectId}
          totalDuration={duration}
          initialStart={fineTuneConfig.start}
          initialEnd={fineTuneConfig.end}
          isCut={fineTuneConfig.isCut}
          title={fineTuneConfig.title}
          words={words}
          onSave={handleSaveFineTune}
          onApplySubCuts={handleApplySubCuts}
        />
      )}
    </div>
  );
};
