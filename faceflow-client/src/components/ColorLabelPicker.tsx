import React from "react";
import type { ColorLabel } from "../types";
import { COLOR_LABEL_MAP } from "../types";

interface ColorLabelPickerProps {
  current: ColorLabel;
  onChange: (label: ColorLabel) => void;
}

const LABELS: ColorLabel[] = ["none", "red", "yellow", "green", "blue", "purple"];

export const ColorLabelPicker: React.FC<ColorLabelPickerProps> = ({ current, onChange }) => {
  return (
    <div className="flex items-center gap-1">
      {LABELS.map((label) => (
        <button
          key={label}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(label === current ? "none" : label);
          }}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 ${
            label === current
              ? "ring-2 ring-white/50 ring-offset-1 ring-offset-surface-alt"
              : "hover:ring-1 hover:ring-white/20"
          }`}
          title={label === "none" ? "No label" : label.charAt(0).toUpperCase() + label.slice(1)}
        >
          {label === "none" ? (
            <div className="h-3.5 w-3.5 rounded-full border border-fg-muted/30" />
          ) : (
            <div
              className="h-3.5 w-3.5 rounded-full shadow-sm"
              style={{ backgroundColor: COLOR_LABEL_MAP[label] }}
            />
          )}
        </button>
      ))}
    </div>
  );
};
