import React, { useState } from "react";

interface HelpDialogProps {
  onClose: () => void;
}

type Tab = "install" | "workflow" | "shortcuts" | "sorting" | "privacy";

const TABS: { id: Tab; label: string }[] = [
  { id: "install", label: "Installation" },
  { id: "workflow", label: "Workflow" },
  { id: "sorting", label: "Photo Sorting" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "privacy", label: "Privacy" },
];

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

export const HelpDialog: React.FC<HelpDialogProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>("workflow");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[520px] w-[640px] flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <h2 className="text-[14px] font-semibold text-fg">FaceFlow Help</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-edge px-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-2.5 text-[12px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-accent"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
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

const InstallTab = () => (
  <div className="space-y-4">
    <SectionTitle>Installing FaceFlow</SectionTitle>
    <Para>
      Open the downloaded DMG file and drag FaceFlow to the Applications folder.
      On first launch, macOS may block the app because it is not signed with an
      Apple Developer certificate. There are two ways to allow it to run.
    </Para>

    <SectionTitle>Option 1: System Settings (recommended)</SectionTitle>
    <div className="space-y-2">
      <Step number={1} title="Try to open FaceFlow">
        Double-click the app in Applications. macOS will show a message that the app
        cannot be opened because it is from an unidentified developer.
      </Step>
      <Step number={2} title="Open System Settings">
        Go to System Settings (Apple menu) &gt; Privacy &amp; Security.
      </Step>
      <Step number={3} title="Allow the app">
        Scroll down to the Security section. You will see a message:
        "FaceFlow was blocked from use because it is not from an identified developer."
        Click "Open Anyway" and confirm.
      </Step>
      <Step number={4} title="Launch again">
        Open FaceFlow again. This time macOS will ask one more time — click Open.
        After that the app will open normally every time.
      </Step>
    </div>

    <SectionTitle>Option 2: Terminal command</SectionTitle>
    <Para>
      Open Terminal (Applications &gt; Utilities &gt; Terminal) and run:
    </Para>
    <CodeBlock>xattr -cr "/Applications/FaceFlow.app"</CodeBlock>
    <Para>
      This removes the macOS quarantine flag from FaceFlow. After running this command,
      the app will open without any warnings. If you installed FaceFlow to a different
      location, replace the path accordingly.
    </Para>

    <SectionTitle>First Launch</SectionTitle>
    <Para>
      On the first launch, FaceFlow will ask for a license key. Enter the serial number
      you received. An internet connection is required for activation (one-time only).
    </Para>
    <Para>
      After activation, FaceFlow will download two AI models (~183 MB total) for local
      face detection. This happens once, and after that the app works fully offline.
    </Para>

    <SectionTitle>System Requirements</SectionTitle>
    <ul className="mb-3 list-inside list-disc space-y-1 text-[12px] text-fg-muted">
      <li>macOS 11.0 (Big Sur) or later</li>
      <li>Apple Silicon (M1/M2/M3/M4) or Intel Mac</li>
      <li>At least 500 MB of free disk space</li>
      <li>Internet for first-time activation and model download</li>
    </ul>
    <Para>
      No additional software (Homebrew, Python, Xcode, etc.) needs to be installed.
      FaceFlow is fully self-contained.
    </Para>
  </div>
);

const WorkflowTab = () => (
  <div className="space-y-4">
    <SectionTitle>Getting Started</SectionTitle>
    <Para>
      FaceFlow is a desktop photo management app designed for expedition photographers.
      It uses AI face recognition to automatically group photos by person, then gives you
      powerful tools to rate, label, and sort your collection.
    </Para>

    <div className="space-y-3">
      <Step number={1} title="Scan a Folder">
        Drop a folder onto the app or click the scan area. FaceFlow will extract
        embedded previews from RAW files and detect faces using a local AI model.
        No photos leave your machine during this step.
      </Step>
      <Step number={2} title="Review Person Groups">
        The sidebar shows automatically detected persons. Click a person to see
        their photos. Double-click a person name to rename them.
      </Step>
      <Step number={3} title="Rate and Label">
        Select photos and use star ratings (0-5), color labels, and pick/reject
        flags to mark your best shots. Use keyboard shortcuts for speed.
      </Step>
      <Step number={4} title="Sort Between Persons">
        If the AI grouped a photo under the wrong person, select it and use the
        "Move to..." button in the toolbar to reassign it to the correct person
        or create a new person group.
      </Step>
      <Step number={5} title="Compare and Export">
        Select 2+ photos and use Compare view for side-by-side review. When ready,
        export your picks to a destination folder.
      </Step>
    </div>

    <SectionTitle>Event Timeline</SectionTitle>
    <Para>
      Click the calendar icon in the toolbar to switch to event view. Photos are
      automatically grouped by time gaps. Adjust the time gap slider to control
      how events are split.
    </Para>
  </div>
);

const SortingTab = () => (
  <div className="space-y-4">
    <SectionTitle>Cross-Person Selection</SectionTitle>
    <Para>
      Selecting photos in one person group does NOT deselect photos you selected in
      another group. This allows you to compare photos across multiple people and verify
      the AI's face grouping accuracy.
    </Para>

    <SectionTitle>Moving Photos Between Persons</SectionTitle>
    <Para>
      This is the core sorting function of FaceFlow. When the AI assigns a photo to
      the wrong person:
    </Para>
    <ol className="mb-3 list-inside list-decimal space-y-1.5 text-[12px] text-fg-muted">
      <li>Select the misassigned photo(s) by clicking them</li>
      <li>Click "Move to..." in the toolbar</li>
      <li>Choose the correct person from the dropdown, or click "New Person" to create a new group</li>
      <li>The selected photos are moved instantly</li>
    </ol>

    <SectionTitle>Select All</SectionTitle>
    <Para>
      Use the "Select All" button in the photo grid header, or press{" "}
      <Kbd>Cmd</Kbd> + <Kbd>A</Kbd> to select all photos in the current view.
      Press <Kbd>Esc</Kbd> to deselect all.
    </Para>

    <SectionTitle>Renaming Persons</SectionTitle>
    <Para>
      Double-click a person's name in the sidebar to rename them. Press Enter to confirm
      or Escape to cancel. Custom names are preserved throughout your session.
    </Para>

    <SectionTitle>Filters</SectionTitle>
    <Para>
      Use the filter dropdowns in the toolbar to narrow the current view by rating,
      pick status, color label, or image quality (sharpness, open eyes). Filters
      apply to the active person group only.
    </Para>
  </div>
);

const ShortcutsTab = () => (
  <div className="space-y-4">
    <SectionTitle>Ratings</SectionTitle>
    <div className="rounded-lg border border-edge p-3">
      <ShortcutRow keys={<Kbd>0</Kbd>} label="Clear rating" />
      <ShortcutRow keys={<Kbd>1</Kbd>} label="1 star" />
      <ShortcutRow keys={<Kbd>2</Kbd>} label="2 stars" />
      <ShortcutRow keys={<Kbd>3</Kbd>} label="3 stars" />
      <ShortcutRow keys={<Kbd>4</Kbd>} label="4 stars" />
      <ShortcutRow keys={<Kbd>5</Kbd>} label="5 stars" />
    </div>

    <SectionTitle>Pick Status</SectionTitle>
    <div className="rounded-lg border border-edge p-3">
      <ShortcutRow keys={<Kbd>P</Kbd>} label="Pick" />
      <ShortcutRow keys={<Kbd>X</Kbd>} label="Reject" />
      <ShortcutRow keys={<Kbd>U</Kbd>} label="Unflag" />
      <ShortcutRow keys={<Kbd>Backspace</Kbd>} label="Reject" />
    </div>

    <SectionTitle>Color Labels</SectionTitle>
    <div className="rounded-lg border border-edge p-3">
      <ShortcutRow keys={<Kbd>6</Kbd>} label="Red" />
      <ShortcutRow keys={<Kbd>7</Kbd>} label="Yellow" />
      <ShortcutRow keys={<Kbd>8</Kbd>} label="Green" />
      <ShortcutRow keys={<Kbd>9</Kbd>} label="Blue" />
    </div>

    <SectionTitle>Selection</SectionTitle>
    <div className="rounded-lg border border-edge p-3">
      <ShortcutRow keys={<><Kbd>Cmd</Kbd><span className="text-[10px] text-fg-muted">+</span><Kbd>A</Kbd></>} label="Select all in current view" />
      <ShortcutRow keys={<Kbd>Esc</Kbd>} label="Deselect all" />
    </div>

    <SectionTitle>Photo Viewer</SectionTitle>
    <div className="rounded-lg border border-edge p-3">
      <ShortcutRow keys={<span className="text-[10px] text-fg-muted">Double-click</span>} label="Open full-screen viewer" />
      <ShortcutRow keys={<Kbd>Esc</Kbd>} label="Close viewer" />
    </div>
  </div>
);

const PrivacyTab = () => (
  <div className="space-y-4">
    <SectionTitle>Your Data Stays Local</SectionTitle>
    <Para>
      FaceFlow processes all photos locally on your Mac. Face detection and embedding
      generation use ONNX models that run directly on your machine. No photos, previews,
      or face data are sent to external servers.
    </Para>

    <SectionTitle>Face Recognition Models</SectionTitle>
    <Para>
      FaceFlow uses two AI models downloaded during initial setup:
    </Para>
    <ul className="mb-3 list-inside list-disc space-y-1 text-[12px] text-fg-muted">
      <li><span className="font-medium text-fg">det_10g.onnx</span> — Face detection (locates faces in photos)</li>
      <li><span className="font-medium text-fg">w600k_r50.onnx</span> — Face embedding (generates numerical vectors for grouping)</li>
    </ul>
    <Para>
      Models are stored locally in the app's data directory and run entirely offline
      after the initial download.
    </Para>

    <SectionTitle>Activation</SectionTitle>
    <Para>
      FaceFlow requires a license key for activation. The activation process sends only
      a machine identifier and your license key to verify validity. No photo data, file
      paths, or personal information is transmitted during activation.
    </Para>

    <SectionTitle>Network Usage</SectionTitle>
    <Para>
      FaceFlow connects to the internet only for: license activation verification,
      initial model download, and checking for app updates. All other operations are
      fully offline.
    </Para>
  </div>
);

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
