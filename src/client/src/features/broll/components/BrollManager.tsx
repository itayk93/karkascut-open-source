import React, { useState } from "react";
import { BrollAsset, BrollOverlay } from "../../../shared";

interface BrollManagerProps {
  projectId: string;
  assets?: BrollAsset[];
  overlays?: BrollOverlay[];
  onUploadAsset: (file: File) => Promise<void>;
  onUpdateAssetHint: (assetId: string, placementHint: string) => Promise<void>;
  onDeleteAsset: (assetId: string) => Promise<void>;
  onAutoMatchBroll: () => Promise<void>;
  isMatching: boolean;
}

export const BrollManager: React.FC<BrollManagerProps> = ({
  assets = [],
  overlays = [],
  onUploadAsset,
  onUpdateAssetHint,
  onDeleteAsset,
  onAutoMatchBroll,
  isMatching
}) => {
  const [uploading, setUploading] = useState<boolean>(false);
  const [hintDraft, setHintDraft] = useState<Record<string, string>>({});

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await onUploadAsset(file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="card" style={{ border: "1px solid #e2e8f0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          flexWrap: "wrap",
          gap: "10px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
            ספריית B-Roll ושכבת מדיה (תמונות וסרטונים)
          </h3>
          <span
            style={{
              fontSize: "12px",
              background: "#f1f5f9",
              color: "#334155",
              padding: "2px 8px",
              borderRadius: "6px",
              fontWeight: 600,
              border: "1px solid #e2e8f0"
            }}
          >
            {assets.length} נכסים
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="file"
            id="broll-upload-input"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            style={{ display: "none" }}
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            className="btn btn-secondary"
            onClick={() => document.getElementById("broll-upload-input")?.click()}
            disabled={uploading}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            {uploading ? "מעלה נכס..." : "העלה תמונה / סרטון B-Roll"}
          </button>

          <button
            className="btn btn-primary"
            onClick={onAutoMatchBroll}
            disabled={isMatching || assets.length === 0}
            style={{ fontSize: "13px", padding: "6px 16px", background: "#0f172a" }}
          >
            {isMatching ? "מנתח ומשבץ נכסים..." : "שבץ B-Roll אוטומטית"}
          </button>
        </div>
      </div>

      <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
        העלה תמונות המחשה, צילומי מסך או סרטונים קצרים. ה-AI ינתח את הנאמר בסרטון וישבץ אותם אוטומטית ברגע המדויק ביותר
        ברצף העריכה. אפשר לכתוב בשדה של כל נכס איפה למקם אותו במילים פשוטות (למשל „בהתחלה" או „אחרי המשפט ...") וה-AI יכבד את הבקשה.
        תמונות מקבלות תנועת זום עדינה (Ken Burns) אוטומטית ברינדור.
      </p>

      {/* Assets Gallery Grid */}
      {assets.length === 0 ? (
        <div
          style={{
            border: "2px dashed #cbd5e1",
            borderRadius: "8px",
            padding: "24px",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: "14px"
          }}
        >
          אין עדיין נכסי B-Roll. לחץ על "העלה תמונה / סרטון B-Roll" כדי להתחיל.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
          {assets.map((asset) => {
            const isAssigned = overlays.some((o) => o.assetId === asset.id);
            return (
              <div
                key={asset.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData("assetId", asset.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                style={{
                  background: "#f8fafc",
                  border: isAssigned ? "2px solid #8b5cf6" : "1px solid #cbd5e1",
                  borderRadius: "8px",
                  overflow: "hidden",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  cursor: "grab"
                }}
                title="גרור לערוץ 2 בטיים-ליין כדי לשבץ בשנייה הרצויה"
              >
                <div
                  style={{
                    height: "90px",
                    background: "#000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {asset.type === "image" ? (
                    <img crossOrigin="anonymous"
                      src={asset.fileUrl}
                      alt={asset.fileName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <video crossOrigin="anonymous" src={asset.fileUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                  )}
                </div>

                <div style={{ padding: "8px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#0f172a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {asset.fileName}
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b" }}
                  >
                    <span>{asset.type === "image" ? "תמונה" : "סרטון"}</span>
                    {isAssigned && <span style={{ color: "#059669", fontWeight: 700 }}>✓ משובץ</span>}
                  </div>

                  <textarea
                    rows={2}
                    value={hintDraft[asset.id] ?? asset.placementHint ?? ""}
                    onChange={(e) => setHintDraft((d) => ({ ...d, [asset.id]: e.target.value }))}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next !== (asset.placementHint ?? "")) onUpdateAssetHint(asset.id, next);
                    }}
                    placeholder="איפה למקם? בהתחלה / בסוף / אחרי המשפט '...' / כשמדבר על..."
                    style={{
                      width: "100%",
                      fontSize: "11px",
                      border: asset.placementHint ? "1px solid #8b5cf6" : "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "4px 6px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      background: asset.placementHint ? "#faf5ff" : "#fff"
                    }}
                    title="תיאור חופשי בעברית. ה-AI ימקם את הנכס לפי מה שתכתוב כאן."
                  />
                </div>

                <button
                  onClick={() => onDeleteAsset(asset.id)}
                  style={{
                    position: "absolute",
                    top: "4px",
                    left: "4px",
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    padding: "2px 6px",
                    fontSize: "11px"
                  }}
                  title="מחק נכס"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary of Active Overlays */}
      {overlays.length > 0 && (
        <div style={{ marginTop: "16px", borderTop: "1px solid #e2e8f0", paddingTop: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
            שיבוצי B-Roll פעילים על ציר הזמן ({overlays.length}):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {overlays.map((o) => {
              const asset = assets.find((a) => a.id === o.assetId);
              return (
                <div
                  key={o.id}
                  style={{
                    background: "#f5f3ff",
                    border: "1px solid #ddd6fe",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                    [{o.start.toFixed(1)}s - {o.end.toFixed(1)}s]
                  </span>
                  <span style={{ color: "#334155" }}>{asset?.fileName || "נכס"}</span>
                  <span style={{ color: "#64748b", fontSize: "11px" }}>({o.reason})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
