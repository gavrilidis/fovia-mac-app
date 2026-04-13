import React, { useCallback, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { FaceFlowLogo } from "./FaceFlowLogo";

interface ActivationViewProps {
  onActivated: () => void;
}

const GROUP_COUNT = 5;
const GROUP_LENGTH = 5;

export const ActivationView: React.FC<ActivationViewProps> = ({ onActivated }) => {
  const [groups, setGroups] = useState<string[]>(Array(GROUP_COUNT).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleWindowDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    getCurrentWindow().startDragging();
  }, []);

  const handleGroupChange = useCallback((index: number, value: string) => {
    // Allow only alphanumeric, uppercase
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, GROUP_LENGTH);
    setGroups((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
    setError(null);

    // Auto-advance to next input when group is full
    if (cleaned.length === GROUP_LENGTH && index < GROUP_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      // Backspace on empty field → move to previous
      if (e.key === "Backspace" && groups[index] === "" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [groups],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim().toUpperCase();
    // Accept full key paste like "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
    const parts = pasted.split("-");
    if (parts.length === GROUP_COUNT && parts.every((p) => p.length === GROUP_LENGTH)) {
      setGroups(parts);
      setError(null);
      inputRefs.current[GROUP_COUNT - 1]?.focus();
      return;
    }
    // Otherwise paste into current field normally
    const cleaned = pasted.replace(/[^A-Z0-9]/g, "").slice(0, GROUP_LENGTH);
    const target = e.target as HTMLInputElement;
    const index = inputRefs.current.indexOf(target);
    if (index >= 0) {
      setGroups((prev) => {
        const next = [...prev];
        next[index] = cleaned;
        return next;
      });
    }
  }, []);

  const serialKey = groups.join("-");
  const isComplete = groups.every((g) => g.length === GROUP_LENGTH);

  const handleActivate = useCallback(async () => {
    if (!isComplete) return;
    setLoading(true);
    setError(null);
    try {
      const success = await invoke<boolean>("activate_app", { serialKey });
      if (success) {
        onActivated();
      } else {
        setError("Invalid serial number. Please check and try again.");
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Activation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isComplete, serialKey, onActivated]);

  // Submit on Enter when complete
  const handleFormKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isComplete) {
        handleActivate();
      }
    },
    [isComplete, handleActivate],
  );

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-surface-alt pt-[38px]"
      onMouseDown={handleWindowDrag}
      onKeyDown={handleFormKeyDown}
    >
      <div className="w-full max-w-[420px] px-8">
        {/* Logo + Title */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated/80">
            <FaceFlowLogo size={38} />
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight text-fg">
            Activate FaceFlow
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            Enter your serial number to start using the app
          </p>
        </div>

        {/* Serial Key Inputs */}
        <div className="flex items-center justify-center gap-2">
          {groups.map((group, i) => (
            <React.Fragment key={i}>
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                value={group}
                onChange={(e) => handleGroupChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                maxLength={GROUP_LENGTH}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                className={`h-11 w-[68px] rounded-lg border bg-surface px-0 text-center font-mono text-[14px] font-medium tracking-[0.12em] text-fg outline-none transition-colors duration-150 ${
                  error
                    ? "border-negative/50 focus:border-negative"
                    : "border-edge focus:border-accent"
                }`}
              />
              {i < GROUP_COUNT - 1 && (
                <span className="text-[14px] text-fg-muted/40">-</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="mt-4 text-center text-[12px] text-negative">{error}</p>
        )}

        {/* Activate Button */}
        <button
          onClick={handleActivate}
          disabled={!isComplete || loading}
          className="mt-8 flex h-10 w-full items-center justify-center rounded-xl bg-accent text-[13px] font-medium text-white transition-all duration-150 hover:bg-accent-hover active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            "Activate"
          )}
        </button>

        {/* Footer hint */}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-fg-muted/50">
          Contact the developer if you need a serial number
        </p>
      </div>
    </div>
  );
};
