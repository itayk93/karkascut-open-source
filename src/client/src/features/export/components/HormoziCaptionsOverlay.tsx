import React, { useMemo } from "react";
import { Word, KeepSegment, CaptionStylePreset } from "../../../shared";

interface HormoziCaptionsOverlayProps {
  words: Word[];
  currentTime: number;
  keepSegments: KeepSegment[];
  enabled: boolean;
  preset?: CaptionStylePreset;
}

export const HormoziCaptionsOverlay: React.FC<HormoziCaptionsOverlayProps> = ({
  words,
  currentTime,
  keepSegments,
  enabled,
  preset = "hormozi"
}) => {
  // Map original word timestamps to the edited video timeline
  const mappedWords = useMemo(() => {
    if (!enabled || !words || words.length === 0) return [];
    const list: Array<{ word: string; start: number; end: number }> = [];
    for (const w of words) {
      let offset = 0;
      for (const seg of keepSegments) {
        if (w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05) {
          const mappedStart = offset + (w.start - seg.start);
          const mappedEnd = offset + (w.end - seg.start);
          list.push({
            word: w.word,
            start: Math.max(0, mappedStart),
            end: Math.max(0, mappedEnd)
          });
          break;
        }
        offset += seg.end - seg.start;
      }
    }
    return list;
  }, [enabled, words, keepSegments]);

  // Group into short chunks
  const CHUNK_SIZE = preset === "minimal" || preset === "vista" ? 4 : preset === "paper" || preset === "lens" ? 2 : 3;

  const currentChunk = useMemo(() => {
    if (!enabled) return null;
    for (let i = 0; i < mappedWords.length; i += CHUNK_SIZE) {
      const chunk = mappedWords.slice(i, i + CHUNK_SIZE);
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      if (!first || !last) continue;
      const start = first.start;
      const end = last.end;
      if (currentTime >= start - 0.05 && currentTime <= end + 0.15) {
        return chunk;
      }
    }
    return null;
  }, [enabled, mappedWords, currentTime, CHUNK_SIZE]);

  if (!enabled || !words || words.length === 0) return null;

  if (!currentChunk) return null;

  // Preset style attributes
  const getContainerStyle = (): React.CSSProperties => {
    switch (preset) {
      case "impact2":
        return {
          background: "rgba(10, 15, 30, 0.75)",
          borderRadius: "14px",
          padding: "8px 20px",
          border: "2px solid #00f0ff",
          boxShadow: "0 0 20px rgba(0, 240, 255, 0.45)"
        };
      case "prism":
        return {
          background: "rgba(20, 20, 25, 0.55)",
          borderRadius: "8px",
          padding: "6px 18px",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.2)"
        };
      case "paper":
        return {
          background: "#fef08a", // Pale paper yellow
          borderRadius: "3px",
          padding: "6px 14px",
          transform: "rotate(-1.5deg)",
          boxShadow: "3px 4px 0px rgba(0, 0, 0, 0.9)"
        };
      case "prime":
        return {
          background: "linear-gradient(180deg, rgba(30, 20, 10, 0.85) 0%, rgba(10, 5, 0, 0.9) 100%)",
          borderRadius: "12px",
          padding: "8px 18px",
          border: "1px solid rgba(249, 115, 22, 0.5)",
          boxShadow: "0 4px 15px rgba(249, 115, 22, 0.35)"
        };
      case "lens":
        return {
          background: "rgba(0, 0, 0, 0.8)",
          borderRadius: "4px",
          padding: "5px 14px",
          borderLeft: "3px solid #ea580c",
          borderRight: "3px solid #ea580c"
        };
      case "vista":
        return {
          background: "rgba(15, 23, 42, 0.5)",
          borderRadius: "6px",
          padding: "4px 16px",
          backdropFilter: "blur(6px)"
        };
      case "beast":
        return {
          background: "rgba(15, 23, 42, 0.8)",
          borderRadius: "12px",
          padding: "6px 18px",
          border: "2px solid #ef4444"
        };
      case "minimal":
        return {
          background: "rgba(15, 23, 42, 0.65)",
          borderRadius: "8px",
          padding: "4px 12px"
        };
      case "hormozi":
      default:
        return {
          background: "rgba(0, 0, 0, 0.45)",
          borderRadius: "12px",
          padding: "6px 16px"
        };
    }
  };

  const getWordStyle = (isActive: boolean): React.CSSProperties => {
    switch (preset) {
      case "impact2":
        return {
          fontFamily: "'Impact', 'Arial Black', sans-serif",
          fontSize: "28px",
          fontWeight: 900,
          color: isActive ? "#00f0ff" : "#ffffff",
          transform: isActive ? "scale(1.15)" : "scale(1)",
          transition: "all 0.08s ease",
          textShadow: isActive
            ? "0 0 14px #00f0ff, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000"
            : "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000",
          letterSpacing: "0.5px",
          textTransform: "uppercase"
        };
      case "prism":
        return {
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "24px",
          fontWeight: 700,
          fontStyle: "italic",
          color: isActive ? "#f5d061" : "#ffffff",
          transform: isActive ? "scale(1.08)" : "scale(1)",
          transition: "all 0.1s ease",
          textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 6px rgba(0,0,0,0.8)",
          letterSpacing: "0.2px"
        };
      case "paper":
        return {
          fontFamily: "'Courier New', monospace, sans-serif",
          fontSize: "23px",
          fontWeight: 800,
          color: isActive ? "#b91c1c" : "#111827",
          backgroundColor: isActive ? "#fef9c3" : "transparent",
          padding: isActive ? "2px 6px" : "0",
          borderRadius: "3px",
          transform: isActive ? "scale(1.1) rotate(1deg)" : "scale(1)",
          transition: "all 0.1s ease",
          textShadow: "none",
          border: isActive ? "1px dashed #b91c1c" : "none"
        };
      case "prime":
        return {
          fontFamily: "'Arial Black', sans-serif",
          fontSize: "26px",
          fontWeight: 900,
          color: isActive ? "#f97316" : "#f1f5f9",
          transform: isActive ? "scale(1.14)" : "scale(1)",
          transition: "all 0.08s ease",
          textShadow: isActive
            ? "0 0 16px #f97316, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000"
            : "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000",
          letterSpacing: "-0.5px"
        };
      case "lens":
        return {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "20px",
          fontWeight: 700,
          color: isActive ? "#fb923c" : "#e2e8f0",
          transform: isActive ? "scale(1.08)" : "scale(1)",
          transition: "all 0.08s ease",
          textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
          letterSpacing: "1px"
        };
      case "vista":
        return {
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "22px",
          fontWeight: 600,
          color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
          transform: isActive ? "scale(1.05)" : "scale(1)",
          transition: "all 0.1s ease",
          textShadow: "0 2px 5px rgba(0,0,0,0.85)",
          letterSpacing: "2px"
        };
      case "beast":
        return {
          fontFamily: "'Impact', 'Heebo', sans-serif",
          fontSize: "28px",
          fontWeight: 900,
          color: isActive ? "#4ade80" : "#ffffff",
          transform: isActive ? "scale(1.14)" : "scale(1)",
          transition: "transform 0.1s ease, color 0.1s ease",
          textShadow: `
            -2px -2px 0 #000,
             2px -2px 0 #000,
            -2px  2px 0 #000,
             2px  2px 0 #000,
             0px  3px 8px rgba(0,0,0,0.8)
          `,
          letterSpacing: "-0.5px"
        };
      case "minimal":
        return {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          fontWeight: 600,
          color: isActive ? "#38bdf8" : "#ffffff",
          transform: isActive ? "scale(1.08)" : "scale(1)",
          transition: "transform 0.1s ease, color 0.1s ease",
          textShadow: "0 2px 4px rgba(0,0,0,0.8)",
          letterSpacing: "0px"
        };
      case "hormozi":
      default:
        return {
          fontFamily: "'Heebo', 'Impact', sans-serif",
          fontSize: "26px",
          fontWeight: 900,
          color: isActive ? "#facc15" : "#ffffff",
          transform: isActive ? "scale(1.12)" : "scale(1)",
          transition: "transform 0.1s ease, color 0.1s ease",
          textShadow: `
            -2px -2px 0 #000,
             2px -2px 0 #000,
            -2px  2px 0 #000,
             2px  2px 0 #000,
             0px  3px 8px rgba(0,0,0,0.8)
          `,
          letterSpacing: "-0.5px"
        };
    }
  };

  const bottomPosition = preset === "minimal" || preset === "lens" ? "14%" : preset === "vista" ? "16%" : "18%";

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomPosition,
        left: "5%",
        right: "5%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 20,
        textAlign: "center",
        direction: "rtl"
      }}
    >
      <div
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: preset === "paper" ? "4px" : "8px",
          backdropFilter: preset === "paper" ? "none" : "blur(4px)",
          ...getContainerStyle()
        }}
      >
        {currentChunk.map((w, idx) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          return (
            <span key={idx} style={getWordStyle(isActive)}>
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
