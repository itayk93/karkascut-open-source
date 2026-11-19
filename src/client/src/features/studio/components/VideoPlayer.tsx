import React, { useRef, useState, useEffect, useMemo } from "react";
import { HormoziCaptionsOverlay } from "../../export";
import { BrollOverlay } from "../../broll";
import { Word, KeepSegment, BrollOverlay as OverlayType, BrollAsset, CaptionStylePreset } from "../../../shared";

interface VideoPlayerProps {
  originalVideoUrl: string;
  previewVideoUrl?: string;
  rawOriginalVideoUrl?: string;
  hasEyeContact?: boolean;
  seekTime?: number | null;
  playbackSegment?: { start: number; end: number; source?: "original" | "preview" } | null;
  onClearPlaybackSegment?: () => void;
  words?: Word[];
  keepSegments?: KeepSegment[];
  brollOverlays?: OverlayType[];
  assets?: BrollAsset[];
  onTimeUpdate?: (currentTime: number, isPreviewMode?: boolean) => void;
  onSourceModeChange?: (isOriginal: boolean) => void;
  isVerticalMode?: boolean;
  onToggleVerticalMode?: () => void;
  captionsPreset?: CaptionStylePreset;
  autoZoomEnabled?: boolean;
  onRotateSource?: (degrees: number) => void;
  isRotating?: boolean;
  isMobile?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  originalVideoUrl,
  previewVideoUrl,
  rawOriginalVideoUrl,
  hasEyeContact = false,
  seekTime,
  playbackSegment,
  onClearPlaybackSegment,
  words = [],
  keepSegments = [],
  brollOverlays = [],
  assets = [],
  onTimeUpdate,
  onSourceModeChange,
  isVerticalMode = true,
  onToggleVerticalMode,
  captionsPreset = "hormozi",
  autoZoomEnabled: _autoZoomEnabled = false,
  onRotateSource: _onRotateSource,
  isRotating: _isRotating = false,
  isMobile = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // User's playback intent. `checkLiveSkip` seeks the element to jump over cut
  // regions; a seek that lands while `play()` is still pending makes the browser
  // reject that promise, so playback silently fails "sometimes". We re-issue
  // play() after the seek settles (onSeeked) whenever the user still wants it.
  const wantsPlayRef = useRef<boolean>(false);
  const resumeIfWanted = () => {
    const v = videoRef.current;
    if (wantsPlayRef.current && v && v.paused) v.play().catch(() => {});
  };
  const [useOriginal, setUseOriginal] = useState<boolean>(true);
  const [showEyeContactBefore, setShowEyeContactBefore] = useState<boolean>(false);
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Compute active video source:
  // If user is previewing a solo segment (especially cut parts), force originalVideoUrl
  let activeSrc = originalVideoUrl;
  if (playbackSegment && playbackSegment.source === "original") {
    activeSrc = originalVideoUrl;
  } else if (showEyeContactBefore && rawOriginalVideoUrl) {
    activeSrc = rawOriginalVideoUrl;
  } else if (!useOriginal && previewVideoUrl) {
    activeSrc = previewVideoUrl;
  } else {
    activeSrc = originalVideoUrl;
  }

  // B-roll overlay times are in edited-video seconds. When the rendered preview
  // plays, currentTime is already edited time. When the original source plays
  // (live edit), map the raw time onto the edited timeline so overlays fire at
  // the same moment they will in the export.
  const brollClock = useMemo(() => {
    if (activeSrc === previewVideoUrl) return currentTime;
    let acc = 0;
    for (const k of keepSegments) {
      if (currentTime < k.start) return acc;
      if (currentTime <= k.end) return acc + (currentTime - k.start);
      acc += k.end - k.start;
    }
    return acc;
  }, [activeSrc, previewVideoUrl, currentTime, keepSegments]);



