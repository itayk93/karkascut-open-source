import React, { useState } from "react";
import { CaptionStylePreset } from "../../../shared";

export interface CaptionTemplateInfo {
  id: CaptionStylePreset;
  name: string;
  category: "Trending" | "Bold" | "Polished" | "Minimal";
  description: string;
  badge?: string;
  previewText: string;
  previewColor: string;
  bgColor: string;
  fontFamily: string;
  isNew?: boolean;
}

export const CAPTION_TEMPLATES: CaptionTemplateInfo[] = [
  {
    id: "impact2",
    name: "Impact II",
    category: "Trending",
    description: "אותיות עבות, זוהר ניאון תכלת/ציאן, אנרגיה גבוהה",
    badge: "פופולרי",
    previewText: "GRIND MINDSET",
    previewColor: "#00f0ff",
    bgColor: "linear-gradient(135deg, #0a0f1d 0%, #0369a1 100%)",
    fontFamily: "'Impact', 'Arial Black', sans-serif",
    isNew: true
  },
  {
    id: "prism",
    name: "Prism Pro",
    category: "Polished",
    description: 'טיפוגרפיה יוקרתית, זהב שמפניה, סגנון נדל"ן ופיננסים',
    badge: "Pro",
    previewText: "Real Estate",
    previewColor: "#f5d061",
    bgColor: "linear-gradient(135deg, #1c1917 0%, #44403c 100%)",
    fontFamily: "'Playfair Display', Georgia, serif",
    isNew: true
  },
  {
    id: "paper",
    name: "Paper II",
    category: "Bold",
    description: "סגנון קולאז' ונייר גזור, תגית מודגשת עם אותיות שחורות",
    badge: "יצירתי",
    previewText: "Paper Craft",
    previewColor: "#111827",
    bgColor: "linear-gradient(135deg, #fef08a 0%, #ca8a04 100%)",
    fontFamily: "'Courier New', monospace",
    isNew: true
  },
  {
    id: "prime",
    name: "Prime",
    category: "Trending",
    description: "אווירה סינמטית עמוקה עם זוהר כתום ניאון ואותיות כבדות",
    badge: "סינמטי",
    previewText: "know this",
    previewColor: "#f97316",
    bgColor: "linear-gradient(135deg, #1c1917 0%, #7c2d12 100%)",
    fontFamily: "'Arial Black', sans-serif",
    isNew: true
  },
  {
    id: "lens",
    name: "Lens",
    category: "Polished",
    description: "מראה מפרט מצלמה טכני, אותיות מונוספייס, ליוצרי תוכן",
    badge: "דוקו",
    previewText: "Aperture",
    previewColor: "#ea580c",
    bgColor: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    fontFamily: "ui-monospace, Menlo, monospace",
    isNew: true
  },
  {
    id: "vista",
    name: "Vista",
    category: "Minimal",
    description: "רווח אותיות רחב, סנס-סריף נקי, עיצוב מודרני מלוטש",
    badge: "מינימל",
    previewText: "REALTY",
    previewColor: "#ffffff",
    bgColor: "linear-gradient(135deg, #334155 0%, #1e293b 100%)",
    fontFamily: "system-ui, sans-serif",
    isNew: true
  },
  {
    id: "hormozi",
    name: "Alex Hormozi",
    category: "Bold",
    description: "הסגנון הקלאסי: אותיות כבדות, הדגשה צהובה, מסגרת שחורה חדה",
    badge: "קלאסי",
    previewText: "ACTION TAKERS",
    previewColor: "#facc15",
    bgColor: "linear-gradient(135deg, #09090b 0%, #27272a 100%)",
    fontFamily: "'Impact', 'Heebo', sans-serif"
  },
  {
    id: "beast",
    name: "MrBeast Pop",
    category: "Bold",
    description: "ירוק ניאון קופצני, מסגרת אדומה ואנרגיה מקסימלית",
    badge: "אנרגטי",
    previewText: "CRAZY RECORD",
    previewColor: "#4ade80",
    bgColor: "linear-gradient(135deg, #991b1b 0%, #1e1b4b 100%)",
    fontFamily: "'Impact', sans-serif"
  },
  {
    id: "minimal",
    name: "Minimalist Clean",
    category: "Minimal",
    description: "לבן נקי בסגנון Apple ו-TED, עדין ומקצועי",
    badge: "נקי",
    previewText: "Simple Clean",
    previewColor: "#38bdf8",
    bgColor: "linear-gradient(135deg, #0284c7 0%, #0f172a 100%)",
    fontFamily: "system-ui, sans-serif"
  }
];

