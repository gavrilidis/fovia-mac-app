import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { getAiApiKey, setAiApiKey as saveAiApiKey, getAiProvider, setAiProvider as saveAiProvider } from "../services/aiService";
import type { AiProvider } from "../services/aiService";
import type { Locale, Theme } from "../i18n";

interface SettingsPanelProps {
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { t, locale, setLocale, theme, setTheme, glassIntensity, setGlassIntensity } = useI18n();
  const [aiProvider, setAiProviderState] = useState<AiProvider>(getAiProvider);
  const [aiApiKey, setAiApiKeyState] = useState(getAiApiKey);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-80 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-fg">{t("settings")}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Theme */}
        <div className="mb-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("theme")}</label>
          <div className="flex gap-1.5 rounded-lg bg-surface/60 p-1">
            {(["dark", "light", "system"] as Theme[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setTheme(opt)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  theme === opt ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t(`theme_${opt}` as "theme_dark" | "theme_light" | "theme_system")}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("language")}</label>
          <div className="flex gap-1.5 rounded-lg bg-surface/60 p-1">
            {(["en", "ru"] as Locale[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setLocale(opt)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  locale === opt ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t(`lang_${opt}` as "lang_en" | "lang_ru")}
              </button>
            ))}
          </div>
        </div>

        {/* Glass Intensity */}
        <div className="mt-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("glass_intensity")}</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={glassIntensity}
              onChange={(e) => setGlassIntensity(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-8 text-right text-[12px] tabular-nums text-fg-muted">{Math.round(glassIntensity * 100)}%</span>
          </div>
        </div>

        {/* AI Integration */}
        <div className="mt-4 border-t border-edge/30 pt-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted/60">{t("ai_integration")}</label>
          <div className="mb-3 flex gap-1.5 rounded-lg bg-surface/60 p-1">
            {(["openai", "anthropic"] as AiProvider[]).map((opt) => (
              <button
                key={opt}
                onClick={() => { setAiProviderState(opt); saveAiProvider(opt); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  aiProvider === opt ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {opt === "openai" ? "OpenAI" : "Anthropic"}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => { setAiApiKeyState(e.target.value); saveAiApiKey(e.target.value); }}
              placeholder={t("ai_api_key_placeholder")}
              className="w-full rounded-lg border border-edge/40 bg-surface/60 px-3 pr-24 py-2 text-[12px] text-fg placeholder:text-fg-muted/40 outline-none transition-all focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
            {aiApiKey && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-positive">
                {t("ai_connected")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
