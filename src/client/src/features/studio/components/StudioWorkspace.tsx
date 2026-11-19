import React, { useState } from "react";
import { Project, Word, CutSegment, BrollOverlay, RenderPreferences, apiUrl } from "../../../shared";
import { VideoPlayer } from "./VideoPlayer";
import { TimelineEditor } from "../../timeline";
import { StudioTopbar } from "./StudioTopbar";
import { StudioTabs } from "./StudioTabs";
import { CaptionTemplatePicker } from "../../export";
import { LiveLogsTerminal } from "../../processing";

interface StudioWorkspaceProps {
  project: Project;
  videoCacheBuster: number;
  isMobileScreen: boolean;
  onBack: () => void;
  onOpenKeyModal: () => void;
  onProjectUpdated: (project: Project) => void;
  reRender: (preferences?: RenderPreferences) => Promise<void>;
  exportFinalVideo: (preferences?: RenderPreferences) => Promise<void>;
  downloadFinalVideo: () => void;
  exportPremiereXml: () => void;
  exportJsonPlan: () => void;
  importJsonPlan: (file: File) => Promise<void>;
  updateCuts: (cuts: CutSegment[]) => Promise<void>;
  toggleCut: (cutId: string) => Promise<void>;
  updateTranscriptWords: (words: Word[]) => Promise<void>;
  rotateVideo: (degrees: 90 | 180 | 270) => Promise<void>;
  runEyeContact: () => Promise<void>;
  uploadBrollAsset: (file: File, title?: string) => Promise<unknown>;
  updateBrollAssetHint: (assetId: string, placementHint: string) => Promise<unknown>;
  deleteBrollAsset: (assetId: string) => Promise<unknown>;
  autoMatchBroll: () => Promise<unknown>;
  isMatchingBroll: boolean;
  updateBrollOverlays: (overlays: BrollOverlay[]) => Promise<void>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  project,
  videoCacheBuster,
  isMobileScreen,
  onBack,
  onOpenKeyModal,
  onProjectUpdated,
  reRender,
  exportFinalVideo,
  downloadFinalVideo,
  exportPremiereXml,
  exportJsonPlan,
  importJsonPlan,
  updateCuts,
  toggleCut,
  updateTranscriptWords,
  rotateVideo,
  runEyeContact,
  uploadBrollAsset,
  updateBrollAssetHint,
  deleteBrollAsset,
  autoMatchBroll,
  isMatchingBroll,
  updateBrollOverlays,
  onFileSelect
}) => {
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isOriginalMode, setIsOriginalMode] = useState<boolean>(false);
  const [playbackSegment, setPlaybackSegment] = useState<{
    start: number;
    end: number;
    source?: "original" | "preview";
  } | null>(null);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [isVerticalMode, setIsVerticalMode] = useState<boolean>(true);
  const [showTemplatePickerModal, setShowTemplatePickerModal] = useState<boolean>(false);
  const [activeStudioTab, setActiveStudioTab] = useState<"transcript" | "captions" | "media" | "audio">("transcript");
  const [isRotatingSource, setIsRotatingSource] = useState<boolean>(false);
  const [isApplyingEyeContact, setIsApplyingEyeContact] = useState<boolean>(false);

  const handleRotateSource = async (degrees: 90 | 180 | 270) => {
    setIsRotatingSource(true);
    await rotateVideo(degrees);
    setIsRotatingSource(false);
  };

  const handleApplyEyeContact = async () => {
    setIsApplyingEyeContact(true);
    await runEyeContact();
    setIsApplyingEyeContact(false);
  };

  const handleTimelineSeek = (origSec: number) => {
    setCurrentTime(origSec);
    if (isOriginalMode || !project.keepTimeline || project.keepTimeline.length === 0) {
      setSeekTime(origSec);
    } else {
      let accumulated = 0;
      let foundInKeep = false;
      for (const seg of project.keepTimeline) {
        if (origSec >= seg.start && origSec <= seg.end) {
          setSeekTime(accumulated + (origSec - seg.start));
          foundInKeep = true;
          break;
        }
        if (origSec < seg.start) {
          setSeekTime(accumulated);
          foundInKeep = true;
          break;
        }
        accumulated += seg.end - seg.start;
      }
      if (!foundInKeep) {
        setSeekTime(accumulated);
      }
    }
  };

  return (
    <>
      {isMobileScreen ? (
        <div style={{ maxWidth: "480px", margin: "0 auto", paddingBottom: "32px" }}>
          {/* Mobile App Header */}
          <div className="mobile-app-header">
            <button className="mobile-app-close-btn" onClick={onBack} title="סגור פרויקט">
              ✕
            </button>

            <div className="mobile-app-title">
              <bdi dir="ltr">{project.originalFileName}</bdi>
            </div>

            <div className="mobile-app-right-actions">
              <button
                className="mobile-app-export-btn"
                onClick={() => exportFinalVideo()}
                style={{ background: "#0f172a", color: "#fff" }}
              >
                ייצוא
              </button>
              <button className="mobile-app-gear-btn" onClick={onOpenKeyModal} title="הגדרות ומפתחות">
                ⚙
              </button>
            </div>
          </div>

          {/* Mobile Video Player */}
          <div style={{ marginBottom: "16px" }}>
            <VideoPlayer
              originalVideoUrl={apiUrl(`/media/projects/${project.id}/original.mp4?v=${videoCacheBuster}`)}
              previewVideoUrl={
                project.previewVideoPath ? apiUrl(`/media/projects/${project.id}/preview.mp4?v=${videoCacheBuster}`) : undefined
              }
              rawOriginalVideoUrl={apiUrl(`/media/projects/${project.id}/raw-original.mp4?v=${videoCacheBuster}`)}
              hasEyeContact={!!project.eyeContactApplied}
              seekTime={seekTime}
              words={project.transcript?.words || []}
              keepSegments={project.keepTimeline || []}
              brollOverlays={project.brollOverlays || []}
              assets={project.assets || []}
              onTimeUpdate={(t, isPreview) => {
                if (!isPreview || !project.keepTimeline || project.keepTimeline.length === 0) {
                  setCurrentTime(t);
                } else {
                  let accumulated = 0;
                  let mappedTime = t;
                  for (const seg of project.keepTimeline) {
                    const segDuration = seg.end - seg.start;
                    if (t <= accumulated + segDuration + 0.05) {
                      mappedTime = seg.start + Math.max(0, t - accumulated);
                      break;
                    }
                    accumulated += segDuration;
                  }
                  setCurrentTime(mappedTime);
                }
              }}
              onSourceModeChange={(isOrig) => setIsOriginalMode(isOrig)}
              isVerticalMode={isVerticalMode}
              onToggleVerticalMode={() => setIsVerticalMode(!isVerticalMode)}
              captionsPreset={project.renderPreferences?.captionsStyle || "hormozi"}
              playbackSegment={playbackSegment}
              onClearPlaybackSegment={() => setPlaybackSegment(null)}
              isMobile={true}
            />
          </div>

          {/* Mobile Dock Toolbar */}
          <div className="mobile-dock">
            <button type="button" className="mobile-dock-card" onClick={() => setShowTemplatePickerModal(true)}>
              <div className="mobile-dock-label">כתוביות</div>
              <div className="mobile-dock-sub">{project.renderPreferences?.captionsStyle || "hormozi"}</div>
            </button>

            <label className="mobile-dock-card" style={{ cursor: "pointer", margin: 0 }}>
              <input type="file" accept="video/*" style={{ display: "none" }} onChange={onFileSelect} />
              <div className="mobile-dock-label">סרטון חדש</div>
              <div className="mobile-dock-sub">החלף</div>
            </label>

            <button type="button" className="mobile-dock-card" onClick={() => reRender()}>
              <div className="mobile-dock-label">סנכרון</div>
              <div className="mobile-dock-sub">עדכן</div>
            </button>

            <button type="button" className="mobile-dock-card primary" onClick={() => exportFinalVideo()}>
              <div className="mobile-dock-label">ייצוא</div>
              <div className="mobile-dock-sub">הורדה</div>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Studio Topbar */}
          <StudioTopbar
            project={project}
            onBack={onBack}
            onExportFinalVideo={() => exportFinalVideo()}
            onDownloadFinalVideo={downloadFinalVideo}
            onExportPremiereXml={exportPremiereXml}
            onExportJsonPlan={exportJsonPlan}
            onImportJsonPlan={importJsonPlan}
            onRotateSource={handleRotateSource}
            isRotatingSource={isRotatingSource}
            onApplyEyeContact={handleApplyEyeContact}
            isApplyingEyeContact={isApplyingEyeContact}
            onToggleLogs={() => setShowLogs(!showLogs)}
          />

          {/* Studio 2-Column Layout */}
          <div className="studio-main-grid">
            {/* Left Column: Video Player & B-Roll Quick Bar */}
            <div className="studio-player-col">
              <VideoPlayer
                originalVideoUrl={apiUrl(`/media/projects/${project.id}/original.mp4?v=${videoCacheBuster}`)}
                previewVideoUrl={
                  project.previewVideoPath
                    ? apiUrl(`/media/projects/${project.id}/preview.mp4?v=${videoCacheBuster}`)
                    : undefined
                }
                rawOriginalVideoUrl={apiUrl(`/media/projects/${project.id}/raw-original.mp4?v=${videoCacheBuster}`)}
                hasEyeContact={!!project.eyeContactApplied}
                seekTime={seekTime}
                words={project.transcript?.words || []}
                keepSegments={project.keepTimeline || []}
                brollOverlays={project.brollOverlays || []}
                assets={project.assets || []}
                onTimeUpdate={(t, isPreview) => {
                  if (!isPreview || !project.keepTimeline || project.keepTimeline.length === 0) {
                    setCurrentTime(t);
                  } else {
                    let accumulated = 0;
                    let mappedTime = t;
                    for (const seg of project.keepTimeline) {
                      const segDuration = seg.end - seg.start;
                      if (t <= accumulated + segDuration + 0.05) {
                        mappedTime = seg.start + Math.max(0, t - accumulated);
                        break;
                      }
                      accumulated += segDuration;
                    }
                    setCurrentTime(mappedTime);
                  }
                }}
                onSourceModeChange={(isOrig) => setIsOriginalMode(isOrig)}
                isVerticalMode={isVerticalMode}
                onToggleVerticalMode={() => setIsVerticalMode(!isVerticalMode)}
                captionsPreset={project.renderPreferences?.captionsStyle || "hormozi"}
                playbackSegment={playbackSegment}
                onClearPlaybackSegment={() => setPlaybackSegment(null)}
              />

              {/* Quick B-Roll Drag Strip */}
              {project.assets && project.assets.length > 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    marginTop: "12px",
                    border: "1px solid #e2e8f0"
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#475569",
                      marginBottom: "8px",
                      display: "flex",
                      justifyContent: "space-between"
                    }}
                  >
                    <span>מאגר B-Roll זמין (גרור לטיימליין):</span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>{project.assets.length} פריטים</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px" }}>
                    {project.assets.map((asset) => (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-broll-asset", asset.id);
                        }}
                        style={{
                          width: "80px",
                          height: "60px",
                          borderRadius: "6px",
                          overflow: "hidden",
                          position: "relative",
                          border: "1px solid #cbd5e1",
                          cursor: "grab",
                          flexShrink: 0
                        }}
                        title={`${asset.title} (גרור לטיימליין)`}
                      >
                        {asset.type === "video" ? (
                          <video crossOrigin="anonymous"
                            src={apiUrl(asset.fileUrl || `/media/projects/${project.id}/assets/${asset.fileName}`)}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <img crossOrigin="anonymous"
                            src={apiUrl(asset.fileUrl || `/media/projects/${project.id}/assets/${asset.fileName}`)}
                            alt={asset.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            fontSize: "10px",
                            padding: "1px 4px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {asset.title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Studio Tabs */}
            <StudioTabs
              project={project}
              activeTab={activeStudioTab}
              onTabChange={setActiveStudioTab}
              isVerticalMode={isVerticalMode}
              onProjectUpdated={onProjectUpdated}
              onToggleCut={toggleCut}
              onUpdateTranscriptWords={updateTranscriptWords}
              onSeek={(sec) => setSeekTime(sec)}
              onReRender={() => reRender()}
              uploadBrollAsset={uploadBrollAsset}
              updateBrollAssetHint={updateBrollAssetHint}
              deleteBrollAsset={deleteBrollAsset}
              autoMatchBroll={autoMatchBroll}
              isMatchingBroll={isMatchingBroll}
              onApplyEyeContact={handleApplyEyeContact}
              isApplyingEyeContact={isApplyingEyeContact}
            />
          </div>

          {/* Full Width Timeline Editor */}
          <div style={{ marginTop: "16px", width: "100%" }}>
            <TimelineEditor
              projectId={project.id}
              duration={project.duration}
              cuts={project.cuts}
              keepTimeline={project.keepTimeline}
              brollOverlays={project.brollOverlays || []}
              assets={project.assets || []}
              words={project.transcript?.words || []}
              currentTime={currentTime}
              originalVideoUrl={apiUrl(`/media/projects/${project.id}/original.mp4?v=${videoCacheBuster}`)}
              onUpdateCuts={updateCuts}
              onUpdateBrollOverlays={updateBrollOverlays}
              onProjectUpdated={onProjectUpdated}
              onSeek={handleTimelineSeek}
              onPlaySegment={(seg) => setPlaybackSegment(seg)}
              onReRender={() => reRender()}
            />
          </div>
        </>
      )}

      {/* Captions Template Picker Modal */}
      {showTemplatePickerModal && (
        <CaptionTemplatePicker
          isModal={true}
          selectedPreset={project.renderPreferences?.captionsStyle || "hormozi"}
          onSelect={(preset) => {
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
          onClose={() => setShowTemplatePickerModal(false)}
        />
      )}

      {/* Live Logs Terminal Modal */}
      <LiveLogsTerminal
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
        logs={project.logs || []}
        projectName={project.originalFileName}
      />
    </>
  );
};
