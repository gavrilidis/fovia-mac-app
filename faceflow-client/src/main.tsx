import React from "react";
import ReactDOM from "react-dom/client";
import App, { SUB_WINDOW, SubWindowApp } from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

const Root = SUB_WINDOW ? <SubWindowApp name={SUB_WINDOW} /> : <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>{Root}</I18nProvider>
  </React.StrictMode>,
);
