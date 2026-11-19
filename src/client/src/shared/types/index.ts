export type CutCategory =
  "silence" | "filler" | "false_start" | "retake" | "repetition" | "correction" | "dead_content" | "manual";

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptData {
  text: string;
  words: Word[];
}

export interface CutSegment {
  id: string;
  start: number;
  end: number;
  type: CutCategory;
  confidence: number;
  reason: string;
  status: "cut" | "restored";
  text?: string;
  wordCount?: number;
  locked?: boolean;
}

export interface KeepSegment {
  start: number;
  end: number;
}

export interface ProjectStats {
  originalDuration: number;
  cleanedDuration: number;
  totalRemovedSeconds: number;
  breakdown: Record<CutCategory, number>;
}

export type CaptionStylePreset =
  "hormozi" | "beast" | "minimal" | "impact2" | "prism" | "paper" | "prime" | "lens" | "vista";

export interface BackgroundMusicConfig {
  enabled: boolean;
  trackId: string; // 'lofi_chill' | 'upbeat_vibe'
  volume: number; // 0.05 to 1.0, default 0.25
}

export interface RenderPreferences {
  makeVertical: boolean;
  burnCaptions: boolean;
  captionsStyle: CaptionStylePreset;
  studioAudio?: boolean;
  autoZoom?: boolean;
  transitionSfx?: boolean;
  backgroundMusic?: BackgroundMusicConfig;
  faceGlow?: boolean;
}

export interface BrollAsset {
  id: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  type: "image" | "video";
  title?: string;
  duration?: number;
  placementHint?: string;
}

export interface BrollOverlay {
  id: string;
  assetId: string;
  start: number;
  end: number;
  reason: string;
  position?: "center" | "pip" | "fullscreen";
}

export interface Project {
  id: string;
  originalFileName: string;
  originalFilePath: string;
  audioFilePath: string;
  previewVideoPath?: string;
  finalVideoPath?: string;
  duration: number;
  status: "uploaded" | "processing" | "ready" | "exporting" | "exported" | "error";
  processingStep?: string;
  currentStepIndex?: number;
  logs?: string[];
  errorMessage?: string;
  transcript?: TranscriptData;
  cuts: CutSegment[];
  keepTimeline: KeepSegment[];
  assets?: BrollAsset[];
  brollOverlays?: BrollOverlay[];
  stats?: ProjectStats;
  renderPreferences?: RenderPreferences;
  eyeContactApplied?: boolean;
  rawOriginalFilePath?: string;
  hasEyeContactOriginal?: boolean;
  isVertical?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  originalScript?: string;
  createdAt: string;
  updatedAt: string;
}
