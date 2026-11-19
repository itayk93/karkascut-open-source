import React, { useState } from "react";
import { Project } from "../../../shared";

interface ProjectDashboardProps {
  projects: Project[];
  uploading: boolean;
  uploadError: string | null;
  isKeyConfigured: boolean;
  isMobileScreen: boolean;
  onSelectProject: (proj: Project) => void;
  onDeleteProject: (id: string) => void;
  onDeleteProjects: (ids: string[]) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSettings: () => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projects,
  uploading,
  uploadError,
  isKeyConfigured,
  isMobileScreen,
  onSelectProject,
  onDeleteProject,
  onDeleteProjects,
  onFileSelect,
  onOpenSettings
}) => {
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);

  const toggleSelectProject = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedProjectIds.size === projects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(projects.map((p) => p.id)));
    }
  };

  const confirmSingleDelete = () => {
    if (projectToDelete) {
      onDeleteProject(projectToDelete);
      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(projectToDelete);
        return next;
      });
      setProjectToDelete(null);
    }
  };

  const confirmBatchDelete = () => {
    const ids = Array.from(selectedProjectIds);
    if (ids.length > 0) {
      onDeleteProjects(ids);
      setSelectedProjectIds(new Set());
      setShowBatchDeleteModal(false);
    }
  };

  const allSelected = projects.length > 0 && selectedProjectIds.size === projects.length;

  return (
    <>
      {/* Top Header */}
      {isMobileScreen ? (
        <div className="mobile-app-header" style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>AutoCut</div>
          <div className="mobile-app-right-actions">
            <button
              className="mobile-app-export-btn"
              onClick={() => document.getElementById("video-file-input")?.click()}
              disabled={uploading}
            >
              {uploading ? "מעלה..." : "סרטון חדש"}
            </button>
            <button className="mobile-app-gear-btn" onClick={onOpenSettings} title="הגדרות ומפתחות">
              ⚙
            </button>
          </div>
        </div>
      ) : (
        <header className="app-header">
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>AutoCut</h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              עריכה אוטומטית חכמה לסרטוני Reels ו-Talking Head
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className={isKeyConfigured ? "btn btn-secondary" : "btn btn-primary"}
              style={{ fontSize: "13px", padding: "6px 14px" }}
              onClick={onOpenSettings}
            >
              {isKeyConfigured ? "הגדרות ומפתחות" : "הגדרת מפתחות API"}
            </button>
          </div>
        </header>
      )}

      {/* Upload Dropzone */}
      <div
        className="card"
        style={{
          textAlign: "center",
          border: "2px dashed #cbd5e1",
          padding: "48px 20px",
          background: "#ffffff",
          marginBottom: "32px"
        }}
      >
        <input
          type="file"
          id="video-file-input"
          accept="video/mp4,video/quicktime,video/webm"
          style={{ display: "none" }}
          onChange={onFileSelect}
          disabled={uploading}
        />
        <label
          htmlFor="video-file-input"
          style={{ cursor: uploading ? "not-allowed" : "pointer", display: "inline-block" }}
        >
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "#f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#334155"
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
            {uploading ? "מעלה ומנתח את הווידאו..." : "בחר סרטון וידאו לתחילת העבודה"}
          </h3>
          <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
            תומך בפורמטים MP4, MOV, WebM (מומלץ סרטון דיבור/ריל)
          </p>
        </label>

        {uploadError && (
          <div
            style={{
              color: "#dc2626",
              background: "#fee2e2",
              padding: "10px 16px",
              borderRadius: "8px",
              marginTop: "16px",
              fontSize: "14px",
              display: "inline-block"
            }}
          >
            {uploadError}
          </div>
        )}
      </div>

      {/* Projects Section */}
      {projects.length > 0 && (
        <div>
          {/* Header & Multi-selection Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                פרויקטים שמורים ({projects.length})
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "12px", padding: "3px 10px" }}
                onClick={handleSelectAll}
              >
                {allSelected ? "בטל בחירת הכל" : "בחר הכל"}
              </button>
            </div>

            {selectedProjectIds.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  padding: "4px 12px",
                  borderRadius: "8px"
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#991b1b" }}>
                  נבחרו {selectedProjectIds.size} פרויקטים
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    fontSize: "12px",
                    padding: "3px 12px",
                    background: "#dc2626",
                    borderColor: "#dc2626"
                  }}
                  onClick={() => setShowBatchDeleteModal(true)}
                >
                  מחק נבחרים
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "12px", padding: "3px 8px" }}
                  onClick={() => setSelectedProjectIds(new Set())}
                >
                  ביטול
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px"
            }}
          >
            {projects.map((p) => {
              const isSelected = selectedProjectIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    position: "relative",
                    border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                    background: isSelected ? "#f8fafc" : "#ffffff",
                    boxShadow: isSelected ? "0 0 0 1px #2563eb, 0 4px 12px rgba(37,99,235,0.1)" : undefined,
                    transition: "all 0.15s ease"
                  }}
                  onClick={() => onSelectProject(p)}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectProject(p.id, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: "#2563eb"
                          }}
                          title="סמן לבחירה מרובה"
                        />
                        <h4
                          style={{
                            margin: 0,
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "#0f172a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "160px"
                          }}
                          title={p.originalFileName}
                        >
                          <bdi dir="ltr">{p.originalFileName}</bdi>
                        </h4>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          flexShrink: 0,
                          background:
                            p.status === "ready" || p.status === "exported"
                              ? "#dcfce7"
                              : p.status === "error"
                                ? "#fee2e2"
                                : "#e0f2fe",
                          color:
                            p.status === "ready" || p.status === "exported"
                              ? "#15803d"
                              : p.status === "error"
                                ? "#b91c1c"
                                : "#0369a1"
                        }}
                      >
                        {p.status === "ready"
                          ? "מוכן"
                          : p.status === "exported"
                            ? "מיוצא"
                            : p.status === "error"
                              ? "שגיאה"
                              : "מעבד..."}
                      </span>
                    </div>

                    <div style={{ fontSize: "12px", color: "#64748b", display: "flex", gap: "12px", paddingRight: "26px" }}>
                      <span>
                        משך: <bdi className="bdi-num">{p.duration > 0 ? `${p.duration.toFixed(1)}s` : "--"}</bdi>
                      </span>
                      {p.cuts && (
                        <span>
                          חיתוכים: <bdi className="bdi-num">{p.cuts.filter((c) => c.status === "cut").length}</bdi>
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", paddingRight: "26px" }}>
                      נוצר: {new Date(p.createdAt).toLocaleDateString("he-IL")}{" "}
                      {new Date(p.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "14px",
                      borderTop: "1px solid #f1f5f9",
                      paddingTop: "10px"
                    }}
                  >
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: "12px", padding: "4px 12px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(p);
                      }}
                    >
                      פתח פרויקט
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: "12px", padding: "4px 10px", color: "#dc2626", borderColor: "#fecaca" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(p.id);
                      }}
                      title="מחק פרויקט"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single Project Delete Confirmation Modal */}
      {projectToDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }}
          onClick={() => setProjectToDelete(null)}
        >
          <div
            className="card"
            style={{ maxWidth: "380px", width: "90%", padding: "24px", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>מחיקת פרויקט</h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>
              האם אתה בטוח שברצונך למחוק פרויקט זה לצמיתות? לא ניתן לשחזר פעולה זו.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={() => setProjectToDelete(null)}>
                ביטול
              </button>
              <button
                className="btn btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmSingleDelete}
              >
                מחק לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }}
          onClick={() => setShowBatchDeleteModal(false)}
        >
          <div
            className="card"
            style={{ maxWidth: "420px", width: "90%", padding: "24px", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>
              מחיקת {selectedProjectIds.size} פרויקטים
            </h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>
              האם אתה בטוח שברצונך למחוק {selectedProjectIds.size} פרויקטים נבחרים לצמיתות? לא ניתן לשחזר פעולה זו.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={() => setShowBatchDeleteModal(false)}>
                ביטול
              </button>
              <button
                className="btn btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmBatchDelete}
              >
                מחק {selectedProjectIds.size} פרויקטים
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
