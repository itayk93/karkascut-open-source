import React, { useState } from "react";

interface UploadScriptModalProps {
  isOpen: boolean;
  fileName: string;
  onConfirm: (script: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export const UploadScriptModal: React.FC<UploadScriptModalProps> = ({
  isOpen,
  fileName,
  onConfirm,
  onSkip,
  onCancel
}) => {
  const [scriptText, setScriptText] = useState<string>("");

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(6px)",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "680px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          padding: "28px",
          direction: "rtl"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}
        >
          <div>
            <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              יש לך סקריפט / תסריט לסרטון?
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0" }}>
              קובץ נבחר:{" "}
              <bdi dir="ltr">
                <strong style={{ color: "#334155" }}>{fileName}</strong>
              </bdi>
            </p>
          </div>

          <button className="btn btn-secondary" onClick={onCancel} style={{ padding: "4px 10px", fontSize: "14px" }}>
            ✕
          </button>
        </div>

        {/* Info Box */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#166534",
            lineHeight: 1.6
          }}
        >
          <strong>למה כדאי להדביק את הסקריפט כאן?</strong>
          <ul style={{ margin: "6px 0 0", paddingRight: "18px" }}>
            <li>
              <strong>זיהוי טייקים כושלים:</strong> ה-AI יידע בדיוק מתי חזרת על משפט עד שהצלחת, ויחתוך את הטייקים
              השגויים אוטומטית.
            </li>
            <li>
              <strong>כתוביות מדויקות 100%:</strong> מניעת שגיאות כתיב של התמלול והתאמה מושלמת למילים שתכננת לומר.
            </li>
          </ul>
        </div>

        {/* Text Area */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            הדבק את הסקריפט המקורי:
          </label>
          <textarea
            dir="rtl"
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={"\u200Fהדבק כאן את הטקסט של הסרטון (מה שקראת מהטלפרומפטר או התכוננת להגיד)...\u200F"}
            rows={7}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1.5px solid #cbd5e1",
              fontSize: "14px",
              lineHeight: 1.5,
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
              direction: "rtl",
              textAlign: "right",
              unicodeBidi: "plaintext"
            }}
          />
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap"
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSkip}
            style={{ fontSize: "13px", padding: "8px 16px" }}
            title="המשך עיבוד רגיל ללא סקריפט"
          >
            דלג ועבד ללא סקריפט
          </button>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              style={{ fontSize: "13px", padding: "8px 14px" }}
            >
              ביטול
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onConfirm(scriptText)}
              style={{
                fontSize: "13px",
                padding: "8px 22px",
                background: "#0f172a",
                borderColor: "#0f172a",
                fontWeight: 700
              }}
            >
              התחל עיבוד עם סקריפט
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
