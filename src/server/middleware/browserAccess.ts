import type { Request, RequestHandler } from "express";
import cors from "cors";

const defaultOrigins = [
  "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173",
  "capacitor://localhost", "http://localhost", "https://localhost"
];

/** Exact origins only. Wildcards, credentials, opaque origins and URL paths are not grants. */
export function parseAllowedOrigins(value = ""): Set<string> {
  const origins = new Set(defaultOrigins);
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const url = new URL(entry);
    if (!["http:", "https:", "capacitor:"].includes(url.protocol) ||
        url.username || url.password || url.search || url.hash ||
        (url.pathname !== "" && url.pathname !== "/") || url.hostname.includes("*") ||
        (url.protocol === "capacitor:" && entry !== "capacitor://localhost")) {
      throw new Error("Invalid KARKASCUT_ALLOWED_ORIGINS entry");
    }
    origins.add(url.protocol === "capacitor:" ? entry : url.origin);
  }
  return origins;
}

function isLocalHost(hostname: string): boolean {
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}

export function isAllowedOrigin(origin: string, req: Pick<Request, "protocol" | "get">,
  allowed: Set<string>): boolean {
  if (allowed.has(origin)) return true;
  try {
    const url = new URL(origin);
    // Production UI served by this local/LAN backend remains same-origin. Do not
    // trust arbitrary Host names, which would admit DNS-rebinding hostnames.
    return ["http:", "https:"].includes(url.protocol) && origin === url.origin &&
      isLocalHost(url.hostname) && url.origin === `${req.protocol}://${req.get("host")}`;
  } catch { return false; }
}

/** Browser-origin boundary for a trusted-LAN app, not user authentication. */
export function browserAccessControl(configuredOrigins = ""): RequestHandler {
  const allowed = parseAllowedOrigins(configuredOrigins);
  const corsMiddleware = cors({ origin: true });
  return (req, res, next) => {
    const origin = req.get("origin");
    let trustedHost = false;
    try {
      const host = req.get("host") || "";
      const url = new URL(`http://${host}`);
      trustedHost = url.host === host.toLowerCase() && (isLocalHost(url.hostname) ||
        [...allowed].some((entry) => new URL(entry).hostname === url.hostname));
    } catch { /* Invalid Host is not a trusted local backend. */ }
    if (!trustedHost || (origin && !isAllowedOrigin(origin, req, allowed)) ||
        (!origin && req.get("sec-fetch-site") === "cross-site")) {
      res.vary("Origin");
      res.status(403).json({ error: "This browser origin is not allowed to access the local editor." });
      return;
    }
    corsMiddleware(req, res, next);
  };
                          }
