import React from "react";
import { LiveLogsTerminal } from "./LiveLogsTerminal";

interface ProcessingPipelineStatusProps {
  currentStepIndex?: number;
  processingStep?: string;
  logs?: string[];
  isExporting?: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}

const STEPS = [
  { id: 1, title: "חילוץ אודיו", desc: "FFmpeg 16kHz" },
  { id: 2, title: "תמלול דיבור", desc: "OpenAI Whisper" },
  { id: 3, title: "זיהוי שתיקות", desc: "FFmpeg silencedetect" },
  { id: 4, title: "עריכה סמנטית", desc: "GPT-4o-mini" },
  { id: 5, title: "רינדור וידאו", desc: "FFmpeg Concat" }
];

export const ProcessingPipelineStatus: React.FC<ProcessingPipelineStatusProps> = ({
  currentStepIndex = 1,
  processingStep = "מעבד...",
  logs = [],
  isExporting = false,
  onCancel,
  isCancelling = false
}) => {
  const activeIdx = Math.min(5, Math.max(1, currentStepIndex));
  const progressPercent = isExporting ? 90 : Math.round((activeIdx / 5) * 100);

  return (
    <div
      className="card"
      style={{ border: "1px solid #e2e8f0", background: "#ffffff", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}
    >
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#3b82f6",
              boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.15)"
            }}
          />
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", margin: 0 }}>
              {isExporting ? "רינדור סופי בתהליך..." : "עיבוד וידאו בתהליך"}
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "3px 0 0 0" }}>{processingStep}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#3b82f6", fontVariantNumeric: "tabular-nums" }}>
            <bdi className="bdi-num">{progressPercent}%</bdi>
          </div>

          {onCancel && (
            <button
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={isCancelling}
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                color: "#dc2626",
                borderColor: "#fca5a5",
                background: "#fef2f2",
                fontWeight: 600
              }}
              title="עצור את פעולת הרינדור/העיבוד הנוכחית וחזור לעורך"
            >
              {isCancelling ? "עוצר..." : "עצור רינדור"}
            </button>
          )}
        </div>
      </div>

      {/* Modern Sleek Progress Bar */}
      <div className="sleek-progress-bar">
        <div className="sleek-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Steps list */}
      {!isExporting && (
        <div className="steps-container" style={{ marginTop: "16px" }}>
          {STEPS.map((step) => {
            const isDone = activeIdx > step.id;
            const isActive = activeIdx === step.id;
            const statusClass = isDone ? "done" : isActive ? "active" : "pending";

            return (
              <div key={step.id} className={`step-card ${statusClass}`}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                  <span className="step-num">{isDone ? "✓" : step.id}</span>
                  <span style={{ fontWeight: 500, fontSize: "12px" }}>{step.title}</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginRight: "24px" }}>{step.desc}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real-time Logs Terminal */}
      <LiveLogsTerminal logs={logs} isActive={true} />
    </div>
  );
};