interface CaptionTemplatePickerProps {
  selectedPreset: CaptionStylePreset;
  onSelect: (preset: CaptionStylePreset) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const CaptionTemplatePicker: React.FC<CaptionTemplatePickerProps> = ({
  selectedPreset,
  onSelect,
  onClose,
  isModal = false
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const categories = ["All", "Trending", "Bold", "Polished", "Minimal"];

  const filtered = CAPTION_TEMPLATES.filter((tpl) =>
    activeCategory === "All" ? true : tpl.category === activeCategory
  );

  const content = (
    <div style={{ direction: "rtl" }}>
      {/* Header if modal */}
      {isModal && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "12px"
          }}
        >
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              תבניות כתוביות (Captions Styles)
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
              בחר סגנון כתוביות מונפשות בהשראת תבניות Captions המובילות
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: "16px", lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Category Pills */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          overflowX: "auto",
          paddingBottom: "4px"
        }}
      >
        {categories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                background: isActive ? "#0f172a" : "#f1f5f9",
                color: isActive ? "#ffffff" : "#475569",
                border: "none",
                borderRadius: "20px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap"
              }}
            >
              {cat === "All" ? "הכל (All)" : cat}
            </button>
          );
        })}
      </div>

      {/* Grid of Templates */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "12px",
          maxHeight: isModal ? "60vh" : "auto",
          overflowY: isModal ? "auto" : "visible",
          padding: "2px"
        }}
      >
        {filtered.map((tpl) => {
          const isSelected = selectedPreset === tpl.id;
          return (
            <div
              key={tpl.id}
              onClick={() => {
                onSelect(tpl.id);
                if (onClose) onClose();
              }}
              style={{
                borderRadius: "12px",
                overflow: "hidden",
                border: isSelected ? "2.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                cursor: "pointer",
                transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                background: "#ffffff",
                boxShadow: isSelected ? "0 4px 12px rgba(59, 130, 246, 0.25)" : "0 1px 3px rgba(0,0,0,0.05)",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
                display: "flex",
                flexDirection: "column"
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                }
              }}
            >
              {/* Visual Preview Box */}
              <div
                style={{
                  background: tpl.bgColor,
                  height: "100px",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  textAlign: "center"
                }}
              >
                {/* Badge */}
                {tpl.badge && (
                  <span
                    style={{
                      position: "absolute",
                      top: "6px",
                      right: "6px",
                      background: "rgba(0, 0, 0, 0.65)",
                      color: "#ffffff",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: "6px",
                      backdropFilter: "blur(4px)"
                    }}
                  >
                    {tpl.badge}
                  </span>
                )}

                {/* Selected Indicator */}
                {isSelected && (
                  <span
                    style={{
                      position: "absolute",
                      top: "6px",
                      left: "6px",
                      background: "#3b82f6",
                      color: "#ffffff",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 900
                    }}
                  >
                    ✓
                  </span>
                )}

                {/* Typography simulation preview */}
                <div
                  style={{
                    fontFamily: tpl.fontFamily,
                    fontSize: tpl.id === "paper" ? "15px" : "17px",
                    fontWeight: 900,
                    color: tpl.previewColor,
                    letterSpacing: tpl.id === "vista" ? "2px" : "normal",
                    textShadow:
                      tpl.id === "paper"
                        ? "none"
                        : "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)",
                    padding: tpl.id === "paper" ? "2px 6px" : "0",
                    background: tpl.id === "paper" ? "#fef9c3" : "transparent",
                    borderRadius: tpl.id === "paper" ? "3px" : "0"
                  }}
                >
                  {tpl.previewText}
                </div>
              </div>

              {/* Info Footer */}
              <div style={{ padding: "10px 12px", flexGrow: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: "14px", color: "#0f172a" }}>{tpl.name}</strong>
                  {isSelected && <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>נבחר</span>}
                </div>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    margin: "4px 0 0 0",
                    lineHeight: 1.3
                  }}
                >
                  {tpl.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "760px",
          padding: "24px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
};
