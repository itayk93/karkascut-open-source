import React, { useState } from "react";
import { Project } from "../../../shared";

interface StudioTopbarProps {
  project: Project;
  onBack: () => void;
  onExportFinalVideo: () => void;
  onDownloadFinalVideo: () => void;
  onExportPremiereXml: () => void;
  onExportJsonPlan: () => void;
  onImportJsonPlan: (file: File) => void;
  onRotateSource: (degrees: 90 | 180 | 270) => void;
  isRotatingSource: boolean;
  onApplyEyeContact: () => void;
  isApplyingEyeContact: boolean;
  onToggleLogs: () => void;
}

export const StudioTopbar: React.FC<StudioTopbarProps> = ({
  project,
  onBack,
  onExportFinalVideo,
  onDownloadFinalVideo,
  onExportPremiereXml,
  onExportJsonPlan,
  onImportJsonPlan,
  onRotateSource,
  isRotatingSource,
  onApplyEyeContact,
  isApplyingEyeContact,
  onToggleLogs
}) => {
  const [showMoreActions, setShowMoreActions] = useState<boolean>(false);

  const handleJsonFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportJsonPlan(file);
    e.target.value = "";
  };

  return (
    <div className="studio-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button
          className="btn btn-secondary"
          onClick={onBack}
          style={{ fontSize: "12px", padding: "4px 10px" }}
          title="חזור לכל הפרויקטים"
        >
          → כל הפרויקטים
        </button>
        <div style={{ height: "18px", width: "1px", background: "#e2e8f0" }} />
        <div className="studio-project-title">
          <bdi dir="ltr">{project.originalFileName}</bdi>
        </div>
        <span className="studio-status-pill ready">{project.status === "exported" ? "מיוצא" : "מוכן"}</span>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          <bdi className="bdi-num">{project.duration.toFixed(1)}s</bdi>
        </span>
        {project.stats?.originalDuration && (
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            <bdi>
              (מקור: <bdi className="bdi-num">{project.stats.originalDuration.toFixed(1)}s</bdi>)
            </bdi>
          </span>
        )}
      </div>

      {/* Actions: Export & Menu */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          className="btn btn-primary"
          onClick={onExportFinalVideo}
          style={{ background: "#0f172a", fontSize: "13px", padding: "6px 18px" }}
        >
          ייצוא וידאו
        </button>

        {project.finalVideoPath && (
          <button
            className="btn btn-secondary"
            onClick={onDownloadFinalVideo}
            style={{ fontSize: "13px", padding: "6px 12px" }}
            title="שמור קובץ סופי במחשב"
          >
            הורד קובץ
          </button>
        )}

        {/* More Actions Dropdown */}
        <div className="actions-dropdown">
          <button
            className="btn btn-secondary"
            onClick={() => setShowMoreActions(!showMoreActions)}
            style={{ padding: "6px 10px", fontSize: "13px", fontWeight: 700 }}
            title="פעולות נוספות"
          >
            •••
          </button>
          {showMoreActions && (
            <div className="actions-menu" onClick={() => setShowMoreActions(false)}>
              <button className="actions-menu-item" onClick={onExportPremiereXml}>
                ייצא ל-Premiere (XML)
              </button>
              <button className="actions-menu-item" onClick={onExportJsonPlan}>
                ייצא תוכנית JSON
              </button>

              <label className="actions-menu-item" style={{ cursor: "pointer", margin: 0 }}>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleJsonFileInput}
                />
                ייבא תוכנית מ-JSON...
              </label>

              <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />

              <button className="actions-menu-item" onClick={() => onRotateSource(90)} disabled={isRotatingSource}>
                {isRotatingSource ? "מסובב מקור..." : "סובב וידאו מקור 90° (שעון)"}
              </button>

              <button
                className="actions-menu-item"
                onClick={onApplyEyeContact}
                disabled={isApplyingEyeContact}
                title="ללא מפתח NVIDIA מופעל תיקון מקומי ניסיוני. עם מפתח, הסרטון נשלח ל-NVIDIA; במקרה של כשל יופעל התיקון המקומי. יש לבדוק את התוצאה"
              >
                {isApplyingEyeContact ? "מבצע תיקון..." : "תיקון קשר עין"}
              </button>

              <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />

              <button className="actions-menu-item" onClick={onToggleLogs}>
                פתח טרמינל לוגים חי
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
