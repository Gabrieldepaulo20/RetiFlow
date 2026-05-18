import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkLoadRecovery } from "@/lib/chunkRecovery";
import { initMonitoring } from "@/lib/monitoring";

installChunkLoadRecovery();
initMonitoring();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
