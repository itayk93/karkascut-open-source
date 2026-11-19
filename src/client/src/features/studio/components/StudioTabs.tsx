import React from "react";
import { Project, CaptionStylePreset, Word } from "../../../shared";
import { TranscriptEditor } from "../../timeline";
import { CaptionTemplatePicker } from "../../export";
import { BrollManager } from "../../broll";

interface StudioTabsProps {
  project: Project;
  activeTab: "transcript" | "captions" | "media" | "audio";
  onTabChange: (tab: "transcript" | "captions" | "media" | "audio") => void;
  isVerticalMode: boolean;
  onProjectUpdated: (project: Project) => void;
  onToggleCut: (cutId: string) => void;
  onUpdateTranscriptWords: (words: Word[]) => void;
  onSeek: (sec: number) => void;
  onReRender: () => void;
  uploadBrollAsset: (file: File, title?: string) => Promise<unknown>;
  updateBrollAssetHint: (assetId: string, placementHint: string) => Promise<unknown>;
  deleteBrollAsset: (assetId: string) => Promise<unknown>;
  autoMatchBroll: () => Promise<unknown>;
  isMatchingBroll: boolean;
  onApplyEyeContact: () => void;
  isApplyingEyeContact: boolean;
}

export const StudioTabs: React.FC<StudioTabsProps> = ({
  project,
  activeTab,
  onTabChange,
  isVerticalMode,
  onProjectUpdated,
  onToggleCut,
  onUpdateTranscriptWords,
  onSeek,
  onReRender,
  uploadBrollAsset,
  updateBrollAssetHint,
  deleteBrollAsset,
  autoMatchBroll,
  isMatchingBroll,
  onApplyEyeContact,
  isApplyingEyeContact
}) => {
  return (
    <div className="studio-inspector-col">
      {/* Tab Switcher */}
      <div className="studio-tabs-bar">
        <button
          className={`studio-tab-btn ${activeTab === "transcript" ? "active" : ""}`}
          onClick={() => onTabChange("transcript")}
        >
          תמלול ועריכה
        </button>
        <button
          className={`studio-tab-btn ${activeTab === "captions" ? "active" : ""}`}
          onClick={() => onTabChange("captions")}
        >
          עיצוב כתוביות
        </button>
        <button
          className={`studio-tab-btn ${activeTab === "media" ? "active" : ""}`}
          onClick={() => onTabChange("media")}
        >
          מדיה ו-B-Roll
        </button>
        <button
          className={`studio-tab-btn ${activeTab === "audio" ? "active" : ""}`}
          onClick={() => onTabChange("audio")}
        >
          סאונד ושיפורים
        </button>
      </div>

      {/* Tab Content */}
      <div className="studio-tab-body">
        {activeTab === "transcript" && project.transcript && (
          <TranscriptEditor
            words={project.transcript.words}
            cuts={project.cuts}
            onToggleCut={onToggleCut}
            onUpdateWords={onUpdateTranscriptWords}
            onSeek={onSeek}
          />
        )}

        {activeTab === "captions" && (
          <div>
            <CaptionTemplatePicker
              isModal={false}
              selectedPreset={project.renderPreferences?.captionsStyle || "hormozi"}
              onSelect={(preset: CaptionStylePreset) => {
                const updatedPrefs = {
                  ...(project.renderPreferences || {
                    makeVertical: isVerticalMode,
                    burnCaptions: true,
                    captionsStyle: "hormozi" as const
                  }),
                  captionsStyle: preset
                };
                onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
              }}
            />
            <div style={{ marginTop: "16px", textAlign: "left" }}>
              <button
                className="btn btn-primary"
                onClick={onReRender}
                style={{ background: "#0f172a", fontSize: "13px", padding: "6px 16px" }}
              >
                החל עיצוב כתוביות
              </button>
            </div>
          </div>
        )}

        {activeTab === "media" && (
          <BrollManager
            projectId={project.id}
            assets={project.assets || []}
            overlays={project.brollOverlays || []}
            onUploadAsset={async (f) => { await uploadBrollAsset(f); }}
            onUpdateAssetHint={async (id, hint) => { await updateBrollAssetHint(id, hint); }}
            onDeleteAsset={async (id) => { await deleteBrollAsset(id); }}
            onAutoMatchBroll={async () => { await autoMatchBroll(); }}
            isMatching={isMatchingBroll}
          />
        )}

        {activeTab === "audio" && (
          <div>
            {/* Studio Sound Toggle */}
            <div className="toggle-row">
              <div>
                <div className="toggle-row-title">סאונד אולפן (Studio Sound)</div>
                <div className="toggle-row-desc">ניקוי רעשי רקע, הד ורחשים, והדגשת קול הדובר</div>
              </div>
              <button
                className={project.renderPreferences?.studioAudio ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: "12px", padding: "5px 14px" }}
                onClick={() => {
                  const curr = !!project.renderPreferences?.studioAudio;
                  const updatedPrefs = {
                    ...(project.renderPreferences || {
                      makeVertical: isVerticalMode,
                      burnCaptions: true,
                      captionsStyle: "hormozi" as const
                    }),
                    studioAudio: !curr
                  };
                  onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                }}
              >
                {project.renderPreferences?.studioAudio ? "פעיל" : "כבוי"}
              </button>
            </div>

            {/* Auto Zoom Toggle */}
            <div className="toggle-row">
              <div>
                <div className="toggle-row-title">זום דינמי (Punch Zoom)</div>
                <div className="toggle-row-desc">התקרבות חכמה לסירוגין לשמירה על עניין הצופה</div>
              </div>
              <button
                className={project.renderPreferences?.autoZoom ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: "12px", padding: "5px 14px" }}
                onClick={() => {
                  const curr = !!project.renderPreferences?.autoZoom;
                  const updatedPrefs = {
                    ...(project.renderPreferences || {
                      makeVertical: isVerticalMode,
                      burnCaptions: true,
                      captionsStyle: "hormozi" as const
                    }),
                    autoZoom: !curr
                  };
                  onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                }}
              >
                {project.renderPreferences?.autoZoom ? "פעיל" : "כבוי"}
              </button>
            </div>

            {/* Transition SFX Toggle */}
            <div className="toggle-row">
              <div>
                <div className="toggle-row-title">אפקטי מעבר קוליים (Whoosh)</div>
                <div className="toggle-row-desc">הוספת צליל מעבר קצר בכניסת מקטעים ו-B-Roll</div>
              </div>
              <button
                className={project.renderPreferences?.transitionSfx ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: "12px", padding: "5px 14px" }}
                onClick={() => {
                  const curr = !!project.renderPreferences?.transitionSfx;
                  const updatedPrefs = {
                    ...(project.renderPreferences || {
                      makeVertical: isVerticalMode,
                      burnCaptions: true,
                      captionsStyle: "hormozi" as const
                    }),
                    transitionSfx: !curr
                  };
                  onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                }}
              >
                {project.renderPreferences?.transitionSfx ? "פעיל" : "כבוי"}
              </button>
            </div>

            {/* Eye Contact Toggle */}
            <div className="toggle-row">
              <div>
                <div className="toggle-row-title">מיקוד מבט (Eye Contact)</div>
                <div className="toggle-row-desc">
                  ללא מפתח NVIDIA מופעל תיקון מקומי ניסיוני, שאינו מבטיח מבט למצלמה
                  <br />
                  עם מפתח NVIDIA הסרטון נשלח לענן; במקרה של כשל מופעל התיקון המקומי
                  <br />
                  בדקו את התוצאה לפני ייצוא
                </div>
              </div>
              <button
                className={project.eyeContactApplied ? "btn btn-primary" : "btn btn-secondary"}
                style={{ fontSize: "12px", padding: "5px 14px" }}
                onClick={onApplyEyeContact}
                disabled={isApplyingEyeContact}
              >
                {isApplyingEyeContact ? "מעבד..." : project.eyeContactApplied ? "פעיל" : "הפעל תיקון"}
              </button>
            </div>

            {/* Background Music */}
            <div className="toggle-row" style={{ flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="toggle-row-title">מוזיקת רקע</div>
                  <div className="toggle-row-desc">מוזיקה שמונמכת אוטומטית בזמן דיבור (Ducking)</div>
                </div>
                <button
                  className={
                    project.renderPreferences?.backgroundMusic?.enabled ? "btn btn-primary" : "btn btn-secondary"
                  }
                  style={{ fontSize: "12px", padding: "5px 14px" }}
                  onClick={() => {
                    const currMusic = project.renderPreferences?.backgroundMusic || {
                      enabled: false,
                      trackId: "lofi_chill",
                      volume: 0.25
                    };
                    const updatedPrefs = {
                      ...(project.renderPreferences || {
                        makeVertical: isVerticalMode,
                        burnCaptions: true,
                        captionsStyle: "hormozi" as const
                      }),
                      backgroundMusic: {
                        ...currMusic,
                        enabled: !currMusic.enabled
                      }
                    };
                    onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                  }}
                >
                  {project.renderPreferences?.backgroundMusic?.enabled ? "פעיל" : "כבוי"}
                </button>
              </div>

              {project.renderPreferences?.backgroundMusic?.enabled && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    paddingTop: "10px",
                    borderTop: "1px solid #e2e8f0"
                  }}
                >
                  <select
                    value={project.renderPreferences?.backgroundMusic?.trackId || "lofi_chill"}
                    onChange={(e) => {
                      const trackId = e.target.value;
                      const currMusic = project.renderPreferences?.backgroundMusic || {
                        enabled: true,
                        trackId: "lofi_chill",
                        volume: 0.25
                      };
                      const updatedPrefs = {
                        ...(project.renderPreferences || {
                          makeVertical: isVerticalMode,
                          burnCaptions: true,
                          captionsStyle: "hormozi" as const
                        }),
                        backgroundMusic: {
                          ...currMusic,
                          trackId
                        }
                      };
                      onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      flex: 1
                    }}
                  >
                    <option value="lofi_chill">☕ Lo-Fi Chill Beats (רגוע)</option>
                    <option value="upbeat_vibe">⚡ Upbeat Vibe (אנרגטי וקצבי)</option>
                  </select>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>ווליום:</span>
                    <input
                      type="range"
                      min="0.05"
                      max="0.8"
                      step="0.05"
                      value={project.renderPreferences?.backgroundMusic?.volume ?? 0.25}
                      onChange={(e) => {
                        const volume = parseFloat(e.target.value);
                        const currMusic = project.renderPreferences?.backgroundMusic || {
                          enabled: true,
                          trackId: "lofi_chill",
                          volume: 0.25
                        };
                        const updatedPrefs = {
                          ...(project.renderPreferences || {
                            makeVertical: isVerticalMode,
                            burnCaptions: true,
                            captionsStyle: "hormozi" as const
                          }),
                          backgroundMusic: {
                            ...currMusic,
                            volume
                          }
                        };
                        onProjectUpdated({ ...project, renderPreferences: updatedPrefs });
                      }}
                      style={{ width: "80px" }}
                    />
                    <span style={{ fontSize: "12px", fontWeight: 700, minWidth: "35px" }}>
                      {Math.round((project.renderPreferences?.backgroundMusic?.volume ?? 0.25) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Save & Re-render Button */}
            <div style={{ marginTop: "20px", textAlign: "left" }}>
              <button
                className="btn btn-primary"
                onClick={onReRender}
                style={{ background: "#0f172a", fontSize: "13px", padding: "6px 18px" }}
              >
                שמור הגדרות סאונד ורנדר מחדש
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
