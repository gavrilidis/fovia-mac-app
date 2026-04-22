import React from "react";
import ReactDOM from "react-dom/client";
import App, { SUB_WINDOW, SubWindowApp } from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

// Defaults migration. We have shipped two prior baselines:
//   v1 (initial)        : quality 0.60 / minFace 60   — too strict
//   v2 (over-correction): quality 0.40 / minFace 40   — way too permissive
// We are now standardising on the original strict baseline (0.60 / 60)
// because it produces the cleanest set of confident persons. Reset any
// localStorage value matching the v2 baseline so the new defaults apply.
try {
  const ls = window.localStorage;
  const MIGRATION_FLAG = "faceflow-defaults-migrated-v3";
  if (!ls.getItem(MIGRATION_FLAG)) {
    if (ls.getItem("faceflow-quality-threshold") === "0.40") {
      ls.removeItem("faceflow-quality-threshold");
    }
    if (ls.getItem("faceflow-min-face-size") === "40") {
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
