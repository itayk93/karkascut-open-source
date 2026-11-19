import React, { useRef, useState, useEffect } from "react";
import { api, SegmentSubCut, Word } from "../../../shared";

interface SegmentFineTuneModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc: string;
  projectId: string;
  totalDuration: number;
  initialStart: number;
  initialEnd: number;
  isCut: boolean;
  title?: string;
  words?: Word[];
  onSave: (newStart: number, newEnd: number, isCut: boolean) => void;
  onApplySubCuts: (subCuts: SegmentSubCut[], window: { start: number; end: number }) => void;
}

export interface FineTuneSlice {
  id: string;
  start: number;
  end: number;
  duration: number;
  isCut: boolean; // true = red (חתוך / יירד מהסרטון), false = green (שמור / יישאר בסרטון)
  type: SegmentSubCut["type"] | "speech";
  reason: string;
  text?: string;
}

const SUBCUT_LABELS: Record<string, string> = {
  filler: "מילת מילוי",
  false_start: "התחלה שנזנחה",
  retake: "טייק חוזר",
  repetition: "גמגום / חזרה",
  correction: "תיקון עצמי",
  dead_content: "זמן מת",
  speech: "דיבור / תוכן רציף"
};

function buildFineTuneSlices(
  segStart: number,
  segEnd: number,
  subCuts: SegmentSubCut[],
  words?: Word[]
): FineTuneSlice[] {
  const sStart = Math.round(segStart * 100) / 100;
  const sEnd = Math.round(segEnd * 100) / 100;
  const sorted = [...subCuts].sort((a, b) => a.start - b.start);
  const slices: FineTuneSlice[] = [];
  let cursor = sStart;

  const getWordsInSpan = (s: number, e: number) => {
    if (!words || words.length === 0) return "";
    return words
      .filter((w) => w.start >= s - 0.15 && w.end <= e + 0.15)
      .map((w) => w.word)
      .join(" ")
      .trim();
  };

  let idx = 0;
  for (const c of sorted) {
    const cStart = Math.max(sStart, Math.round(c.start * 100) / 100);
    const cEnd = Math.min(sEnd, Math.round(c.end * 100) / 100);
    if (cEnd <= cStart) continue;

    // Speech gap before subcut
    if (cStart - cursor >= 0.05) {
      const speechStart = cursor;
      const speechEnd = cStart;
      const speechText = getWordsInSpan(speechStart, speechEnd);
      slices.push({
        id: `slice_sp_${idx++}`,
        start: speechStart,
        end: speechEnd,
        duration: Math.round((speechEnd - speechStart) * 100) / 100,
        isCut: false, // GREEN / KEPT
        type: "speech",
        reason: speechText ? `דיבור: "${speechText.slice(0, 35)}${speechText.length > 35 ? "..." : ""}"` : "דיבור / תוכן רציף",
        text: speechText
      });
    }

    // Cut subcut
    const cutText = c.text || getWordsInSpan(cStart, cEnd);
    slices.push({
      id: `slice_cut_${idx++}`,
      start: cStart,
      end: cEnd,
      duration: Math.round((cEnd - cStart) * 100) / 100,
      isCut: true, // RED / CUT
      type: c.type,
      reason: c.reason,
      text: cutText
    });

    cursor = Math.max(cursor, cEnd);
  }

  // Trailing speech gap
  if (sEnd - cursor >= 0.05) {
    const speechStart = cursor;
    const speechEnd = sEnd;
    const speechText = getWordsInSpan(speechStart, speechEnd);
    slices.push({
      id: `slice_sp_${idx++}`,
      start: speechStart,
      end: speechEnd,
      duration: Math.round((speechEnd - speechStart) * 100) / 100,
      isCut: false, // GREEN / KEPT
      type: "speech",
      reason: speechText ? `דיבור: "${speechText.slice(0, 35)}${speechText.length > 35 ? "..." : ""}"` : "דיבור / תוכן רציף",
      text: speechText
    });
  }

  return slices;
}

