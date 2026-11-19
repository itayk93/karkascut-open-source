import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "karkascut_api_base";

/** Base URL of the processing backend. Empty = same-origin (web dev proxy / prod). */
export function getApiBase(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved.replace(/\/+$/, "");
  } catch {
    /* localStorage unavailable */
  }
  return "";
}

export function setApiBase(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(STORAGE_KEY, clean);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/** Prefix a relative /api or /media path with the configured backend base. */
export function apiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when running inside the Capacitor native shell (iOS / Android). */
export const isNativeApp = Capacitor.isNativePlatform();
