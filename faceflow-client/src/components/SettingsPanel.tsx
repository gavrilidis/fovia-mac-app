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
import {
  LS_QUALITY_THRESHOLD,
  LS_MIN_FACE_SIZE,
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_MIN_FACE_SIZE,
} from "../services/faceGrouping";
import type { AIProvider } from "../services/aiService";
import type { Locale, Theme } from "../i18n";

// LocalStorage keys — kept here so other parts of the app (App.tsx,
// faceGrouping.ts) can read the same values without prop drilling.
export const LS_DETECTION_THRESHOLD = "faceflow-detection-threshold";
export const LS_FACE_THRESHOLD = "faceflow-face-threshold";
export const DEFAULT_DETECTION_THRESHOLD = 0.45;
export const DEFAULT_CLUSTER_THRESHOLD = 0.5;

interface SettingsPanelProps {
  onClose: () => void;
  // "modal"  — overlay + centered card for in-app use.
  // "window" — flat full-viewport layout for native macOS sub-windows.
  variant?: "modal" | "window";
}

type CategoryId = "general" | "scan" | "ai" | "storage";

interface Category {
  id: CategoryId;
  label: string;
  // Heroicons-style outline path data for the sidebar icon.
  icon: React.ReactNode;
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

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, variant = "modal" }) => {
  const { t, locale, setLocale, theme, setTheme } = useI18n();
  const isWindow = variant === "window";

  // ---- Active sidebar category --------------------------------------------
  const [activeCategory, setActiveCategory] = useState<CategoryId>("general");

  // ---- Draft state for each setting ---------------------------------------
  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [draftProvider, setDraftProvider] = useState<AIProvider>(getAiProvider);
  const [draftModel, setDraftModel] = useState(getAiModel(getAiProvider()));
  const [draftApiKey, setDraftApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState("");
  const [draftDetection, setDraftDetection] = useState(() =>
    readNumber(LS_DETECTION_THRESHOLD, DEFAULT_DETECTION_THRESHOLD),
  );
  const [draftCluster, setDraftCluster] = useState(() =>
    readNumber(LS_FACE_THRESHOLD, DEFAULT_CLUSTER_THRESHOLD),
  );
  const [draftQuality, setDraftQuality] = useState(() =>
    readNumber(LS_QUALITY_THRESHOLD, DEFAULT_QUALITY_THRESHOLD),
  );
  const [draftMinFace, setDraftMinFace] = useState(() =>
    readNumber(LS_MIN_FACE_SIZE, DEFAULT_MIN_FACE_SIZE),
  );
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [resetting, setResetting] = useState(false);

  const lastFolder = localStorage.getItem("faceflow-last-folder") ?? "";

  const currentConfig = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === draftProvider) ?? AI_PROVIDERS[0],
    [draftProvider],
  );

  // Lazy-load the API key whenever the provider changes.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const key = await getAiApiKey(draftProvider);
      if (!mounted) return;
      setSavedApiKey(key);
      setDraftApiKey(key);
      setDraftModel(getAiModel(draftProvider));
    };
    load();
    return () => {
      mounted = false;
    };
  }, [draftProvider]);

  // ---- Change detection ---------------------------------------------------
  const persistedDetection = readNumber(LS_DETECTION_THRESHOLD, DEFAULT_DETECTION_THRESHOLD);
  const persistedCluster = readNumber(LS_FACE_THRESHOLD, DEFAULT_CLUSTER_THRESHOLD);
  const persistedQuality = readNumber(LS_QUALITY_THRESHOLD, DEFAULT_QUALITY_THRESHOLD);
  const persistedMinFace = readNumber(LS_MIN_FACE_SIZE, DEFAULT_MIN_FACE_SIZE);
  const hasChanges =
    draftTheme !== theme ||
    draftLocale !== locale ||
    draftProvider !== getAiProvider() ||
    draftModel !== getAiModel(draftProvider) ||
    draftApiKey !== savedApiKey ||
    Math.abs(persistedDetection - draftDetection) > 1e-4 ||
    Math.abs(persistedCluster - draftCluster) > 1e-4 ||
    Math.abs(persistedQuality - draftQuality) > 1e-4 ||
    Math.abs(persistedMinFace - draftMinFace) > 0.5;

  const handleApply = async () => {
    const oldCluster = persistedCluster;
    const qualityChanged =
      Math.abs(persistedQuality - draftQuality) > 1e-4 ||
      Math.abs(persistedMinFace - draftMinFace) > 0.5;
    setTheme(draftTheme);
    setLocale(draftLocale);
    saveAiProvider(draftProvider);
    saveAiModel(draftProvider, draftModel);
    await saveAiApiKey(draftProvider, draftApiKey);
    localStorage.setItem(LS_DETECTION_THRESHOLD, draftDetection.toFixed(2));
    localStorage.setItem(LS_FACE_THRESHOLD, draftCluster.toFixed(2));
    localStorage.setItem(LS_QUALITY_THRESHOLD, draftQuality.toFixed(2));
    localStorage.setItem(LS_MIN_FACE_SIZE, Math.round(draftMinFace).toString());
    setSavedApiKey(draftApiKey);
    // Notify the rest of the app so an in-memory regrouping can happen
    // without forcing the user to re-scan their library. The same event is
    // emitted whenever the clustering threshold OR the quality filter
    // settings change — both require a regroup pass.
    if (Math.abs(oldCluster - draftCluster) > 1e-4 || qualityChanged) {
      window.dispatchEvent(
        new CustomEvent<number>("faceflow:face-threshold-changed", {
          detail: draftCluster,
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

  // ---- Storage panel ------------------------------------------------------
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

  // ESC closes the panel — standard macOS settings-window behaviour.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ---- Sidebar categories -------------------------------------------------
  const categories: Category[] = useMemo(
    () => [
      {
        id: "general",
        label: t("settings_cat_general"),
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
        ),
      },
      {
        id: "scan",
        label: t("settings_cat_scan"),
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 9h.008v.008H15V9zm.375 3a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm6 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        ),
      },
      {
        id: "ai",
        label: t("settings_cat_ai"),
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
          />
        ),
      },
      {
        id: "storage",
        label: t("settings_cat_storage"),
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
          />
        ),
      },
    ],
    [t],
  );

  // ---- Outer wrapper (modal vs window) ------------------------------------
  const Outer: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isWindow ? (
      <div className="flex h-screen w-screen flex-col bg-surface text-fg">{children}</div>
    ) : (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-surface/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="glass flex h-[500px] w-full max-w-7xl flex-col overflow-hidden rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );

  return (
    <Outer>
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Left sidebar (macOS-style category list) ------------------ */}
        <aside className="flex w-[180px] flex-shrink-0 flex-col gap-0.5 border-r border-edge/40 bg-surface-elevated/40 p-2">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted/70">
            {t("settings")}
          </div>
          {categories.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-fg-muted hover:bg-surface-elevated hover:text-fg"
                }`}
              >
                <svg
                  className="h-[15px] w-[15px] flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  {cat.icon}
                </svg>
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </aside>

        {/* ---- Right content area --------------------------------------- */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          {activeCategory === "general" && (
            <section className="space-y-5">
              <header>
                <h2 className="text-[16px] font-semibold text-fg">{t("settings_cat_general")}</h2>
                <p className="mt-0.5 text-[11px] text-fg-muted">{t("settings_general_desc")}</p>
              </header>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
                  {t("theme")}
                </label>
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
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
                  {t("language")}
                </label>
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
            </section>
          )}

          {activeCategory === "scan" && (
            <section className="space-y-6">
              <header>
                <h2 className="text-[16px] font-semibold text-fg">{t("settings_cat_scan")}</h2>
                <p className="mt-0.5 text-[11px] text-fg-muted">{t("settings_scan_desc")}</p>
              </header>

              {/* Detection threshold */}
              <div className="rounded-lg border border-edge/40 bg-surface-elevated/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-fg">{t("detection_threshold")}</h3>
                  <span className="text-[13px] font-bold tabular-nums text-fg">
                    {draftDetection.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={draftDetection}
                  onChange={(e) => setDraftDetection(parseFloat(e.target.value))}
                  title={t("detection_threshold")}
                  className="w-full neutral-range"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-fg-muted/80">
                  {t("settings_detection_help")}
                </p>
              </div>

              {/* Clustering similarity */}
              <div className="rounded-lg border border-edge/40 bg-surface-elevated/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-fg">{t("cluster_similarity")}</h3>
                  <span className="text-[13px] font-bold tabular-nums text-fg">
                    {draftCluster.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={0.95}
                  step={0.01}
                  value={draftCluster}
                  onChange={(e) => setDraftCluster(parseFloat(e.target.value))}
                  title={t("cluster_similarity")}
                  className="w-full neutral-range"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-fg-muted/80">
                  {t("settings_cluster_help")}
                </p>
              </div>

              {/* Face quality threshold — controls which detected faces
                  enter the *confident* persons pool. Anything below it
                  becomes an "Uncertain Person" instead of a real person. */}
              <div className="rounded-lg border border-edge/40 bg-surface-elevated/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-fg">{t("settings_quality_threshold")}</h3>
                  <span className="text-[13px] font-bold tabular-nums text-fg">
                    {draftQuality.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={0.9}
                  step={0.01}
                  value={draftQuality}
                  onChange={(e) => setDraftQuality(parseFloat(e.target.value))}
                  title={t("settings_quality_threshold")}
                  className="w-full neutral-range"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-fg-muted/80">
                  {t("settings_quality_help")}
                </p>
              </div>

              {/* Minimum face size — gate on the bounding-box edge so
                  far-away / tiny faces drop into Uncertain Persons too. */}
              <div className="rounded-lg border border-edge/40 bg-surface-elevated/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-fg">{t("settings_min_face_size")}</h3>
                  <span className="text-[13px] font-bold tabular-nums text-fg">
                    {Math.round(draftMinFace)} px
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={200}
                  step={5}
                  value={draftMinFace}
                  onChange={(e) => setDraftMinFace(parseFloat(e.target.value))}
                  title={t("settings_min_face_size")}
                  className="w-full neutral-range"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-fg-muted/80">
                  {t("settings_min_face_help")}
                </p>
              </div>
            </section>
          )}

          {activeCategory === "ai" && (
            <section className="space-y-4">
              <header>
                <h2 className="text-[16px] font-semibold text-fg">{t("settings_cat_ai")}</h2>
                <p className="mt-0.5 text-[11px] text-fg-muted">{t("settings_ai_desc")}</p>
              </header>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
                  {t("ai_provider")}
                </label>
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
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
                  {t("ai_model")}
                </label>
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
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">
                  {t("ai_api_key")}
                </label>
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
            </section>
          )}

          {activeCategory === "storage" && (
            <section className="space-y-4">
              <header>
                <h2 className="text-[16px] font-semibold text-fg">{t("settings_cat_storage")}</h2>
                <p className="mt-0.5 text-[11px] text-fg-muted">{t("settings_storage_desc")}</p>
              </header>

              {storage && (
                <div className="rounded-lg border border-edge/40 bg-surface-elevated/30 p-4">
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

              {lastFolder && (
                <div className="rounded-lg border border-negative/30 bg-negative/5 p-4">
                  <h3 className="text-[12px] font-semibold text-fg">{t("settings_reset_title")}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                    {t("settings_reset_desc")}
                  </p>
                  <p className="mt-1.5 mb-3 truncate text-[10px] text-fg-muted/60" title={lastFolder}>
                    {lastFolder}
                  </p>
                  <button
                    onClick={handleResetScanData}
                    disabled={resetting}
                    className="rounded-md border border-negative/40 px-3 py-1.5 text-[11px] font-medium text-negative transition-colors hover:bg-negative/10 disabled:opacity-50"
                  >
                    {resetting ? t("settings_reset_button") + "…" : t("settings_reset_button")}
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* ---- Sticky footer with Cancel / Apply (macOS standard) ---------- */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge/40 bg-surface-elevated/95 px-5 py-3">
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
    </Outer>
  );
};
