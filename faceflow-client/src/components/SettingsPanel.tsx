import React, { useEffect, useMemo, useState } from "react";
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
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { t, locale, setLocale, theme, setTheme, glassIntensity, setGlassIntensity } = useI18n();

  const [draftTheme, setDraftTheme] = useState<Theme>(theme);
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [draftGlass, setDraftGlass] = useState(glassIntensity);
  const [draftProvider, setDraftProvider] = useState<AIProvider>(getAiProvider);
  const [draftModel, setDraftModel] = useState(getAiModel(getAiProvider()));
  const [draftApiKey, setDraftApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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
    draftGlass !== glassIntensity ||
    draftProvider !== getAiProvider() ||
    draftModel !== getAiModel(draftProvider) ||
    draftApiKey !== savedApiKey;

  const handleApply = async () => {
    setTheme(draftTheme);
    setLocale(draftLocale);
    setGlassIntensity(draftGlass);
    saveAiProvider(draftProvider);
    saveAiModel(draftProvider, draftModel);
    await saveAiApiKey(draftProvider, draftApiKey);
    setSavedApiKey(draftApiKey);
  };

  const handleTestConnection = async () => {
    try {
      await testAiConnection(draftProvider, draftModel, draftApiKey);
      setStatus(t("ai_test_success"));
    } catch (e) {
      setStatus(`${t("ai_test_failed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-[30rem] rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-fg">{t("settings")}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("glass_intensity")}</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draftGlass}
              onChange={(e) => setDraftGlass(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-8 text-right text-[12px] tabular-nums text-fg-muted">{Math.round(draftGlass * 100)}%</span>
          </div>
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
              className="rounded-md border border-edge px-3 py-1.5 text-[11px] font-medium text-fg transition-colors hover:bg-surface-elevated"
            >
              {t("ai_test_connection")}
            </button>
            {status && <span className="text-[11px] text-fg-muted">{status}</span>}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
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
      </div>
    </div>
  );
};
