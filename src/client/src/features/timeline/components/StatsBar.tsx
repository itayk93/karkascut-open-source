import React from "react";
import { ProjectStats, CutCategory } from "../../../shared";

interface StatsBarProps {
  stats: ProjectStats;
}

const CATEGORY_LABELS: Record<CutCategory, string> = {
  silence: "שתיקות",
  filler: "גמגומים ומילות מילוי",
  false_start: "התחלות כושלות",
  retake: "טייקים חוזרים",
  repetition: "חזרות",
  correction: "תיקונים",
  dead_content: "תוכן מיותר",
  manual: "חיתוכים ידניים"
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  const percentSaved =
    stats.originalDuration > 0 ? Math.round((stats.totalRemovedSeconds / stats.originalDuration) * 100) : 0;

  return (
    <div className="card">
      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "#0f172a" }}>
        סיכום עריכה וקיצוץ שתיקות
      </h3>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-title">משך מקורי</div>
          <div className="stat-value">
            <bdi className="bdi-num">{formatDuration(stats.originalDuration)}</bdi>
          </div>
        </div>

        <div className="stat-box" style={{ borderColor: "#cbd5e1", background: "#f8fafc" }}>
          <div className="stat-title" style={{ color: "#334155" }}>
            משך ערוך (נקי)
          </div>
          <div className="stat-value" style={{ color: "#0f172a" }}>
            <bdi className="bdi-num">{formatDuration(stats.cleanedDuration)}</bdi>
          </div>
        </div>

        <div className="stat-box" style={{ borderColor: "#cbd5e1", background: "#f8fafc" }}>
          <div className="stat-title" style={{ color: "#475569" }}>
            נחתך ונחסך
          </div>
          <div className="stat-value" style={{ color: "#0f172a" }}>
            <bdi className="bdi-num">{formatDuration(stats.totalRemovedSeconds)}</bdi>
            <span style={{ fontSize: "13px", fontWeight: 600, marginRight: "8px", color: "#059669" }}>
              (<bdi className="bdi-num">{percentSaved}%</bdi>-)
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
        <div style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px", fontWeight: 600 }}>
          פירוט שניות שנחתכו לפי קטגוריה:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {Object.entries(stats.breakdown).map(([key, sec]) => {
            if (sec <= 0) return null;
            return (
              <div
                key={key}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span style={{ color: "#334155" }}>{CATEGORY_LABELS[key as CutCategory] || key}:</span>
                <bdi className="bdi-num" style={{ fontWeight: 700, color: "#0f172a" }}>
                  {sec.toFixed(1)} שניות
                </bdi>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
