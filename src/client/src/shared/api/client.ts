import { Project, CutSegment, Word, BrollOverlay, RenderPreferences } from "../types";
import { apiUrl } from "../config";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  options.headers = headers;

  let res: Response;
  try {
    res = await fetch(apiUrl(url), options);
  } catch {
    throw new ApiClientError("לא ניתן להתחבר לשרת העיבוד. ודא שכתובת השרת בהגדרות נכונה ושהשרת רץ.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new ApiClientError(`שרת החזיר שגיאה (${res.status}). ודא שפורט 3050 מופעל ותקין.`, res.status);
    }
    return {} as T;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiClientError(data.error || `שגיאת שרת: ${res.status}`, res.status, data.details);
  }
  return data as T;
}

export interface HealthResponse {
  status: string;
  hasOpenAIKey: boolean;
  maskedKey: string | null;
  hasNvidiaKey: boolean;
  maskedNvidiaKey: string | null;
}

export interface KeyResponse {
  success: boolean;
  maskedKey: string;
}

export const api = {
  getHealth: () => request<HealthResponse>("/api/health"),

  validateOpenAiKey: () => request<{ valid: boolean; error?: string }>("/api/settings/validate-openai"),

  saveOpenAiKey: (apiKey: string) =>
    request<KeyResponse>("/api/settings/key", {
      method: "POST",
      body: JSON.stringify({ apiKey })
    }),

  saveNvidiaKey: (apiKey: string) =>
    request<KeyResponse>("/api/settings/nvidia-key", {
      method: "POST",
      body: JSON.stringify({ apiKey })
    }),

  listProjects: () => request<Project[]>("/api/projects"),

  getProject: (id: string) => request<Project>(`/api/projects/${id}`),

  deleteProject: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/projects/${id}`, {
      method: "DELETE"
    }),

  deleteProjects: (ids: string[]) =>
    request<{ success: boolean; deletedCount: number; message: string }>("/api/projects/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids })
    }),

  uploadVideo: (file: File) => {
    const formData = new FormData();
    formData.append("video", file);
    return request<Project>("/api/upload", {
      method: "POST",
      body: formData
    });
  },

  startProcessing: (
    id: string,
    options: { apiKey?: string; originalScript?: string; renderPreferences?: RenderPreferences }
  ) =>
    request<Project>(`/api/projects/${id}/process`, {
      method: "POST",
      body: JSON.stringify(options)
    }),

  reRender: (id: string, options?: { renderPreferences?: RenderPreferences }) =>
    request<Project>(`/api/projects/${id}/render`, {
      method: "POST",
      body: JSON.stringify(options || {})
    }),

  cancelJob: (id: string) =>
    request<{ success: boolean; project: Project }>(`/api/projects/${id}/cancel`, {
      method: "POST"
    }),

  updateCuts: (id: string, cuts: CutSegment[]) =>
    request<Project>(`/api/projects/${id}/cuts`, {
      method: "PUT",
      body: JSON.stringify({ cuts })
    }),

  toggleCut: (id: string, cutId: string) =>
    request<Project>(`/api/projects/${id}/cuts/${cutId}/toggle`, {
      method: "POST"
    }),

  updateTranscript: (id: string, words: Word[]) =>
    request<Project>(`/api/projects/${id}/transcript`, {
      method: "PUT",
      body: JSON.stringify({ words })
    }),

  uploadBrollAsset: (id: string, file: File, title?: string) => {
    const formData = new FormData();
    formData.append("asset", file);
    if (title) formData.append("title", title);
    return request<Project>(`/api/projects/${id}/assets`, {
      method: "POST",
      body: formData
    });
  },

  updateBrollAsset: (id: string, assetId: string, patch: { placementHint?: string; title?: string }) =>
    request<Project>(`/api/projects/${id}/assets/${assetId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),

  deleteBrollAsset: (id: string, assetId: string) =>
    request<Project>(`/api/projects/${id}/assets/${assetId}`, {
      method: "DELETE"
    }),

  autoMatchBroll: (id: string) =>
    request<Project>(`/api/projects/${id}/broll/auto-match`, {
      method: "POST"
    }),

  updateBrollOverlays: (id: string, overlays: BrollOverlay[]) =>
    request<Project>(`/api/projects/${id}/broll`, {
      method: "PUT",
      body: JSON.stringify({ overlays })
    }),

  runEyeContact: (id: string) =>
    request<Project>(`/api/projects/${id}/eye-contact`, {
      method: "POST"
    }),

  rotateVideo: (id: string, degrees: 90 | 180 | 270) =>
    request<Project>(`/api/projects/${id}/rotate`, {
      method: "POST",
      body: JSON.stringify({ degrees })
    }),

  exportFinalVideo: (id: string, options?: { renderPreferences?: RenderPreferences }) =>
    request<Project>(`/api/projects/${id}/export`, {
      method: "POST",
      body: JSON.stringify(options || {})
    }),

  importJsonPlan: (id: string, plan: unknown) =>
    request<Project>(`/api/projects/${id}/import-json`, {
      method: "POST",
      body: JSON.stringify(plan)
    }),

  getMusicTracks: () => request<{ id: string; title: string; url: string }[]>("/api/music-tracks"),

  reanalyzeSegment: (id: string, start: number, end: number) =>
    request<{ subCuts: SegmentSubCut[]; usedAI: boolean; aiUnavailableReason?: "missing_key" | "no_transcript" | "request_failed" }>(
      `/api/projects/${id}/cuts/reanalyze-segment`,
      {
        method: "POST",
        body: JSON.stringify({ start, end })
      }
    ),

  refineCuts: (id: string) =>
    request<{ project: Project; refinedCount: number; restoredSeconds: number }>(
      `/api/projects/${id}/refine-cuts`,
      { method: "POST", body: JSON.stringify({}) }
    )
};

export interface SegmentSubCut {
  start: number;
  end: number;
  type: "filler" | "false_start" | "retake" | "repetition" | "correction" | "dead_content";
  confidence: number;
  reason: string;
  text: string;
}
