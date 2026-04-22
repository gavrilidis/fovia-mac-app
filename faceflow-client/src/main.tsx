import React from "react";
import ReactDOM from "react-dom/client";
import App, { SUB_WINDOW, SubWindowApp } from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

// Defaults migration. We have shipped multiple baselines over time:
//   v1 (initial)        : quality 0.60 / minFace 60   — too strict
//   v2 (over-correction): quality 0.40 / minFace 40   — flagged as too permissive
//   v3 (strict revert)  : quality 0.60 / minFace 60   — back to v1
//   v4 (current)        : quality 0.40 / minFace 40   — relaxed again, this is
//                        the recommended baseline going forward.
// On v4, drop any explicit value matching the older v1/v3 strict baseline so
// users land on the new permissive defaults automatically.
try {
  const ls = window.localStorage;
  const MIGRATION_FLAG = "faceflow-defaults-migrated-v4";
  if (!ls.getItem(MIGRATION_FLAG)) {
    if (ls.getItem("faceflow-quality-threshold") === "0.60") {
      ls.removeItem("faceflow-quality-threshold");
    }
    if (ls.getItem("faceflow-min-face-size") === "60") {
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
