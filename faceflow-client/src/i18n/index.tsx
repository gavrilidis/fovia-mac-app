import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { en } from "./en";
import { ru } from "./ru";
import type { TranslationKey } from "./en";

export type Locale = "en" | "ru";
export type Theme = "dark" | "light" | "system";

const translations = { en, ru } as const;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getSystemTheme(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem("faceflow-locale");
    return (stored === "ru" ? "ru" : "en") as Locale;
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("faceflow-theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "dark";
  });

  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(getSystemTheme);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  // Sync theme/locale when another native window writes to localStorage
  // (e.g. Settings sub-window calls setTheme → main window picks it up).
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "faceflow-theme" && e.newValue) {
        const v = e.newValue;
        if (v === "dark" || v === "light" || v === "system") setThemeState(v);
      }
      if (e.key === "faceflow-locale" && e.newValue) {
        const v = e.newValue;
        if (v === "en" || v === "ru") setLocaleState(v as Locale);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("faceflow-locale", l);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("faceflow-theme", t);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>): string => {
      let text = translations[locale][key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, v);
        }
      }
      return text;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, theme, setTheme, resolvedTheme }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
