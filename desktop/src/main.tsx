import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Dev harness: run the renderer in a plain browser with mocked IPC.
// Never active in production builds or inside the Tauri shell.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  const { installMockBackend } = await import("./dev/mockBackend");
  installMockBackend();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
