import React, { useRef, useEffect } from "react";

interface LiveLogsTerminalProps {
  logs?: string[];
  isActive?: boolean;
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  projectName?: string;
}

export const LiveLogsTerminal: React.FC<LiveLogsTerminalProps> = ({
  logs = [],
  isActive = false,
  title = "מסוף לוגים חי (Processing Terminal)",
  isOpen,
  onClose,
  projectName
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (isOpen === false) return null;

  const content = (
    <div className="terminal-window">
      <div className="terminal-header">
        <div className="terminal-dots">
          <span className="terminal-dot" style={{ background: "#ef4444" }} onClick={onClose}></span>
          <span className="terminal-dot" style={{ background: "#eab308" }}></span>
          <span className="terminal-dot" style={{ background: "#22c55e" }}></span>
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
          {projectName ? `${projectName} - ` : ""}{title} {isActive && <span style={{ color: "#38bdf8", marginRight: "6px" }}>● פעיל</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "11px", color: "#64748b" }}>{logs.length} שורות</div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="terminal-body">
        {logs.length === 0 ? (
          <div style={{ color: "#64748b" }}>ממתין לפקודות עיבוד...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="terminal-line">
              <span className="terminal-prompt">&gt;</span>
              <span className="terminal-text">{log}</span>
            </div>
          ))
        )}
        {isActive && (
          <div className="terminal-line" style={{ marginTop: "4px" }}>
            <span className="terminal-prompt">&gt;</span>
            <span className="terminal-cursor"></span>
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );

  if (isOpen !== undefined) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" style={{ maxWidth: "700px", padding: 0 }} onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return content;
};
