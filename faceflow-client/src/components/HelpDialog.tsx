import React, { useState, useEffect } from "react";
import { useI18n } from "../i18n";

interface HelpDialogProps {
  onClose: () => void;
  // "modal" (default) renders an overlay + centered card for in-app use.
  // "window" renders a flat full-viewport layout for native sub-windows.
  variant?: "modal" | "window";
}

type Tab = "install" | "workflow" | "shortcuts" | "sorting" | "privacy";

const TAB_IDS: Tab[] = ["install", "workflow", "sorting", "shortcuts", "privacy"];

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-edge bg-surface-elevated px-1.5 text-[10px] font-medium text-fg-muted">
    {children}
  </kbd>
);

const ShortcutRow: React.FC<{ keys: React.ReactNode; label: string }> = ({ keys, label }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-[12px] text-fg-muted">{label}</span>
    <div className="flex items-center gap-1">{keys}</div>
  </div>
);

export const HelpDialog: React.FC<HelpDialogProps> = ({ onClose, variant = "modal" }) => {
  const isWindow = variant === "window";
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("workflow");
  // Restored Help search (was previously removed in a refactor). Typing in
  // the search box jumps to whichever tab contains the first keyword match.
  // The mapping is intentionally simple — the Help dialog is small and an
  // index/fuzzy search would be overkill.
  const [query, setQuery] = useState("");

  // Keyword → tab mapping. Lower-case substrings only.
  const tabKeywords: Record<Tab, string[]> = {
    install: ["install", "exiftool", "model", "buffalo", "download", "setup", "установ"],
    workflow: ["scan", "folder", "drag", "raw", "preview", "сканир", "папк"],
    sorting: ["sort", "rating", "color", "label", "pick", "reject", "сортир", "оцен", "метк"],
    shortcuts: ["shortcut", "keyboard", "key", "горяч", "клавиш"],
    privacy: ["privacy", "cloud", "data", "приват", "облак", "данн"],
  };

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    for (const tab of TAB_IDS) {
      if (tabKeywords[tab].some((kw) => kw.includes(q) || q.includes(kw))) {
        setActiveTab(tab);
        break;
      }
    }
    // tabKeywords is derived from a constant literal, no dependency needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const tabLabels: Record<Tab, string> = {
    install: t("help_tab_install"),
    workflow: t("help_tab_workflow"),
    sorting: t("help_tab_sorting"),
    shortcuts: t("help_tab_shortcuts"),
    privacy: t("help_tab_privacy"),
  };

  return (
    <div
      className={
        isWindow
          ? "flex h-screen w-screen flex-col bg-surface"
          : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      }
    >
      <div
        className={
          isWindow
            ? "flex h-full w-full flex-col overflow-hidden bg-surface"
            : "flex h-[520px] w-[640px] flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <h2 className="text-[14px] font-semibold text-fg">{t("help_title")}</h2>
          </div>
          <button
            onClick={onClose}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg ${isWindow ? "hidden" : ""}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search box (restored) */}
        <div className="border-b border-edge px-5 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("help_search_placeholder")}
            className="w-full rounded-md border border-edge bg-surface-elevated px-3 py-1.5 text-[12px] text-fg placeholder:text-fg-muted/60 outline-none focus:border-accent/60"
            autoFocus
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-edge px-5">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative px-3 py-2.5 text-[12px] font-medium transition-colors ${
                activeTab === id
                  ? "text-accent"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {tabLabels[id]}
              {activeTab === id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "install" && <InstallTab />}
          {activeTab === "workflow" && <WorkflowTab />}
          {activeTab === "sorting" && <SortingTab />}
          {activeTab === "shortcuts" && <ShortcutsTab />}
          {activeTab === "privacy" && <PrivacyTab />}
        </div>
      </div>
    </div>
  );
};

/* ── Tab Content ── */

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[13px] font-semibold text-fg">{children}</h3>
);

const Para: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">{children}</p>
);

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <div className="mb-3 rounded-lg bg-surface-elevated px-3 py-2">
    <code className="select-all text-[11px] text-accent">{children}</code>
  </div>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-3 flex gap-2.5 rounded-lg border border-accent/20 bg-accent/5 px-3.5 py-2.5">
    <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
    <p className="text-[11px] leading-relaxed text-fg-muted">{children}</p>
  </div>
);

