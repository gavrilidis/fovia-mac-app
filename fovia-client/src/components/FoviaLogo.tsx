import React from "react";

interface FoviaLogoProps {
  className?: string;
  size?: number;
}

/**
 * Professional FOVIA logo with a precision scope/crosshair integrated into the O.
 * Designed to look clean and native on macOS dark backgrounds.
 */
export const FoviaLogo: React.FC<FoviaLogoProps> = ({ className, size = 200 }) => {
  // Aspect ratio: width 5 : height ~1.1
  const height = Math.round(size * 0.28);
  return (
    <svg
      className={className}
      width={size}
      height={height}
      viewBox="0 0 500 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── F ── */}
      <path
        d="M30 26h52v8.5H40.5v32H74v8.5H40.5V120H30V26z"
        fill="currentColor"
      />

      {/* ── O with integrated scope/crosshair ── */}
      <g>
        {/* Outer O ring */}
        <path
          d="M137 26c-26.5 0-48 21.5-48 47s21.5 47 48 47 48-21.5 48-47-21.5-47-48-47zm0 84.5c-20.7 0-37.5-16.8-37.5-37.5S116.3 35.5 137 35.5 174.5 52.3 174.5 73 157.7 110.5 137 110.5z"
          fill="currentColor"
        />
        {/* Inner scope circle */}
        <circle cx="137" cy="73" r="14" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.7" />
        {/* Center dot */}
        <circle cx="137" cy="73" r="2.5" fill="currentColor" opacity="0.8" />
        {/* Vertical crosshair */}
        <line x1="137" y1="30" x2="137" y2="55" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        <line x1="137" y1="91" x2="137" y2="116" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        {/* Horizontal crosshair */}
        <line x1="93" y1="73" x2="119" y2="73" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
        <line x1="155" y1="73" x2="181" y2="73" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      </g>

      {/* ── V ── */}
      <path
        d="M207 26l38 94h-1.2L206 26h1zm36.8 0L282 120h-10.5L233 26h10.8z"
        fill="currentColor"
      />

      {/* ── I ── */}
      <path
        d="M300 26h10.5V120H300V26z"
        fill="currentColor"
      />

      {/* ── A ── */}
      <path
        d="M363 26l42 94h-11.2L381.5 91h-39L330 120h-11l44-94zm-17.5 57h32.8L362 44.5 345.5 83z"
        fill="currentColor"
      />
    </svg>
  );
};
