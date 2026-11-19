import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { generateId } from "../utils/id";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = generateId("toast");
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  const success = useCallback((msg: string) => showToast(msg, "success"), [showToast]);
  const error = useCallback((msg: string) => showToast(msg, "error"), [showToast]);
  const info = useCallback((msg: string) => showToast(msg, "info"), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          maxWidth: "420px",
          width: "calc(100% - 48px)",
          pointerEvents: "none"
        }}
      >
        {toasts.map((t) => {
          const isErr = t.type === "error";
          const isSucc = t.type === "success";
          const bg = isErr ? "#2d1517" : isSucc ? "#122a1e" : "#1e293b";
          const border = isErr ? "#ef4444" : isSucc ? "#10b981" : "#3b82f6";
          const textColor = isErr ? "#fca5a5" : isSucc ? "#86efac" : "#93c5fd";

          return (
            <div
              key={t.id}
              style={{
                pointerEvents: "auto",
                background: bg,
                border: `1px solid ${border}`,
                color: "#f8fafc",
                borderRadius: "8px",
                padding: "12px 16px",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                fontSize: "14px",
                lineHeight: "1.4",
                direction: "rtl"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isErr && <AlertCircle size={18} color={textColor} />}
                {isSucc && <CheckCircle2 size={18} color={textColor} />}
                {!isErr && !isSucc && <Info size={18} color={textColor} />}
                <span>{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
