import OpenAI from "openai";
import { BrollAsset, BrollOverlay, KeepSegment, Word } from "../types.js";
import { env } from "../config/env.js";

export async function autoMatchBrollWithAI(
  words: Word[],
  keepSegments: KeepSegment[],
  assets: BrollAsset[],
  customApiKey?: string
): Promise<BrollOverlay[]> {
  const apiKey = (customApiKey || env.OPENAI_API_KEY).trim();
  if (!apiKey) {
    throw new Error("מפתח OpenAI API חסר. נא להזין מפתח בממשק או ב-.env.");
  }

  if (assets.length === 0 || words.length === 0) {
    return [];
  }

  const openai = new OpenAI({ apiKey });
  const model = env.OPENAI_EDITOR_MODEL;

  // Calculate edited timeline segments and build timestamped transcript
  const mappedWords: Array<{ word: string; start: number; end: number }> = [];
  for (const w of words) {
    let offset = 0;
    for (const seg of keepSegments) {
      if (w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05) {
        mappedWords.push({
          word: w.word,
          start: Math.max(0, offset + (w.start - seg.start)),
          end: Math.max(0, offset + (w.end - seg.start))
        });
        break;
      }
      offset += seg.end - seg.start;
    }
  }

  const totalEditedDuration = keepSegments.reduce((sum, s) => sum + (s.end - s.start), 0);

  // Format transcript into sentences/chunks for context
  const hasHints = assets.some((a) => a.placementHint && a.placementHint.trim());
  // When the user asked for a specific spot ("after the sentence ...") we need
  // every word timestamped so the model can locate that sentence precisely.
  const transcriptSnippet = mappedWords
    .filter((_, idx) => (hasHints ? true : idx % 2 === 0))
    .slice(0, hasHints ? 1200 : 300)
    .map((w) => `[${w.start.toFixed(1)}s-${w.end.toFixed(1)}s] ${w.word}`)
    .join(" ");

  const assetList = assets
    .map(
      (a) =>
        `- ID: "${a.id}", Name: "${a.fileName}", Type: ${a.type}${a.title ? `, Description: ${a.title}` : ""}` +
        `${a.placementHint && a.placementHint.trim() ? `, USER PLACEMENT REQUEST (obey this): "${a.placementHint.trim()}"` : ""}`
    )
    .join("\n");

  const systemPrompt = `You are an elite video editor and director for social media viral videos (Reels, TikTok, YouTube Shorts).
Your task is to analyze the speech transcript and choose the best placement for B-Roll assets (images or short video clips).

B-Roll Rules:
1. Insert B-Roll overlays at the most impactful moments: when the speaker introduces a key idea, gives an example, changes energy, or emphasizes a point.
2. An overlay should last between 2.0 and 4.5 seconds.
3. Overlays MUST NOT overlap each other.
4. Only use asset IDs from the provided list.
5. Provide timestamps in the edited video timeline (0.0 to ${totalEditedDuration.toFixed(1)}s).
6. Give a brief reason in Hebrew for each placement.

USER PLACEMENT REQUESTS:
- Some assets carry a "USER PLACEMENT REQUEST" written in plain Hebrew. Treat it as a firm instruction, not a suggestion.
- "בהתחלה" / "start" → place within the first 0-2.5s.
- "בסוף" / "end" → place so it ends at ${totalEditedDuration.toFixed(1)}s (a 2-4s window at the very end).
- "אחרי המשפט '...'" / "כשמדבר על ..." / "when he says ..." → find that phrase in the transcript and start the overlay right when that phrase ends.
- If the requested phrase cannot be found, place it at the moment whose meaning is closest and say so in the reason.
- Assets without a request: choose the best spot yourself as usual.`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Available B-Roll Assets:\n${assetList}\n\nEdited Video Speech Transcript:\n${transcriptSnippet}\n\nMatch each relevant asset to the best time interval.`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "broll_matching_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            overlays: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  assetId: { type: "string", description: "The exact ID of the B-roll asset" },
                  start: { type: "number", description: "Start time in seconds in the edited video" },
                  end: { type: "number", description: "End time in seconds in the edited video" },
                  reason: { type: "string", description: "Brief explanation in Hebrew why this B-roll fits here" },
                  position: {
                    type: "string",
                    enum: ["center", "pip", "fullscreen"],
                    description: "Display position on screen"
                  }
                },
                required: ["assetId", "start", "end", "reason", "position"],
                additionalProperties: false
              }
            }
          },
          required: ["overlays"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const rawOverlays = parsed.overlays || [];
    const validAssetIds = new Set(assets.map((a) => a.id));

    interface RawBrollOverlayItem {
      assetId: string;
      start: number;
      end: number;
      reason?: string;
      position?: "center" | "pip" | "fullscreen";
    }

    return (rawOverlays as RawBrollOverlayItem[])
      .filter((o) => validAssetIds.has(o.assetId) && o.end > o.start + 0.5)
      .map((o, idx: number) => ({
        id: `broll_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        assetId: o.assetId,
        start: Math.round(o.start * 100) / 100,
        end: Math.round(o.end * 100) / 100,
        reason: o.reason || "",
        position: o.position || "center"
      }));
  } catch (err) {
    console.error("Failed to parse B-roll matching plan:", err);
    return [];
  }
}
