import React from "react";
import { CutSegment, Word } from "../../../shared";

interface TranscriptEditorProps {
  words: Word[];
  cuts: CutSegment[];
  onToggleCut: (cutId: string) => void;
  onUpdateWords?: (updatedWords: Word[]) => void;
  onSeek?: (sec: number) => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  words,
  cuts,
  onToggleCut,
  onUpdateWords,
  onSeek
}) => {
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editValue, setEditValue] = React.useState<string>("");
  const [hasChanges, setHasChanges] = React.useState<boolean>(false);
  const [localWords, setLocalWords] = React.useState<Word[]>(words);

  React.useEffect(() => {
    setLocalWords(words);
    setHasChanges(false);
  }, [words]);

  if (!localWords || localWords.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px", color: "#0f172a" }}>
          תמלול ועריכה סמנטית
        </h3>
        <p style={{ color: "#64748b" }}>אין עדיין תמלול זמין.</p>
      </div>
    );
  }

  const getWordCut = (w: Word): CutSegment | undefined => {
    return cuts.find((c) => w.start >= c.start - 0.05 && w.end <= c.end + 0.05);
  };

  const handleStartEdit = (idx: number, currentWord: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingIndex(idx);
    setEditValue(currentWord);
  };

  const handleSaveWordEdit = (idx: number) => {
    const trimmed = editValue.trim();
    const target = localWords[idx];
    if (trimmed && target && trimmed !== target.word) {
      const updated = localWords.map((w, i) => (i === idx ? { ...w, word: trimmed } : w));
      setLocalWords(updated);
      setHasChanges(true);
    }
    setEditingIndex(null);
  };

  const handleDeleteWord = (idx: number) => {
    if (!localWords[idx]) return;
    setLocalWords(localWords.filter((_, i) => i !== idx));
    setHasChanges(true);
    setEditingIndex(null);
  };

  const handleCommitAllWordChanges = () => {
    if (onUpdateWords) {
      onUpdateWords(localWords);
      setHasChanges(false);
    }
  };

  return (
    <div className="card">
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
            עריכת תמלול וכתוביות (תיקון שגיאות כתיב)
          </h3>
          <span style={{ fontSize: "12px", color: "#64748b" }}>(דאבל-קליק על מילה לתיקון; „מחק ✕" או Backspace על שדה ריק כדי למחוק מילה)</span>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {hasChanges && (
            <button
              className="btn btn-primary"
              onClick={handleCommitAllWordChanges}
              style={{ padding: "6px 14px", fontSize: "13px", background: "#059669" }}
            >
              שמור תיקוני כתוביות
            </button>
          )}
          <div style={{ fontSize: "13px", color: "#64748b" }}>* לחץ על קטע אדום כדי לשחזר</div>
        </div>
      </div>

      <div className="transcript-box" style={{ lineHeight: "2.2" }}>
        {localWords.map((w, idx) => {
          const cut = getWordCut(w);

          if (editingIndex === idx) {
            return (
              <span key={`w_edit_${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", margin: "0 2px" }}>
                <input
                  type="text"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSaveWordEdit(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveWordEdit(idx);
                    if (e.key === "Escape") setEditingIndex(null);
                    if ((e.key === "Backspace" || e.key === "Delete") && editValue === "") {
                      e.preventDefault();
                      handleDeleteWord(idx);
                    }
                  }}
                  style={{
                    padding: "2px 6px",
                    fontSize: "14px",
                    fontWeight: 700,
                    border: "2px solid #6366f1",
                    borderRadius: "4px",
                    outline: "none",
                    width: `${Math.max(60, editValue.length * 12)}px`,
                    textAlign: "right"
                  }}
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleDeleteWord(idx);
                  }}
                  title="מחק מילה זו מהתמלול ומהכתוביות"
                  style={{
                    border: "none",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "3px 7px",
                    cursor: "pointer"
                  }}
                >
                  מחק ✕
                </button>
              </span>
            );
          }

          if (!cut) {
            return (
              <span
                key={`w_${idx}`}
                style={{
                  cursor: "pointer",
                  margin: "0 3px",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  transition: "background 0.15s"
                }}
                onDoubleClick={(e) => handleStartEdit(idx, w.word, e)}
                onClick={() => onSeek?.(w.start)}
                title={`זמן: ${w.start.toFixed(2)}s (דאבל-קליק לעריכת כתיב)`}
                className="hover-highlight-word"
              >
                {w.word}
              </span>
            );
          }

          const isCut = cut.status === "cut";
          return (
            <span
              key={`w_${idx}`}
              className={isCut ? "transcript-cut" : "transcript-restored"}
              onClick={() => onToggleCut(cut.id)}
              onDoubleClick={(e) => handleStartEdit(idx, w.word, e)}
              title={`${cut.type.toUpperCase()}: ${cut.reason} (קליק לשינוי חיתוך, דאבל-קליק לעריכת טקסט)`}
              style={{ margin: "0 3px" }}
            >
              {w.word}
            </span>
          );
        })}
      </div>

      {/* List of cuts for detailed management */}
      <div style={{ marginTop: "20px" }}>
        <h4 style={{ fontSize: "15px", fontWeight: 600, color: "#334155", marginBottom: "10px" }}>
          רשימת מקטעים שנחתכו ({cuts.length}):
        </h4>
        <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {cuts.map((cut) => {
            const isCut = cut.status === "cut";
            return (
              <div
                key={cut.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: isCut ? "#fff5f5" : "#f0fdf4",
                  border: isCut ? "1px solid #fed7d7" : "1px solid #bbf7d0",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "14px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className={`badge badge-${cut.type}`}>{cut.type.toUpperCase()}</span>
                  <bdi className="bdi-num" style={{ color: "#64748b", fontSize: "12px" }}>
                    [{cut.start.toFixed(2)}s - {cut.end.toFixed(2)}s]
                  </bdi>
                  <span style={{ color: isCut ? "#991b1b" : "#166534", fontWeight: 500 }}>{cut.reason}</span>
                  {cut.text && <span style={{ color: "#64748b", fontSize: "13px" }}>"{cut.text}"</span>}
                </div>

                <button
                  className={isCut ? "btn btn-secondary" : "btn btn-primary"}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                  onClick={() => onToggleCut(cut.id)}
                >
                  {isCut ? "שחזר" : "חתוך שוב"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
