import React, { useState } from "react";
import { CutSegment, KeepSegment } from "../../../shared";

interface TimelineViewProps {
  duration: number;
  cuts: CutSegment[];
  keepTimeline: KeepSegment[];
  onToggleCut: (cutId: string) => void;
  onSeek?: (sec: number) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ duration, cuts, keepTimeline, onToggleCut, onSeek }) => {
  const [hoveredCut, setHoveredCut] = useState<CutSegment | null>(null);

  if (duration <= 0) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>⏱️ ציר זמן עריכה (Timeline)</h3>
        <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#475569" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", background: "#10b981", borderRadius: "3px" }}></span>
            נשמר (KEEP)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", background: "#ef4444", borderRadius: "3px" }}></span>
            נחתך (CUT)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", background: "#3b82f6", borderRadius: "3px" }}></span>
            שוחזר (RESTORED)
          </span>
        </div>
      </div>

      <div className="timeline-track">
        {/* Render KEEP segments */}
        {keepTimeline.map((seg, idx) => {
          const leftPercent = (seg.start / duration) * 100;
          const widthPercent = ((seg.end - seg.start) / duration) * 100;
          return (
            <div
              key={`keep_${idx}`}
              className="timeline-segment-keep"
              style={{
                right: `${leftPercent}%`,
                width: `${widthPercent}%`
              }}
              title={`שמור: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
              onClick={() => onSeek?.(seg.start)}
            />
          );
        })}

        {/* Render CUT segments */}
        {cuts.map((cut) => {
          const leftPercent = (cut.start / duration) * 100;
          const widthPercent = Math.max(0.6, ((cut.end - cut.start) / duration) * 100);
          const isRestored = cut.status === "restored";

          return (
            <div
              key={cut.id}
              className={isRestored ? "timeline-segment-restored" : "timeline-segment-cut"}
              style={{
                right: `${leftPercent}%`,
                width: `${widthPercent}%`
              }}
              onMouseEnter={() => setHoveredCut(cut)}
              onClick={() => {
                onSeek?.(cut.start);
                onToggleCut(cut.id);
              }}
              title={`${cut.type}: ${cut.start.toFixed(1)}s - ${cut.end.toFixed(1)}s (${cut.reason})`}
            />
          );
        })}
      </div>

      {/* Details of hovered or selected cut */}
      {hoveredCut && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "8px"
          }}
        >
          <div>
            <strong style={{ color: "#0f172a" }}>{hoveredCut.type.toUpperCase()}: </strong>
            <span style={{ color: "#334155" }}>{hoveredCut.reason}</span>
            <span style={{ margin: "0 8px", color: "#cbd5e1" }}>|</span>
            <span style={{ color: "#64748b" }}>זמנים: </span>
            <bdi className="bdi-num" style={{ color: "#0f172a" }}>
              {hoveredCut.start.toFixed(2)}s - {hoveredCut.end.toFixed(2)}s
            </bdi>
            {hoveredCut.text && <span style={{ marginRight: "10px", color: "#475569" }}>("{hoveredCut.text}")</span>}
          </div>

          <button
            className={hoveredCut.status === "cut" ? "btn btn-secondary" : "btn btn-primary"}
            style={{ padding: "4px 12px", fontSize: "13px" }}
            onClick={() => onToggleCut(hoveredCut.id)}
          >
            {hoveredCut.status === "cut" ? "שחזר קטע זה" : "חתוך שוב"}
          </button>
        </div>
      )}
    </div>
  );
};
