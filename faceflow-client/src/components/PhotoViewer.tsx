import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FaceEntry } from "../types";

interface PhotoViewerProps {
  photos: FaceEntry[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const PREFETCH_RANGE = 2;

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photos,
  currentIndex,
  onClose,
  onNavigate,
}) => {
  const touchStartX = useRef(0);
  const touchDelta = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullImageBase64, setFullImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const photo = photos[currentIndex];

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) onNavigate(currentIndex + 1);
  }, [currentIndex, photos.length, onNavigate]);

  // Load current image (from cache or fetch) + prefetch neighbors
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const cache = cacheRef.current;
    const fp = photo.file_path;

    // Check cache first
    const cached = cache.get(fp);
    if (cached) {
      setFullImageBase64(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setFullImageBase64(null);
      invoke<string>("read_photo_base64", { filePath: fp })
        .then((data) => {
          if (!cancelled) {
            cache.set(fp, data);
            setFullImageBase64(data);
          }
        })
        .catch((err) => {
          console.error("Failed to load full photo:", err);
          if (!cancelled) setFullImageBase64(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    // Prefetch ±PREFETCH_RANGE neighbors in the background
    const toPreload: string[] = [];
    for (let offset = -PREFETCH_RANGE; offset <= PREFETCH_RANGE; offset++) {
      if (offset === 0) continue;
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < photos.length) {
        const neighborFp = photos[idx].file_path;
        if (!cache.has(neighborFp)) {
          toPreload.push(neighborFp);
        }
      }
    }

    // Fire prefetch requests (non-blocking, errors ignored)
    for (const pfp of toPreload) {
      invoke<string>("read_photo_base64", { filePath: pfp })
        .then((data) => {
          cache.set(pfp, data);
        })
        .catch(() => {});
    }

    // Evict cache entries far from current index to limit memory
    const keepPaths = new Set<string>();
    for (let i = Math.max(0, currentIndex - PREFETCH_RANGE - 1); i <= Math.min(photos.length - 1, currentIndex + PREFETCH_RANGE + 1); i++) {
      keepPaths.add(photos[i].file_path);
    }
    for (const key of cache.keys()) {
      if (!keepPaths.has(key)) {
        cache.delete(key);
      }
    }

    return () => { cancelled = true; };
  }, [photo?.file_path, currentIndex, photos]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext]);

  // Click navigation: left 50% = prev, right 50% = next
  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 2) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goPrev, goNext],
  );

  // Swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchDelta.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const SWIPE_THRESHOLD = 50;
    if (touchDelta.current > SWIPE_THRESHOLD) {
      goPrev();
    } else if (touchDelta.current < -SWIPE_THRESHOLD) {
      goNext();
    }
    touchDelta.current = 0;
  }, [goPrev, goNext]);

  // Prevent body scroll while viewer is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!photo) return null;

  const filename = photo.file_path.split("/").pop() || "";
  const displaySrc = fullImageBase64
    ? `data:image/jpeg;base64,${fullImageBase64}`
    : photo.preview_base64
      ? `data:image/jpeg;base64,${photo.preview_base64}`
      : null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex select-none flex-col bg-black/95 backdrop-blur-xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between px-6 py-4">
        <span className="text-[13px] tabular-nums text-white/50">
          {currentIndex + 1} / {photos.length}
        </span>
        <span className="max-w-[50%] truncate text-[13px] text-white/70">
          {filename}
        </span>
        <button
          onClick={onClose}
          title="Close viewer"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image area — click left/right to navigate */}
      <div
        className="relative flex flex-1 cursor-pointer items-center justify-center overflow-hidden"
        onClick={handleImageClick}
      >
        {/* Left arrow indicator */}
        {currentIndex > 0 && (
          <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/5 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 [div:hover>&]:opacity-60">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            <span className="text-[13px] text-white/40">Loading full image...</span>
          </div>
        ) : displaySrc ? (
          <img
            src={displaySrc}
            alt={filename}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <span className="text-[13px]">No preview available</span>
          </div>
        )}

        {/* Right arrow indicator */}
        {currentIndex < photos.length - 1 && (
          <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/5 p-2 opacity-0 transition-opacity duration-200 [div:hover>&]:opacity-60">
            <svg className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="flex flex-shrink-0 items-center justify-center px-6 py-3">
        <span className="text-[11px] text-white/30">
          Score: {(photo.detection_score * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
};