  useEffect(() => {
    if (seekTime !== null && seekTime !== undefined && videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - seekTime) > 0.08) {
        videoRef.current.currentTime = seekTime;
      }
    }
  }, [seekTime]);

  // Solo Preview: seek to segment start and play
  useEffect(() => {
    if (playbackSegment && videoRef.current) {
      wantsPlayRef.current = true;
      videoRef.current.currentTime = playbackSegment.start;
      videoRef.current.play().catch(() => {});
    }
  }, [playbackSegment]);

  // Spacebar play / pause toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault(); // prevent page scroll down
        if (videoRef.current) {
          if (videoRef.current.paused) {
            wantsPlayRef.current = true;
            videoRef.current.play().catch(() => {});
          } else {
            wantsPlayRef.current = false;
            videoRef.current.pause();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const keepSegmentsRef = useRef<KeepSegment[]>(keepSegments);
  keepSegmentsRef.current = keepSegments;

  const onSourceModeChangeRef = useRef(onSourceModeChange);
  onSourceModeChangeRef.current = onSourceModeChange;

  useEffect(() => {
    onSourceModeChangeRef.current?.(useOriginal || playbackSegment?.source === "original");
  }, [useOriginal, playbackSegment]);

  const _handleRotate = () => {
    setRotationDeg((prev) => (prev + 90) % 360);
  };

  // Helper to check and perform live skip over cut segments
  const checkLiveSkip = (t: number) => {
    // Only apply live cut skipping when:
    // 1. Not in a solo playback preview
    // 2. We have keep segments
    // 3. We are playing originalVideoUrl (live edit mode, or previewVideoUrl isn't being played)
    if (playbackSegment) return;
    const isLiveEditSource = activeSrc === originalVideoUrl;
    if (!isLiveEditSource) return;

    const segments = keepSegmentsRef.current;
    if (!segments || segments.length === 0) return;

    // Check if current time falls inside any keep segment
    let inKeep = false;
    let nextKeepStart: number | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      if (t >= seg.start && t < seg.end) {
        inKeep = true;
        break;
      }
      if (seg.start > t) {
        if (nextKeepStart === null || seg.start < nextKeepStart) {
          nextKeepStart = seg.start;
        }
      }
    }

    if (!inKeep) {
      if (nextKeepStart !== null && videoRef.current) {
        // Jump directly to the start of the next keep segment. onSeeked re-issues
        // play() so a mid-play skip does not leave the video silently paused.
        videoRef.current.currentTime = nextKeepStart;
        resumeIfWanted();
      } else if (t > (segments[segments.length - 1]?.end || 0) && videoRef.current) {
        // We reached past the last keep segment
        wantsPlayRef.current = false;
        videoRef.current.pause();
      }
    }
  };

  // High-frequency animation frame loop for seamless real-time skipping during playback
  useEffect(() => {
    let animId: number;
    const checkLoop = () => {
      if (videoRef.current && !videoRef.current.paused && isPlaying) {
        checkLiveSkip(videoRef.current.currentTime);
      }
      animId = requestAnimationFrame(checkLoop);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(checkLoop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, activeSrc, playbackSegment]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      checkLiveSkip(t);
      setCurrentTime(t);
      const isPreview = activeSrc === previewVideoUrl;
      onTimeUpdate?.(t, isPreview);

      // Automatically pause at end of solo preview segment
      if (playbackSegment && t >= playbackSegment.end) {
        videoRef.current.pause();
      }
    }
  };

  return (
    <div className="card">
      {playbackSegment && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            padding: "8px 14px",
            marginBottom: "12px",
            fontSize: "13px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#1e40af" }}>
            <strong>צופה רק במקטע נבחר:</strong>
            <bdi className="bdi-num">
              {playbackSegment.start.toFixed(1)}s - {playbackSegment.end.toFixed(1)}s
            </bdi>
            <span>({(playbackSegment.end - playbackSegment.start).toFixed(1)} שניות)</span>
          </div>
          <button
            className="btn btn-secondary"
            onClick={onClearPlaybackSegment}
            style={{ fontSize: "12px", padding: "3px 10px", borderColor: "#93c5fd" }}
          >
            חזור לנגן מלא
          </button>
        </div>
      )}

      {!isMobile && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
            flexWrap: "wrap",
            gap: "8px"
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: 0 }}>נגן תצוגה מקדימה</h3>

          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {onToggleVerticalMode && (
              <button
                className={isVerticalMode ? "btn btn-primary" : "btn btn-secondary"}
                style={{ padding: "4px 10px", fontSize: "12px" }}
                onClick={onToggleVerticalMode}
                title="החלף בין תצוגת מסך לאורך 9:16 לרוחב"
              >
                {isVerticalMode ? "9:16" : "16:9"}
              </button>
            )}

            <button
              className={captionsEnabled ? "btn btn-primary" : "btn btn-secondary"}
              style={{ padding: "4px 10px", fontSize: "12px" }}
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
            >
              {captionsEnabled ? "כתוביות: פעיל" : "כתוביות: כבוי"}
            </button>

            {hasEyeContact && rawOriginalVideoUrl && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                  padding: "2px",
                  border: "1px solid #cbd5e1"
                }}
                title="השוואת מיקוד מבט: לפני ואחרי תיקון"
              >
                <button
                  type="button"
                  className={!showEyeContactBefore ? "btn btn-primary" : "btn btn-secondary"}
                  style={{
                    fontSize: "12px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: !showEyeContactBefore ? "#059669" : "transparent",
                    borderColor: !showEyeContactBefore ? "#059669" : "transparent",
                    color: !showEyeContactBefore ? "#ffffff" : "#475569"
                  }}
                  onClick={() => {
                    const currTime = videoRef.current?.currentTime || 0;
                    const wasPlaying = videoRef.current ? !videoRef.current.paused : false;
                    setShowEyeContactBefore(false);
                    setTimeout(() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = currTime;
                        if (wasPlaying) videoRef.current.play().catch(() => {});
                      }
                    }, 50);
                  }}
                >
                  אחרי תיקון מבט
                </button>
                <button
                  type="button"
                  className={showEyeContactBefore ? "btn btn-primary" : "btn btn-secondary"}
                  style={{
                    fontSize: "12px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: showEyeContactBefore ? "#475569" : "transparent",
                    borderColor: showEyeContactBefore ? "#475569" : "transparent",
                    color: showEyeContactBefore ? "#ffffff" : "#475569"
                  }}
                  onClick={() => {
                    const currTime = videoRef.current?.currentTime || 0;
                    const wasPlaying = videoRef.current ? !videoRef.current.paused : false;
                    setShowEyeContactBefore(true);
                    setTimeout(() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = currTime;
                        if (wasPlaying) videoRef.current.play().catch(() => {});
                      }
                    }, 50);
                  }}
                >
                  לפני תיקון (מקור)
                </button>
              </div>
            )}

            {previewVideoUrl && (
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className={!useOriginal && !showEyeContactBefore ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ padding: "5px 12px", fontSize: "13px" }}
                  onClick={() => {
                    setShowEyeContactBefore(false);
                    setUseOriginal(false);
                  }}
                >
                  וידאו ערוך
                </button>
                <button
                  className={useOriginal && !showEyeContactBefore ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ padding: "5px 12px", fontSize: "13px" }}
                  onClick={() => {
                    setShowEyeContactBefore(false);
                    setUseOriginal(true);
                  }}
                >
                  וידאו מקור
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Display Container */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          background: "#090d16",
          borderRadius: "12px",
          padding: isVerticalMode ? "16px" : "8px",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "relative",
            width: isVerticalMode ? "min(340px, 100%)" : "100%",
            height: isVerticalMode ? "min(600px, 75vh)" : "480px",
            maxWidth: "100%",
            background: "#000",
            borderRadius: isVerticalMode ? "16px" : "8px",
            overflow: "hidden",
            boxShadow: isVerticalMode ? "0 10px 25px rgba(0,0,0,0.5)" : "none",
            border: isVerticalMode ? "3px solid #334155" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <video crossOrigin="anonymous"
            ref={videoRef}
            src={activeSrc}
            preload="auto"
            playsInline
            controls
            onTimeUpdate={handleTimeUpdate}
            onSeeked={resumeIfWanted}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: isVerticalMode ? "cover" : "contain",
              transform: rotationDeg !== 0 ? `rotate(${rotationDeg}deg)` : undefined,
              transition: "transform 0.2s ease-in-out"
            }}
          />

          {/* Real-time B-Roll Overlay (Media Layer) */}
          <BrollOverlay overlays={brollOverlays} assets={assets} currentTime={brollClock} />

          {/* Real-time Hormozi Captions Overlay with Presets (Only if not playing rendered preview which already has burned captions) */}
          <HormoziCaptionsOverlay
            words={words}
            currentTime={currentTime}
            keepSegments={useOriginal ? [{ start: 0, end: 999999 }] : keepSegments}
            enabled={captionsEnabled && activeSrc !== previewVideoUrl}
            preset={captionsPreset}
          />
        </div>
      </div>

      {/* Mobile Editing Transport Bar (Identical to Mobile App) */}
      {isMobile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: "340px",
            margin: "10px auto 0",
            padding: "0 4px"
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#64748b",
              fontFamily: "monospace",
              direction: "ltr",
              unicodeBidi: "isolate"
            }}
          >
            {formatTime(currentTime)} / {formatTime(videoRef.current?.duration || 0)}
          </div>

          <button
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              cursor: "pointer"
            }}
            onClick={() => {
              if (videoRef.current) {
                if (videoRef.current.paused) {
                  wantsPlayRef.current = true;
                  videoRef.current.play().catch(() => {});
                } else {
                  wantsPlayRef.current = false;
                  videoRef.current.pause();
                }
              }
            }}
            title={isPlaying ? "השהה" : "נגן"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {previewVideoUrl && (
              <div
                style={{
                  display: "flex",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "2px",
                  gap: "2px"
                }}
              >
                <button
                  style={{
                    background: !useOriginal ? "#ffffff" : "transparent",
                    color: !useOriginal ? "#0f172a" : "#64748b",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: !useOriginal ? 700 : 600,
                    padding: "3px 8px",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    setShowEyeContactBefore(false);
                    setUseOriginal(false);
                  }}
                >
                  ערוך
                </button>
                <button
                  style={{
                    background: useOriginal ? "#ffffff" : "transparent",
                    color: useOriginal ? "#0f172a" : "#64748b",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: useOriginal ? 700 : 600,
                    padding: "3px 8px",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    setShowEyeContactBefore(false);
                    setUseOriginal(true);
                  }}
                >
                  מקור
                </button>
              </div>
            )}

            <button
              style={{
                background: captionsEnabled ? "#0f172a" : "#ffffff",
                color: captionsEnabled ? "#ffffff" : "#64748b",
                border: captionsEnabled ? "1px solid #0f172a" : "1px solid #cbd5e1",
                borderRadius: "6px",
                fontSize: "10px",
                fontWeight: 800,
                padding: "4px 7px",
                cursor: "pointer"
              }}
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
              title="כתוביות"
            >
              CC
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