export const SegmentFineTuneModal: React.FC<SegmentFineTuneModalProps> = ({
  isOpen,
  onClose,
  videoSrc,
  totalDuration,
  initialStart,
  initialEnd,
  isCut: initialIsCut,
  projectId,
  title = "כוונון עדין של מקטע (Fine Tuning)",
  words = [],
  onSave,
  onApplySubCuts
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState<number>(initialStart);
  const [end, setEnd] = useState<number>(initialEnd);
  const [isCut, setIsCut] = useState<boolean>(initialIsCut);
  const [currentTime, setCurrentTime] = useState<number>(initialStart);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // AI segment re-analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [subCuts, setSubCuts] = useState<SegmentSubCut[] | null>(null);
  const [slices, setSlices] = useState<FineTuneSlice[] | null>(null);
  const [previewRange, setPreviewRange] = useState<{ start: number; end: number; sliceId?: string } | null>(null);
  const [aiUnavailableReason, setAiUnavailableReason] = useState<string | undefined>();
  const [usedAI, setUsedAI] = useState<boolean>(true);

  const analysisVersion = useRef(0);
  useEffect(() => {
    analysisVersion.current += 1;
    setSubCuts(null);
    setSlices(null);
    setIsAnalyzing(false);
  }, [start, end, isOpen]);

  useEffect(() => {
    setStart(Math.round(initialStart * 100) / 100);
    setEnd(Math.round(initialEnd * 100) / 100);
    setIsCut(initialIsCut);
    setCurrentTime(initialStart);
    setSubCuts(null);
    setSlices(null);
    setPreviewRange(null);
    setAnalyzeError(null);
    setUsedAI(true);
  }, [initialStart, initialEnd, initialIsCut, isOpen]);

  // Pause any other video on the page (e.g. the main studio player) while this modal is open
  useEffect(() => {
    if (!isOpen) return;
    document.querySelectorAll("video").forEach((v) => {
      if (v !== videoRef.current) {
        try {
          v.pause();
        } catch {
          /* noop */
        }
      }
    });
  }, [isOpen]);

  // Video seek on open
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.currentTime = initialStart;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isOpen, initialStart]);

  if (!isOpen) return null;

  const duration = Math.max(0.01, Math.round((end - start) * 100) / 100);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    if (previewRange) {
      if (t >= previewRange.end) {
        if (isLooping) {
          videoRef.current.currentTime = previewRange.start;
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
          setPreviewRange(null);
        }
      }
    } else if (t >= end) {
      if (isLooping) {
        videoRef.current.currentTime = start;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const adjustStart = (delta: number) => {
    setPreviewRange(null);
    const nextStart = Math.max(0, Math.min(end - 0.05, Math.round((start + delta) * 100) / 100));
    setStart(nextStart);
    if (videoRef.current) {
      videoRef.current.currentTime = nextStart;
    }
  };

  const adjustEnd = (delta: number) => {
    setPreviewRange(null);
    const nextEnd = Math.min(totalDuration, Math.max(start + 0.05, Math.round((end + delta) * 100) / 100));
    setEnd(nextEnd);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    setPreviewRange(null);
    if (videoRef.current.paused) {
      if (videoRef.current.currentTime >= end || videoRef.current.currentTime < start) {
        videoRef.current.currentTime = start;
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleJumpToStart = () => {
    setPreviewRange(null);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handlePlaySlice = (slice: FineTuneSlice) => {
    if (!videoRef.current) return;
    if (previewRange && previewRange.sliceId === slice.id && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setPreviewRange(null);
      return;
    }
    setPreviewRange({ start: slice.start, end: slice.end, sliceId: slice.id });
    videoRef.current.currentTime = slice.start;
    videoRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {});
  };

  const handleToggleSliceCut = (sliceId: string) => {
    setSlices((prev) =>
      prev ? prev.map((s) => (s.id === sliceId ? { ...s, isCut: !s.isCut } : s)) : prev
    );
  };

  const handleSetAllSlicesCut = (allCut: boolean) => {
    setSlices((prev) => (prev ? prev.map((s) => ({ ...s, isCut: allCut })) : prev));
  };

  const handleResetToAiDefaults = () => {
    if (!subCuts) return;
    setSlices(buildFineTuneSlices(start, end, subCuts, words));
  };

  const handleApply = () => {
    if (slices) {
      handleApplySubCuts();
      return;
    }
    onSave(start, end, isCut);
    onClose();
  };

  const handleReanalyze = async () => {
    const version = ++analysisVersion.current;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setSubCuts(null);
    setSlices(null);
    setPreviewRange(null);
    if (videoRef.current) videoRef.current.pause();
    try {
      const res = await api.reanalyzeSegment(projectId, start, end);
      if (version !== analysisVersion.current) return;
      setSubCuts(res.subCuts);
      setUsedAI(res.usedAI);
      setAiUnavailableReason(res.aiUnavailableReason);
      const built = buildFineTuneSlices(start, end, res.subCuts, words);
      setSlices(built);
    } catch (err) {
      if (version !== analysisVersion.current) return;
      setAnalyzeError(err instanceof Error ? err.message : "שגיאה בניתוח מחודש");
    } finally {
      if (version === analysisVersion.current) setIsAnalyzing(false);
    }
  };

  const handleApplySubCuts = () => {
    if (!slices) return;
    const cutsToApply: SegmentSubCut[] = slices
      .filter((s) => s.isCut)
      .map((s) => ({
        start: s.start,
        end: s.end,
        type: (s.type === "speech" ? "dead_content" : s.type) as SegmentSubCut["type"],
        confidence: 1,
        reason: s.reason,
        text: s.text || ""
      }));
    onApplySubCuts(cutsToApply, { start, end });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "24px",
          direction: "rtl"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "12px"
          }}
        >
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{title}</h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0 0" }}>
              צפה במקטע בלופ מדויק ובצע כוונון נקודתי של זמני ההתחלה והסיום
            </p>
          </div>

          <button className="btn btn-secondary" onClick={onClose} style={{ padding: "4px 10px", fontSize: "14px" }}>
            ✕
          </button>
        </div>

        {/* Video Player Preview for Segment */}
        <div
          style={{
            background: "#090d16",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "18px"
          }}
        >
          <video crossOrigin="anonymous"
            ref={videoRef}
            src={videoSrc}
            onTimeUpdate={handleTimeUpdate}
            style={{
              maxHeight: "340px",
              width: "100%",
              objectFit: "contain",
              background: "#000"
            }}
          />

          {/* Quick Player Bar */}
          <div
            style={{
              width: "100%",
              padding: "10px 16px",
              background: "rgba(15, 23, 42, 0.95)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#fff",
              fontSize: "13px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                className="btn btn-primary"
                onClick={handlePlayPause}
                style={{ padding: "4px 14px", fontSize: "12px" }}
              >
                {isPlaying ? "⏸️ השהה" : "▶️ נגן"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleJumpToStart}
                style={{ padding: "4px 10px", fontSize: "12px" }}
                title="קפוץ לתחילת המקטע"
              >
                ⏮️ להתחלה
              </button>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <input type="checkbox" checked={isLooping} onChange={(e) => setIsLooping(e.target.checked)} />
                נגן בלופ (חזרתי)
              </label>
            </div>

            <div>
              זמן נוכחי: <bdi className="bdi-num">{currentTime.toFixed(2)}s</bdi>
              {previewRange && (
                <span
                  style={{
                    marginRight: "10px",
                    background: "#4f46e5",
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "11px"
                  }}
                >
                  טווח מבודד: <bdi className="bdi-num">{previewRange.start.toFixed(2)}s - {previewRange.end.toFixed(2)}s</bdi>{" "}
                  <button
                    onClick={() => {
                      setPreviewRange(null);
                      if (videoRef.current) {
                        videoRef.current.currentTime = start;
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      padding: "0 2px"
                    }}
                    title="בטל בידוד טווח"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Toggle: Keep (Green) vs Cut (Red) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: isCut ? "#fef2f2" : "#ecfdf5",
            border: `1px solid ${isCut ? "#fecaca" : "#a7f3d0"}`,
            borderRadius: "10px",
            padding: "12px 18px",
            marginBottom: "18px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div>
              <strong style={{ color: isCut ? "#991b1b" : "#065f46", fontSize: "14px" }}>
                {isCut ? "מקטע חתוך (אדום - יירד מהסרטון המרונדר)" : "מקטע שמור (ירוק - יישאר בסרטון המרונדר)"}
              </strong>
              <div style={{ fontSize: "12px", color: isCut ? "#b91c1c" : "#047857" }}>
                משך המקטע: <bdi className="bdi-num">{duration.toFixed(2)}s</bdi>
              </div>
            </div>
          </div>

          <button
            className={isCut ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setIsCut(!isCut)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              background: isCut ? "#10b981" : "#ef4444",
              borderColor: isCut ? "#10b981" : "#ef4444",
              color: "#fff"
            }}
          >
            {isCut ? "הפוך לשמור (השאר בסרטון)" : "הפוך לחתוך (הורד מהסרטון)"}
          </button>
        </div>

        {/* AI Fine Tuning: re-analyze this segment and slice into micro-cuts */}
        <div
          style={{
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "18px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <div>
              <strong style={{ fontSize: "14px", color: "#3730a3" }}>ניתוח מחודש עם AI (Fine Tuning)</strong>
              <div style={{ fontSize: "12px", color: "#4f46e5", marginTop: "2px" }}>
                מפרק את המקטע לחתיכות: רק זמן מת, גמגומים, התחלות שנזנחו ומשפטים לא גמורים יישארו חתוכים — השאר יחזור לסרטון
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleReanalyze}
              disabled={isAnalyzing}
              style={{ background: "#4f46e5", borderColor: "#4f46e5", padding: "8px 16px", fontSize: "13px", whiteSpace: "nowrap" }}
            >
              {isAnalyzing ? "מנתח..." : "🤖 נתח וחתוך לחתיכות"}
            </button>
          </div>

          {analyzeError && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "#b91c1c" }}>{analyzeError}</div>
          )}

          {subCuts && !usedAI && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "#b45309" }}>
              {aiUnavailableReason === "missing_key"
                ? "מפתח OpenAI חסר בהגדרות. הניתוח השתמש בזיהוי שקט וחזרות בלבד."
                : aiUnavailableReason === "no_transcript"
                  ? "אין תמלול בטווח הזה. הניתוח השתמש בזיהוי שקט בלבד."
                  : "הניתוח מול OpenAI לא הושלם. אין פירוש הדבר שהמפתח נמחק. הניתוח השתמש בזיהוי שקט וחזרות בלבד."}
            </div>
          )}

          {slices && slices.length === 0 && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "#047857" }}>
              ה-AI לא מצא חתכים נוספים במקטע הזה.
            </div>
          )}

          {slices && slices.length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "8px"
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  חלוקה רציפה של המקטע ({slices.length} חלקים):{" "}
                  <span style={{ color: "#b91c1c" }}>{slices.filter((s) => s.isCut).length} לחיתוך (אדום)</span>
                  {" | "}
                  <span style={{ color: "#047857" }}>{slices.filter((s) => !s.isCut).length} לשמירה (ירוק)</span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleSetAllSlicesCut(false)}
                    style={{ padding: "3px 8px", fontSize: "11px", color: "#065f46", borderColor: "#a7f3d0" }}
                    title="סמן את כל החלקים כשמורים בסרטון (ירוק)"
                  >
                    🟢 סמן הכל לשמירה
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleSetAllSlicesCut(true)}
                    style={{ padding: "3px 8px", fontSize: "11px", color: "#991b1b", borderColor: "#fecaca" }}
                    title="סמן את כל החלקים כחתוכים מהסרטון (אדום)"
                  >
                    🔴 סמן הכל לחיתוך
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleResetToAiDefaults}
                    style={{ padding: "3px 8px", fontSize: "11px" }}
                    title="שחזר להמלצות ה-AI המקוריות"
                  >
                    🔄 אפס להמלצות
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "260px",
                  overflowY: "auto",
                  paddingRight: "2px"
                }}
              >
                {slices.map((s) => {
                  const isSlicePlaying = previewRange?.sliceId === s.id && isPlaying;
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        background: s.isCut ? "#fef2f2" : "#ecfdf5",
                        border: `1.5px solid ${s.isCut ? "#fecaca" : "#a7f3d0"}`,
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontSize: "12px",
                        boxShadow: isSlicePlaying ? "0 0 0 2px #6366f1" : "none",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: "3px 8px",
                            fontSize: "12px",
                            background: isSlicePlaying ? "#6366f1" : "#fff",
                            color: isSlicePlaying ? "#fff" : "inherit",
                            borderColor: isSlicePlaying ? "#6366f1" : "#cbd5e1"
                          }}
                          onClick={() => handlePlaySlice(s)}
                          title={isSlicePlaying ? "עצור ניגון" : `נגן טווח זה בלבד (${s.duration.toFixed(2)}s)`}
                        >
                          {isSlicePlaying ? "⏸️" : "▶️"}
                        </button>

                        <bdi className="bdi-num" style={{ fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
                          {s.start.toFixed(2)}s - {s.end.toFixed(2)}s
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginRight: "4px" }}>
                            ({s.duration.toFixed(2)}s)
                          </span>
                        </bdi>

                        <span
                          style={{
                            padding: "1px 8px",
                            borderRadius: "10px",
                            fontSize: "11px",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            background: s.isCut ? "#fee2e2" : "#d1fae5",
                            color: s.isCut ? "#b91c1c" : "#047857"
                          }}
                        >
                          {s.isCut ? "חתוך (אדום)" : "שמור (ירוק)"}
                        </span>

                        <span style={{ color: s.isCut ? "#991b1b" : "#065f46", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {SUBCUT_LABELS[s.type] || s.type}
                        </span>

                        <span
                          style={{
                            color: "#475569",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                          title={s.text ? `${s.reason} | "${s.text}"` : s.reason}
                        >
                          {s.text ? `"${s.text}"` : s.reason}
                        </span>
                      </div>

                      <button
                        className="btn btn-secondary"
                        onClick={() => handleToggleSliceCut(s.id)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          background: s.isCut ? "#10b981" : "#ef4444",
                          borderColor: s.isCut ? "#10b981" : "#ef4444",
                          color: "#fff"
                        }}
                        title={s.isCut ? "הפוך קטע זה לשמור (ירוק)" : "הפוך קטע זה לחתוך (אדום)"}
                      >
                        {s.isCut ? "הפוך לשמור (ירוק)" : "הפוך לחתוך (אדום)"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn btn-primary"
                onClick={handleApplySubCuts}
                style={{
                  marginTop: "12px",
                  width: "100%",
                  background: "#4f46e5",
                  borderColor: "#4f46e5",
                  padding: "9px 18px",
                  fontSize: "13px",
                  fontWeight: 700
                }}
              >
                פרק והחל חלוקה לציר הזמן ({slices.filter((s) => s.isCut).length} חתכים באדום,{" "}
                {slices.filter((s) => !s.isCut).length} מקטעים שמורים בירוק)
              </button>
            </div>
          )}
        </div>

        {/* Fine Tuning Controls: Start & End */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          {/* Start Boundary */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>נקודת התחלה:</span>
              <bdi className="bdi-num" style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                {start.toFixed(2)}s
              </bdi>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(-0.5)}
              >
                -0.5s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(-0.1)}
              >
                -0.1s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(-0.05)}
              >
                -0.05s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(0.05)}
              >
                +0.05s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(0.1)}
              >
                +0.1s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustStart(0.5)}
              >
                +0.5s
              </button>
            </div>

            <input
              type="number"
              step="0.01"
              min="0"
              max={end - 0.05}
              value={start}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) setStart(Math.max(0, Math.min(end - 0.05, Math.round(val * 100) / 100)));
              }}
              className="input-text"
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }}
            />
          </div>

          {/* End Boundary */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>נקודת סיום:</span>
              <bdi className="bdi-num" style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                {end.toFixed(2)}s
              </bdi>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(-0.5)}
              >
                -0.5s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(-0.1)}
              >
                -0.1s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(-0.05)}
              >
                -0.05s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(0.05)}
              >
                +0.05s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(0.1)}
              >
                +0.1s
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => adjustEnd(0.5)}
              >
                +0.5s
              </button>
            </div>

            <input
              type="number"
              step="0.01"
              min={start + 0.05}
              max={totalDuration}
              value={end}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) setEnd(Math.min(totalDuration, Math.max(start + 0.05, Math.round(val * 100) / 100)));
              }}
              className="input-text"
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px" }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px"
          }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={isAnalyzing}
            style={{ background: "#0f172a", padding: "8px 22px" }}
          >
            {slices ? "החל חלוקה לציר הזמן" : "שמור שינויים במקטע"}
          </button>
        </div>
      </div>
    </div>
  );
};
