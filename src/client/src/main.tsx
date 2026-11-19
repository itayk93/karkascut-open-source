import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ToastProvider, ErrorBoundary } from "./shared";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
