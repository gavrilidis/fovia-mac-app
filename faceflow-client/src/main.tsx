import React from "react";
import ReactDOM from "react-dom/client";
import App, { SUB_WINDOW, SubWindowApp } from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

// One-time migration: earlier builds shipped with strict defaults
// (60 px min face size, 0.60 quality) which left too many real faces in
// the Uncertain bucket. We now ship more permissive defaults (40 / 0.40)
// but users who already opened the app have those strict numbers stuck
// in localStorage. Detect the exact prior-default fingerprint and clear
// it so the new defaults apply on the next read.
try {
  const ls = window.localStorage;
  const STRICT_QUALITY = "0.60";
  const STRICT_MIN_FACE = "60";
  const MIGRATION_FLAG = "faceflow-defaults-migrated-v2";
  if (!ls.getItem(MIGRATION_FLAG)) {
    if (ls.getItem("faceflow-quality-threshold") === STRICT_QUALITY) {
      ls.removeItem("faceflow-quality-threshold");
    }
    if (ls.getItem("faceflow-min-face-size") === STRICT_MIN_FACE) {
      ls.removeItem("faceflow-min-face-size");
    }
    ls.setItem(MIGRATION_FLAG, "1");
  }
} catch {
  /* localStorage unavailable — nothing to migrate. */
}

const Root = SUB_WINDOW ? <SubWindowApp name={SUB_WINDOW} /> : <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>{Root}</I18nProvider>
  </React.StrictMode>,
);