const InstallTab = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <SectionTitle>{t("help_install_title")}</SectionTitle>
      <Para>{t("help_install_intro")}</Para>

      <SectionTitle>{t("help_install_option1")}</SectionTitle>
      <div className="space-y-2">
        <Step number={1} title={t("help_install_step1_title")}>{t("help_install_step1_desc")}</Step>
        <Step number={2} title={t("help_install_step2_title")}>{t("help_install_step2_desc")}</Step>
        <Step number={3} title={t("help_install_step3_title")}>{t("help_install_step3_desc")}</Step>
        <Step number={4} title={t("help_install_step4_title")}>{t("help_install_step4_desc")}</Step>
      </div>

      <SectionTitle>{t("help_install_option2")}</SectionTitle>
      <Para>{t("help_install_terminal_intro")}</Para>
      <CodeBlock>{t("help_install_terminal_cmd")}</CodeBlock>
      <Para>{t("help_install_terminal_desc")}</Para>

      <SectionTitle>{t("help_install_first_launch")}</SectionTitle>
      <Para>{t("help_install_first_launch_desc")}</Para>
      <Para>{t("help_install_models_desc")}</Para>

      <SectionTitle>{t("help_install_sysreq")}</SectionTitle>
      <ul className="mb-3 list-inside list-disc space-y-1 text-[12px] text-fg-muted">
        <li>{t("help_install_sysreq_macos")}</li>
        <li>{t("help_install_sysreq_chip")}</li>
        <li>{t("help_install_sysreq_disk")}</li>
        <li>{t("help_install_sysreq_net")}</li>
      </ul>
      <Para>{t("help_install_selfcontained")}</Para>
    </div>
  );
};

const WorkflowTab = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <SectionTitle>{t("help_workflow_title")}</SectionTitle>
      <Para>{t("help_workflow_intro")}</Para>

      <div className="space-y-3">
        <Step number={1} title={t("help_workflow_step1_title")}>{t("help_workflow_step1_desc")}</Step>
        <Step number={2} title={t("help_workflow_step2_title")}>{t("help_workflow_step2_desc")}</Step>
        <Step number={3} title={t("help_workflow_step3_title")}>{t("help_workflow_step3_desc")}</Step>
        <Step number={4} title={t("help_workflow_step4_title")}>{t("help_workflow_step4_desc")}</Step>
        <Step number={5} title={t("help_workflow_step5_title")}>{t("help_workflow_step5_desc")}</Step>
      </div>

      <SectionTitle>{t("help_workflow_timeline_title")}</SectionTitle>
      <Para>{t("help_workflow_timeline_desc")}</Para>

      <SectionTitle>{t("help_stop_resume_title")}</SectionTitle>
      <Para>{t("help_stop_resume_desc")}</Para>

      <SectionTitle>{t("help_bulk_persons_title")}</SectionTitle>
      <Para>{t("help_bulk_persons_desc")}</Para>

      <SectionTitle>{t("help_workflow_accuracy_title")}</SectionTitle>
      <Hint>{t("help_workflow_accuracy_hint")}</Hint>

      <SectionTitle>{t("help_workflow_formats_title")}</SectionTitle>
      <Para>{t("help_workflow_formats_intro")}</Para>
      <ul className="mb-3 list-inside list-disc space-y-1 text-[12px] text-fg-muted">
        <li>{t("help_workflow_formats_raw")}</li>
        <li>{t("help_workflow_formats_apple")}</li>
        <li>{t("help_workflow_formats_standard")}</li>
      </ul>
      <Hint>{t("help_workflow_formats_hint")}</Hint>
    </div>
  );
};

const SortingTab = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <SectionTitle>{t("help_sorting_cross_title")}</SectionTitle>
      <Para>{t("help_sorting_cross_desc")}</Para>
      <Hint>{t("help_sorting_cross_hint")}</Hint>

      <SectionTitle>{t("help_sorting_move_title")}</SectionTitle>
      <Para>{t("help_sorting_move_desc")}</Para>
      <ol className="mb-3 list-inside list-decimal space-y-1.5 text-[12px] text-fg-muted">
        <li>{t("help_sorting_move_step1")}</li>
        <li>{t("help_sorting_move_step2")}</li>
        <li>{t("help_sorting_move_step3")}</li>
        <li>{t("help_sorting_move_step4")}</li>
      </ol>

      <SectionTitle>{t("help_sorting_selectall_title")}</SectionTitle>
      <Para>{t("help_sorting_selectall_desc")}</Para>

      <SectionTitle>{t("help_sorting_rename_title")}</SectionTitle>
      <Para>{t("help_sorting_rename_desc")}</Para>

      <SectionTitle>{t("help_sorting_filters_title")}</SectionTitle>
      <Para>{t("help_sorting_filters_desc")}</Para>
      <Hint>{t("help_sorting_filters_hint")}</Hint>
    </div>
  );
};

