import { Router } from "express";
import { saveApiKey } from "../config/apiKeyStore.js";
import { validateBody } from "../middleware/validate.js";
import { saveKeySchema } from "../schemas/api.schemas.js";

import { env, setOpenAiKey, setNvidiaKey } from "../config/env.js";
import { validateOpenAiKey } from "../services/openaiHealth.js";

const router = Router();

router.get("/api/settings/validate-openai", async (req, res) => {
  const customKey = ((req.headers["x-openai-key"] as string) || "").trim();
  const result = await validateOpenAiKey(customKey || undefined);
  res.json(result);
});

function cleanKeyValid(key: string | undefined): boolean {
  return typeof key === "string" && key.trim().length > 10;
}

router.get("/api/health", (_req, res) => {
  const currentKey = env.OPENAI_API_KEY;
  const nvidiaKey = env.NVIDIA_API_KEY;
  res.json({
    status: "ok",
    hasOpenAIKey: cleanKeyValid(currentKey),
    maskedKey: cleanKeyValid(currentKey) ? `${currentKey.slice(0, 7)}...${currentKey.slice(-4)}` : null,
    hasNvidiaKey: cleanKeyValid(nvidiaKey),
    maskedNvidiaKey: cleanKeyValid(nvidiaKey) ? `${nvidiaKey.slice(0, 10)}...${nvidiaKey.slice(-4)}` : null
  });
});

router.post("/api/settings/key", validateBody(saveKeySchema), (req, res) => {
  const cleanKey = req.body.apiKey.trim();
  try {
    saveApiKey("OPENAI_API_KEY", cleanKey);
  } catch {
    return res.status(500).json({ error: "המפתח לא נשמר. בדוק הרשאת כתיבה לתיקיית השרת ונסה שוב." });
  }
  setOpenAiKey(cleanKey);
  res.json({ success: true, maskedKey: `${cleanKey.slice(0, 7)}...${cleanKey.slice(-4)}` });
});

router.post("/api/settings/nvidia-key", validateBody(saveKeySchema), (req, res) => {
  const cleanKey = req.body.apiKey.trim();
  try {
    saveApiKey("NVIDIA_API_KEY", cleanKey);
  } catch {
    return res.status(500).json({ error: "המפתח לא נשמר. בדוק הרשאת כתיבה לתיקיית השרת ונסה שוב." });
  }
  setNvidiaKey(cleanKey);
  res.json({ success: true, maskedKey: `${cleanKey.slice(0, 10)}...${cleanKey.slice(-4)}` });
});

router.get("/api/music-tracks", (_req, res) => {
  res.json([
    { id: "lofi_chill", title: "☕ Lo-Fi Chill Beats (רגוע ולייפסטייל)", url: "/media/audio/lofi_chill.mp3" },
    { id: "upbeat_vibe", title: "⚡ Upbeat Vibe (אנרגטי וקצבי)", url: "/media/audio/upbeat_vibe.mp3" }
  ]);
});

export default router;
