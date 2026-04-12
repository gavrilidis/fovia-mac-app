import { useEffect, useCallback } from "react";
import type { ColorLabel, PickStatus } from "../types";

interface KeyboardShortcutHandlers {
  onRating: (rating: number) => void;
  onPickStatus: (status: PickStatus) => void;
  onColorLabel: (label: ColorLabel) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  enabled: boolean;
}

export function useKeyboardShortcuts({
  onRating,
  onPickStatus,
  onColorLabel,
  onSelectAll,
  onDeselectAll,
  onDelete,
  enabled,
}: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      // Star ratings: 0-5
      if (e.key >= "0" && e.key <= "5" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onRating(parseInt(e.key));
        return;
      }

      // Pick/Reject: P = pick, X = reject, U = unflag
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case "p":
            e.preventDefault();
            onPickStatus("pick");
            return;
          case "x":
            e.preventDefault();
            onPickStatus("reject");
            return;
          case "u":
            e.preventDefault();
            onPickStatus("none");
            return;
        }
      }

      // Color labels: 6=red, 7=yellow, 8=green, 9=blue
      if (e.key >= "6" && e.key <= "9" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const labels: ColorLabel[] = ["red", "yellow", "green", "blue"];
        onColorLabel(labels[parseInt(e.key) - 6]);
        return;
      }

      // Select all: Cmd+A
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        onSelectAll();
        return;
      }

      // Deselect: Escape
      if (e.key === "Escape") {
        e.preventDefault();
        onDeselectAll();
        return;
      }

      // Delete/Reject: Backspace
      if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onDelete();
        return;
      }
    },
    [enabled, onRating, onPickStatus, onColorLabel, onSelectAll, onDeselectAll, onDelete],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
