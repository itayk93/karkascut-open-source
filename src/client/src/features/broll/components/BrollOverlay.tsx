import React, { useMemo } from "react";
import { BrollAsset, BrollOverlay as OverlayType } from "../../../shared";

interface BrollOverlayProps {
  overlays?: OverlayType[];
  assets?: BrollAsset[];
  currentTime: number;
}

export const BrollOverlay: React.FC<BrollOverlayProps> = ({ overlays = [], assets = [], currentTime }) => {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const activeOverlay = useMemo(() => {
    return overlays.find((o) => currentTime >= o.start && currentTime <= o.end);
  }, [overlays, currentTime]);

  if (!activeOverlay) return null;

  const asset = assetMap.get(activeOverlay.assetId);
  if (!asset) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "14%",
        left: "8%",
        right: "8%",
        bottom: "30%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 18,
        pointerEvents: "none",
        animation: "fadeIn 0.25s ease"
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "14px",
          overflow: "hidden",
          border: "3px solid #6366f1",
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.65)",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative"
        }}
      >
        {asset.type === "image" ? (
          <img crossOrigin="anonymous"
            src={asset.fileUrl}
            alt={asset.fileName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain"
            }}
          />
        ) : (
          <video crossOrigin="anonymous"
            src={asset.fileUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain"
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            background: "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 600,
            backdropFilter: "blur(4px)"
          }}
        >
          B-Roll: {asset.title || asset.fileName}
        </div>
      </div>
    </div>
  );
};
