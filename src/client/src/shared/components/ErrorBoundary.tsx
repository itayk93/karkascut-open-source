import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort guard: any render/runtime crash below this shows a readable
 * message + reload instead of a blank white screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught UI error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        dir="rtl"
        style={{
          maxWidth: "560px",
          margin: "80px auto",
          padding: "28px",
          background: "#fff",
          border: "1px solid #fecaca",
          borderRadius: "14px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          fontFamily: "system-ui, sans-serif"
        }}
      >
        <h2 style={{ margin: "0 0 8px", color: "#b91c1c", fontSize: "18px" }}>משהו נשבר בממשק</h2>
        <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#475569" }}>
          התרחשה שגיאה שמנעה מהעמוד להיטען. הנתונים שלך נשמרו בשרת.
        </p>
        <pre
          style={{
            fontSize: "12px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "10px",
            overflowX: "auto",
            color: "#334155",
            direction: "ltr"
          }}
        >
          {this.state.error.message}
        </pre>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "9px 18px",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            רענן את העמוד
          </button>
          <button
            onClick={() => {
              try {
                window.location.href = "/";
              } catch {
                /* noop */
              }
            }}
            style={{
              background: "#fff",
              color: "#0f172a",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "9px 18px",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            חזרה לרשימת הפרויקטים
          </button>
        </div>
      </div>
    );
  }
}
