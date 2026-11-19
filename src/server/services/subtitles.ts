import fs from "fs";
import { Word, KeepSegment, CaptionStylePreset } from "../types.js";

/**
 * Generates an ASS subtitle file styled with selectable presets:
 * - hormozi: Thick bold font, black outline & shadow, active word in bright yellow/gold
 * - beast: MrBeast style bold font, active word in lime green (&H0000FF00&), thick red outline
 * - minimal: Apple / TED style clean sans-serif font, translucent shadow, pure white text
 */
export function generateHormoziAssSubtitles(
  words: Word[],
  keepSegments: KeepSegment[] | undefined,
  outputPath: string,
  videoWidth = 1080,
  videoHeight = 1920,
  preset: CaptionStylePreset = "hormozi"
): void {
  // Map words: if keepSegments provided, map uncut timestamps to keep timeline;
  // otherwise, words are already from the post-cut audio.
  const mappedWords: Array<{ word: string; start: number; end: number }> = [];

  if (keepSegments && keepSegments.length > 0) {
    for (const w of words) {
      let newTimeOffset = 0;

      for (const seg of keepSegments) {
        if (w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05) {
          const mappedStart = newTimeOffset + (w.start - seg.start);
          const mappedEnd = newTimeOffset + (w.end - seg.start);
          mappedWords.push({
            word: w.word,
            start: Math.max(0, Math.round(mappedStart * 100) / 100),
            end: Math.max(0, Math.round(mappedEnd * 100) / 100)
          });
          break;
        }
        newTimeOffset += seg.end - seg.start;
      }
    }
  } else {
    for (const w of words) {
      mappedWords.push({
        word: w.word,
        start: Math.max(0, Math.round(w.start * 100) / 100),
        end: Math.max(0, Math.round(w.end * 100) / 100)
      });
    }
  }

  // Format seconds to ASS timestamp: H:MM:SS.cs
  function toAssTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  }

  // Group into short chunks
  const CHUNK_SIZE = preset === "minimal" || preset === "vista" ? 4 : preset === "paper" || preset === "lens" ? 2 : 3;
  const chunks: Array<Array<{ word: string; start: number; end: number }>> = [];

  for (let i = 0; i < mappedWords.length; i += CHUNK_SIZE) {
    chunks.push(mappedWords.slice(i, i + CHUNK_SIZE));
  }

  const dialogueLines: string[] = [];

  // Determine active highlight colors per preset (ASS uses &HBBGGRR& in hex)
  let activeColor = "\\c&H002BFFF0&"; // Hormozi Bright Yellow default
  let styleName = "Hormozi";

  switch (preset) {
    case "beast":
      activeColor = "\\c&H0000FF00&"; // Neon Lime (BGR: 00, FF, 00)
      styleName = "Beast";
      break;
    case "minimal":
      activeColor = "\\c&H00F8BD38&"; // Sky Blue (BGR: F8, BD, 38)
      styleName = "Minimal";
      break;
    case "impact2":
      activeColor = "\\c&H00FFF000&"; // Vivid Cyan / Aqua (BGR: FF, F0, 00)
      styleName = "Impact2";
      break;
    case "prism":
      activeColor = "\\c&H0061D0F5&"; // Warm Champagne Gold (BGR: 61, D0, F5)
      styleName = "Prism";
      break;
    case "paper":
      activeColor = "\\c&H00000000&"; // Deep Black on Yellow Paper Tag
      styleName = "Paper";
      break;
    case "prime":
      activeColor = "\\c&H001673F9&"; // Radiant Neon Orange (BGR: 16, 73, F9)
      styleName = "Prime";
      break;
    case "lens":
      activeColor = "\\c&H000C58EA&"; // Amber / Studio Orange (BGR: 0C, 58, EA)
      styleName = "Lens";
      break;
    case "vista":
      activeColor = "\\c&H00E2E8F0&"; // Clean Silver White (BGR: E2, E8, F0)
      styleName = "Vista";
      break;
    case "hormozi":
    default:
      activeColor = "\\c&H002BFFF0&"; // Hormozi Bright Yellow
      styleName = "Hormozi";
      break;
  }

  for (const chunk of chunks) {
    if (chunk.length === 0) continue;

    for (let currentWordIdx = 0; currentWordIdx < chunk.length; currentWordIdx++) {
      const activeWord = chunk[currentWordIdx];
      if (!activeWord) continue;
      const startStr = toAssTime(activeWord.start);
      const endStr = toAssTime(activeWord.end);

      const textParts = chunk.map((w, idx) => {
        if (idx === currentWordIdx) {
          if (preset === "impact2") {
            // Impact II has a subtle zoom/enlarge animation on active word
            return `{\\fscx112\\fscy112${activeColor}\\b1}${w.word}{\\fscx100\\fscy100\\c&H00FFFFFF&\\b1}`;
          }
          if (preset === "paper") {
            // Paper: Yellow cutout highlight box effect via ASS background
            return `{\\c&H00000000&\\4c&H008AF0FE&\\b1}${w.word}{\\c&H00FFFFFF&\\4c&H80000000&\\b1}`;
          }
          return `{${activeColor}\\b1}${w.word}{\\c&H00FFFFFF&\\b1}`;
        }
        return `{\\c&H00FFFFFF&\\b1}${w.word}`;
      });

      // Keep logical word order. libass applies the Unicode bidi algorithm;
      // reversing Hebrew words here reverses the sentence a second time.
      // Embed Hebrew-led lines RTL so Latin names/numbers keep their positions.
      const firstStrongWord = chunk.find((w) => /[\p{L}]/u.test(w.word));
      const rtl = !!firstStrongWord && /^[^\p{L}]*[\u0590-\u05FF]/u.test(firstStrongWord.word);
      const dialogueText = `${rtl ? "\u202B" : ""}${textParts.join(" ")}${rtl ? "\u202C" : ""}`;
      dialogueLines.push(`Dialogue: 0,${startStr},${endStr},${styleName},,0,0,0,,${dialogueText}`);
    }
  }

  let styleDefinition = "";
  if (preset === "beast") {
    // Beast: Arial Black, Huge font size, deep red outline & shadow
    styleDefinition = `Style: Beast,Arial,${Math.round(videoHeight * 0.048)},&H00FFFFFF,&H000000FF,&H000000B2,&H80000000,-1,0,0,0,105,105,0,0,1,6,4,2,30,30,${Math.round(videoHeight * 0.24)},1`;
  } else if (preset === "minimal") {
    // Minimal: Clean, softer outline, elegant positioning
    styleDefinition = `Style: Minimal,Arial,${Math.round(videoHeight * 0.038)},&H00FFFFFF,&H000000FF,&H00000000,&H60000000,0,0,0,0,100,100,0,0,1,3,2,2,40,40,${Math.round(videoHeight * 0.18)},1`;
  } else if (preset === "impact2") {
    // Impact II: Heavy bold font, dark cyan shadow, high-energy stroke
    styleDefinition = `Style: Impact2,Impact,${Math.round(videoHeight * 0.052)},&H00FFFFFF,&H000000FF,&H00000000,&H90442200,-1,0,0,0,100,100,0,0,1,6,5,2,30,30,${Math.round(videoHeight * 0.22)},1`;
  } else if (preset === "prism") {
    // Prism Pro: Elegant luxury font, crisp outline, elevated positioning
    styleDefinition = `Style: Prism,Georgia,${Math.round(videoHeight * 0.044)},&H00FFFFFF,&H000000FF,&H00201005,&H70000000,-1,0,0,0,100,100,1,0,1,4,3,2,40,40,${Math.round(videoHeight * 0.23)},1`;
  } else if (preset === "paper") {
    // Paper II: Collage craft style, bold typeface, box outline
    styleDefinition = `Style: Paper,Courier New,${Math.round(videoHeight * 0.042)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,4,2,40,40,${Math.round(videoHeight * 0.2)},1`;
  } else if (preset === "prime") {
    // Prime: Futuristic cinematic bold, deep dark aura & amber glow
    styleDefinition = `Style: Prime,Arial Black,${Math.round(videoHeight * 0.047)},&H00FFFFFF,&H000000FF,&H00000000,&HA0052060,-1,0,0,0,102,102,0,0,1,6,5,2,35,35,${Math.round(videoHeight * 0.22)},1`;
  } else if (preset === "lens") {
    // Lens: Technical creator / documentary style, clean spacing
    styleDefinition = `Style: Lens,Trebuchet MS,${Math.round(videoHeight * 0.04)},&H00FFFFFF,&H000000FF,&H00000000,&H80101010,0,0,0,0,100,100,2,0,1,4,3,2,40,40,${Math.round(videoHeight * 0.19)},1`;
  } else if (preset === "vista") {
    // Vista: Wide tracked architectural clean luxury font
    styleDefinition = `Style: Vista,Helvetica,${Math.round(videoHeight * 0.041)},&H00FFFFFF,&H000000FF,&H00000000,&H50000000,0,0,0,0,100,100,3,0,1,3,2,2,40,40,${Math.round(videoHeight * 0.21)},1`;
  } else {
    // Hormozi: Bold, heavy black border, yellow glow
    styleDefinition = `Style: Hormozi,Arial,${Math.round(videoHeight * 0.045)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,3,2,40,40,${Math.round(videoHeight * 0.22)},1`;
  }

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleDefinition}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines.join("\n")}
`;

  fs.writeFileSync(outputPath, assContent, "utf-8");
}
