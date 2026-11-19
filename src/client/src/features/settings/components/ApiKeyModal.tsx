import React, { useState } from "react";
import { Key, Eye, CheckCircle2, ShieldAlert, Server } from "lucide-react";
import { getApiBase, setApiBase, isNativeApp } from "../../../shared";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasServerKey: boolean;
  maskedServerKey: string | null;
  hasNvidiaKey: boolean;
  maskedNvidiaKey: string | null;
  onSaveOpenAiKey: (key: string) => Promise<boolean | undefined>;
  onSaveNvidiaKey: (key: string) => Promise<boolean | undefined>;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  hasServerKey,
  maskedServerKey,
  hasNvidiaKey,
  maskedNvidiaKey,
  onSaveOpenAiKey,
  onSaveNvidiaKey
}) => {
  const [inputOpenAiKey, setInputOpenAiKey] = useState("");
  const [inputNvidiaKey, setInputNvidiaKey] = useState("");
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [savingNvidia, setSavingNvidia] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBase());

  if (!isOpen) return null;

  const handleSaveServer = () => {
    setApiBase(serverUrl.trim());
    window.location.reload();
  };

  const handleSaveOpenAi = async () => {
    if (!inputOpenAiKey.trim()) return;
    setSavingOpenAi(true);
    const ok = await onSaveOpenAiKey(inputOpenAiKey.trim());
    setSavingOpenAi(false);
    if (ok) setInputOpenAiKey("");
  };

  const handleSaveNvidia = async () => {
    if (!inputNvidiaKey.trim()) return;
    setSavingNvidia(true);
    const ok = await onSaveNvidiaKey(inputNvidiaKey.trim());
    setSavingNvidia(false);
    if (ok) setInputNvidiaKey("");
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "520px",
          padding: "24px",
          color: "#f8fafc",
          direction: "rtl"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <Key size={22} color="#3b82f6" />
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>הגדרות מפתחות API</h2>
        </div>

        <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5", marginBottom: "20px" }}>
          המפתחות נשמרים בשרת גם אחרי סגירה ופתיחה. שדה ההזנה נשאר ריק כדי לא להציג את המפתח.
          הסימון „מוגדר” מציין שמפתח כבר שמור.
        </p>

        {/* Processing server address (needed in the mobile app) */}
        <div style={{ marginBottom: "20px", background: "#0f172a", padding: "16px", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <Server size={14} color="#3b82f6" />
            <span style={{ fontSize: "14px", fontWeight: 500 }}>כתובת שרת העיבוד</span>
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "8px" }}>
            {isNativeApp
              ? "באפליקציה: כתובת המחשב שמריץ את השרת, למשל http://192.168.1.127:3050"
              : "השאר ריק כדי להשתמש באותו שרת שמגיש את האתר."}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="url"
              dir="ltr"
              placeholder="http://192.168.1.127:3050"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              style={{
                flex: 1,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              onClick={handleSaveServer}
              style={{
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              שמור
            </button>
          </div>
        </div>

        {/* OpenAI Key Section */}
        <div style={{ marginBottom: "20px", background: "#0f172a", padding: "16px", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>OpenAI API Key (לתמלול ועריכת AI)</span>
            {hasServerKey ? (
              <span style={{ fontSize: "12px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={14} /> מוגדר ({maskedServerKey})
              </span>
            ) : (
              <span style={{ fontSize: "12px", color: "#f59e0b", display: "flex", alignItems: "center", gap: "4px" }}>
                <ShieldAlert size={14} /> טרם הוגדר
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              placeholder={hasServerKey ? "מפתח שמור — הזן כאן רק להחלפה" : "sk-..."}
              value={inputOpenAiKey}
              onChange={(e) => setInputOpenAiKey(e.target.value)}
              style={{
                flex: 1,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              onClick={handleSaveOpenAi}
              disabled={savingOpenAi || !inputOpenAiKey.trim()}
              style={{
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                cursor: "pointer",
                opacity: savingOpenAi || !inputOpenAiKey.trim() ? 0.6 : 1
              }}
            >
              {savingOpenAi ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>

        {/* NVIDIA Maxine Key Section */}
        <div style={{ marginBottom: "24px", background: "#0f172a", padding: "16px", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>
              NVIDIA Maxine NIM API Key (אופציונלי לתיקון קשר עין)
            </span>
            {hasNvidiaKey ? (
              <span style={{ fontSize: "12px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={14} /> מוגדר ({maskedNvidiaKey})
              </span>
            ) : (
              <span style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                <Eye size={14} /> לא חובה (ברירת מחדל: OpenCV מקומי)
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              placeholder="nvapi-..."
              value={inputNvidiaKey}
              onChange={(e) => setInputNvidiaKey(e.target.value)}
              style={{
                flex: 1,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                padding: "8px 12px",
                color: "#f8fafc",
                fontSize: "13px"
              }}
            />
            <button
              onClick={handleSaveNvidia}
              disabled={savingNvidia || !inputNvidiaKey.trim()}
              style={{
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                cursor: "pointer",
                opacity: savingNvidia || !inputNvidiaKey.trim() ? 0.6 : 1
              }}
            >
              {savingNvidia ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "#334155",
              color: "#f8fafc",
              border: "none",
              borderRadius: "6px",
              padding: "8px 20px",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
