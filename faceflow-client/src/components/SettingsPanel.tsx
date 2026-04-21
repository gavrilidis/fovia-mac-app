import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import {
  AI_PROVIDERS,
  getAiApiKey,
  getAiModel,
  getAiProvider,
  setAiApiKey as saveAiApiKey,
  setAiModel as saveAiModel,
  setAiProvider as saveAiProvider,
  testAiConnection,
} from "../services/aiService";
import type { AIProvider } from "../services/aiService";
import type { Locale, Theme } from "../i18n";

interface SettingsPanelProps {
  onClose: () => void;
  // "modal" (default) renders an overlay + centered glass card for in-app use.
  // "window" renders a flat full-viewport layout for use inside a native
  // sub-window (avoids the "window-in-window" look).
  variant?: "modal" | "window";
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, variant = "modal" }) => {
  const { t, locale, setLocale, theme, setTheme } = useI18n();
  const isWindow = variant === "window";

  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [draftProvider, setDraftProvider] = useState<AIProvider>(getAiProvider);
  const [draftModel, setDraftModel] = useState(getAiModel(getAiProvider()));
  const [draftApiKey, setDraftApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState("");
  const [draftFaceSensitivity, setDraftFaceSensitivity] = useState(() => {
    const raw = localStorage.getItem("faceflow-face-threshold");
    const parsed = raw ? Number(raw) : 0.38;
    return Number.isFinite(parsed) ? parsed : 0.38;
  });
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [resetting, setResetting] = useState(false);

  const lastFolder = localStorage.getItem("faceflow-last-folder") ?? "";

  const currentConfig = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === draftProvider) ?? AI_PROVIDERS[0],
    [draftProvider],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const key = await getAiApiKey(draftProvider);
      if (!mounted) return;
      setSavedApiKey(key);
      setDraftApiKey(key);
      const model = getAiModel(draftProvider);
      setDraftModel(model);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [draftProvider]);

  const hasChanges =
    draftTheme !== theme ||
    draftLocale !== locale ||
    draftProvider !== getAiProvider() ||
    draftModel !== getAiModel(draftProvider) ||
    draftApiKey !== savedApiKey ||
    Number(localStorage.getItem("faceflow-face-threshold") ?? "0.38") !== draftFaceSensitivity;

  const handleApply = async () => {
    const oldFaceThreshold = Number(localStorage.getItem("faceflow-face-threshold") ?? "0.38");
    setTheme(draftTheme);
    setLocale(draftLocale);
    saveAiProvider(draftProvider);
    saveAiModel(draftProvider, draftModel);
    await saveAiApiKey(draftProvider, draftApiKey);
    localStorage.setItem("faceflow-face-threshold", draftFaceSensitivity.toFixed(2));
    setSavedApiKey(draftApiKey);
    // Notify the rest of the app so an in-memory regrouping can happen
    // without forcing the user to re-scan their library.
    if (Math.abs(oldFaceThreshold - draftFaceSensitivity) > 1e-4) {
      window.dispatchEvent(
        new CustomEvent<number>("faceflow:face-threshold-changed", {
          detail: draftFaceSensitivity,
        }),
      );
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setStatus(null);
    try {
      await testAiConnection(draftProvider, draftModel, draftApiKey);
      setStatus({ kind: "success", message: t("ai_test_success") });
    } catch (e) {
      setStatus({
        kind: "error",
        message: `${t("ai_test_failed")}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleResetScanData = async () => {
    if (!lastFolder || resetting) return;
    setResetting(true);
    try {
      await invoke<number>("reset_folder_data", { folderPath: lastFolder });
      localStorage.removeItem("faceflow-last-folder");
      window.dispatchEvent(new Event("faceflow:reset-scan"));
      onClose();
    } catch (e) {
      setStatus({
        kind: "error",
        message: `${t("settings_reset_failed")}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setResetting(false);
    }
  };

  // ---- Storage panel ----
  const [storage, setStorage] = useState<{
    db_bytes: number;
    models_bytes: number;
    exiftool_bytes: number;
    other_bytes: number;
    total_bytes: number;
    app_data_path: string;
  } | null>(null);
  const [vacuuming, setVacuuming] = useState(false);
  const refreshStorage = useCallback(async () => {
    try {
      const stats = await invoke<typeof storage>("get_storage_stats");
      setStorage(stats);
    } catch {
      setStorage(null);
    }
  }, []);
  useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);
  const handleVacuum = useCallback(async () => {
    setVacuuming(true);
    try {
      const reclaimed = await invoke<number>("vacuum_database");
      setStatus({
        kind: "success",
        message: t("settings_storage_vacuumed", { mb: (reclaimed / (1024 * 1024)).toFixed(1) }),
      });
      await refreshStorage();
    } catch (e) {
      setStatus({
        kind: "error",
        message: `${t("settings_storage_vacuum_failed")}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setVacuuming(false);
    }
  }, [refreshStorage, t]);
  const handleRevealAppData = useCallback(async () => {
    try {
      await invoke("reveal_app_data_in_finder");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Two layout modes:
  //   • modal  — overlay + centered glass card (legacy in-app behaviour)
  //   • window — flat full-viewport layout for native sub-windows so the
  //     content fills the OS window directly without a fake card border
  //     ("window-in-window" was confusing; users expect macOS-native chrome).
  const Outer: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isWindow ? (
      <div className="flex h-screen w-screen flex-col bg-surface text-fg">{children}</div>
    ) : (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-surface/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div className="glass w-[30rem] rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    );

  return (
    <Outer>
      <div className={isWindow ? "flex-1 overflow-y-auto px-6 pb-24 pt-6" : ""}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className={isWindow ? "text-[20px] font-semibold text-fg" : "text-[15px] font-semibold text-fg"}>{t("settings")}</h3>
          {!isWindow && (
            <button
              onClick={onClose}
              title={t("close")}
              aria-label={t("close")}
              className="rounded-lg p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("theme")}</label>
          <div className="flex gap-1.5 rounded-lg bg-surface/60 p-1">
            {(["dark", "light", "system"] as Theme[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setDraftTheme(opt)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  draftTheme === opt ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t(`theme_${opt}` as "theme_dark" | "theme_light" | "theme_system")}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("language")}</label>
          <div className="flex gap-1.5 rounded-lg bg-surface/60 p-1">
            {(["en", "ru"] as Locale[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setDraftLocale(opt)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  draftLocale === opt ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t(`lang_${opt}` as "lang_en" | "lang_ru")}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("face_match_sensitivity")}</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.3}
              max={0.6}
              step={0.01}
              value={draftFaceSensitivity}
              onChange={(e) => setDraftFaceSensitivity(parseFloat(e.target.value))}
              className="flex-1 neutral-range"
            />
            <span className="w-10 text-right text-[12px] tabular-nums text-fg-muted">{draftFaceSensitivity.toFixed(2)}</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-fg-muted/70">
            {t("face_match_sensitivity_hint")}
          </p>
        </div>

        <div className="mt-4 border-t border-edge/30 pt-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("ai_provider")}</label>
          <select
            value={draftProvider}
            onChange={(e) => setDraftProvider(e.target.value as AIProvider)}
            className="w-full rounded-lg border border-edge/40 bg-surface/60 px-3 py-2 text-[12px] text-fg outline-none focus:border-accent/50"
          >
            {AI_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>

          <label className="mb-2 mt-3 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("ai_model")}</label>
          <select
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="w-full rounded-lg border border-edge/40 bg-surface/60 px-3 py-2 text-[12px] text-fg outline-none focus:border-accent/50"
          >
            {currentConfig.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>

          <label className="mb-2 mt-3 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("ai_api_key")}</label>
          <input
            type="password"
            value={draftApiKey}
            onChange={(e) => setDraftApiKey(e.target.value)}
            placeholder={t("ai_api_key_placeholder")}
            className="w-full rounded-lg border border-edge/40 bg-surface/60 px-3 py-2 text-[12px] text-fg placeholder:text-fg-muted/40 outline-none transition-all focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className={`relative overflow-hidden rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all ${
                testingConnection
                  ? "border-accent/40 text-accent"
                  : "border-edge text-fg hover:bg-surface-elevated"
              }`}
            >
              {testingConnection && (
                <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-accent/15 to-transparent" />
              )}
              <span className="relative flex items-center gap-1.5">
                {testingConnection && (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {t("ai_test_connection")}
              </span>
            </button>
            {status && (
              <span
                className={`text-[11px] font-medium ${
                  status.kind === "success" ? "text-positive" : "text-negative"
                }`}
              >
                {status.message}
              </span>
            )}
          </div>
        </div>

        {/* ---- Storage ---- */}
        {storage && (
          <div className="mt-4 border-t border-edge/30 pt-4">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
              {t("settings_storage_title")}
            </label>
            <div className="mb-3 space-y-1 text-[11px] text-fg-muted/80">
              <div className="flex items-center justify-between">
                <span>{t("settings_storage_db")}</span>
                <span className="tabular-nums">{formatBytes(storage.db_bytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("settings_storage_models")}</span>
                <span className="tabular-nums">{formatBytes(storage.models_bytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("settings_storage_exiftool")}</span>
                <span className="tabular-nums">{formatBytes(storage.exiftool_bytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("settings_storage_other")}</span>
                <span className="tabular-nums">{formatBytes(storage.other_bytes)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-edge/30 pt-1 font-semibold text-fg">
                <span>{t("settings_storage_total")}</span>
                <span className="tabular-nums">{formatBytes(storage.total_bytes)}</span>
              </div>
            </div>
            <p className="mb-3 truncate text-[10px] text-fg-muted/50" title={storage.app_data_path}>
              {storage.app_data_path}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRevealAppData}
                className="rounded-md border border-edge/40 px-3 py-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
              >
                {t("settings_storage_reveal")}
              </button>
              <button
                onClick={handleVacuum}
                disabled={vacuuming}
                className="rounded-md border border-accent/40 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                {vacuuming ? t("settings_storage_vacuuming") : t("settings_storage_vacuum")}
              </button>
            </div>
          </div>
        )}

        {/* ---- Reset scan data ---- */}
        {lastFolder && (
          <div className="mt-4 border-t border-edge/30 pt-4">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
              {t("settings_reset_title")}
            </label>
            <p className="mb-2 text-[11px] leading-snug text-fg-muted/70">
              {t("settings_reset_desc")}
            </p>
            <p className="mb-3 truncate text-[10px] text-fg-muted/50" title={lastFolder}>
              {lastFolder}
            </p>
            <button
              onClick={handleResetScanData}
              disabled={resetting}
              className={`relative overflow-hidden rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all ${
                resetting
                  ? "border-negative/40 text-negative"
                  : "border-negative/30 text-negative hover:bg-negative/10"
              }`}
            >
              {resetting && (
                <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-negative/15 to-transparent" />
              )}
              <span className="relative flex items-center gap-1.5">
                {resetting && (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {t("settings_reset_button")}
              </span>
            </button>
          </div>
        )}

        <div className={isWindow ? "" : "mt-5 flex items-center justify-end gap-2"}>
          {!isWindow && (
            <>
              <button
                onClick={onClose}
                className="rounded-md px-4 py-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
              >
                {t("cancel")}
              </button>
              <button
                onClick={async () => {
                  await handleApply();
                  onClose();
                }}
                disabled={!hasChanges}
                className={`rounded-md px-4 py-1.5 text-[12px] font-medium transition-all ${
                  hasChanges
                    ? "bg-accent text-white hover:bg-accent-hover active:scale-[0.97]"
                    : "cursor-not-allowed bg-accent/30 text-white/50"
                }`}
              >
                {t("settings_apply")}
              </button>
            </>
          )}
        </div>
      </div>
      {isWindow && (
        // Sticky footer pinned to the bottom of the native window so the
        // primary actions stay visible regardless of scroll position.
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge/40 bg-surface-elevated/95 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            {t("cancel")}
          </button>
          <button
            onClick={async () => {
              await handleApply();
              onClose();
            }}
            disabled={!hasChanges}
            className={`rounded-md px-4 py-1.5 text-[12px] font-medium transition-all ${
              hasChanges
                ? "bg-accent text-white hover:bg-accent-hover active:scale-[0.97]"
                : "cursor-not-allowed bg-accent/30 text-white/50"
            }`}
          >
            {t("settings_apply")}
          </button>
        </div>
      )}
    </Outer>
  );
};