const ShortcutsTab = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <SectionTitle>{t("help_shortcuts_ratings")}</SectionTitle>
      <div className="rounded-lg border border-edge p-3">
        <ShortcutRow keys={<Kbd>0</Kbd>} label={t("help_shortcuts_clear_rating")} />
        <ShortcutRow keys={<Kbd>1</Kbd>} label={t("help_shortcuts_star", { n: "1" })} />
        <ShortcutRow keys={<Kbd>2</Kbd>} label={t("help_shortcuts_stars", { n: "2" })} />
        <ShortcutRow keys={<Kbd>3</Kbd>} label={t("help_shortcuts_stars", { n: "3" })} />
        <ShortcutRow keys={<Kbd>4</Kbd>} label={t("help_shortcuts_stars", { n: "4" })} />
        <ShortcutRow keys={<Kbd>5</Kbd>} label={t("help_shortcuts_stars", { n: "5" })} />
      </div>

      <SectionTitle>{t("help_shortcuts_pick_status")}</SectionTitle>
      <div className="rounded-lg border border-edge p-3">
        <ShortcutRow keys={<Kbd>P</Kbd>} label={t("help_shortcuts_pick")} />
        <ShortcutRow keys={<Kbd>X</Kbd>} label={t("help_shortcuts_reject")} />
        <ShortcutRow keys={<Kbd>U</Kbd>} label={t("help_shortcuts_unflag")} />
        <ShortcutRow keys={<Kbd>Backspace</Kbd>} label={t("help_shortcuts_reject")} />
      </div>

      <SectionTitle>{t("help_shortcuts_color_labels")}</SectionTitle>
      <div className="rounded-lg border border-edge p-3">
        <ShortcutRow keys={<Kbd>6</Kbd>} label={t("help_shortcuts_red")} />
        <ShortcutRow keys={<Kbd>7</Kbd>} label={t("help_shortcuts_yellow")} />
        <ShortcutRow keys={<Kbd>8</Kbd>} label={t("help_shortcuts_green")} />
        <ShortcutRow keys={<Kbd>9</Kbd>} label={t("help_shortcuts_blue")} />
      </div>

      <SectionTitle>{t("help_shortcuts_selection")}</SectionTitle>
      <div className="rounded-lg border border-edge p-3">
        <ShortcutRow keys={<><Kbd>Cmd</Kbd><span className="text-[10px] text-fg-muted">+</span><Kbd>A</Kbd></>} label={t("help_shortcuts_select_all")} />
        <ShortcutRow keys={<Kbd>Esc</Kbd>} label={t("help_shortcuts_deselect")} />
      </div>

      <SectionTitle>{t("help_shortcuts_viewer")}</SectionTitle>
      <div className="rounded-lg border border-edge p-3">
        <ShortcutRow keys={<span className="text-[10px] text-fg-muted">{t("help_shortcuts_double_click")}</span>} label={t("help_shortcuts_open_viewer")} />
        <ShortcutRow keys={<Kbd>Esc</Kbd>} label={t("help_shortcuts_close_viewer")} />
      </div>
    </div>
  );
};

const PrivacyTab = () => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <SectionTitle>{t("help_privacy_local_title")}</SectionTitle>
      <Para>{t("help_privacy_local_desc")}</Para>

      <SectionTitle>{t("help_privacy_models_title")}</SectionTitle>
      <Para>{t("help_privacy_models_desc")}</Para>
      <ul className="mb-3 list-inside list-disc space-y-1 text-[12px] text-fg-muted">
        <li>{t("help_privacy_model_det")}</li>
        <li>{t("help_privacy_model_emb")}</li>
      </ul>
      <Para>{t("help_privacy_models_local")}</Para>

      <SectionTitle>{t("help_privacy_activation_title")}</SectionTitle>
      <Para>{t("help_privacy_activation_desc")}</Para>

      <SectionTitle>{t("help_privacy_network_title")}</SectionTitle>
      <Para>{t("help_privacy_network_desc")}</Para>
      <Hint>{t("help_privacy_network_hint")}</Hint>
    </div>
  );
};

const Step: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({
  number,
  title,
  children,
}) => (
  <div className="flex gap-3">
    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
      {number}
    </div>
    <div>
      <h4 className="text-[12px] font-semibold text-fg">{title}</h4>
      <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  </div>
);
