import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PhotoMeta, ColorLabel, PickStatus } from "../types";

export function usePhotoMeta(filePaths: string[]) {
  const [metaMap, setMetaMap] = useState<Map<string, PhotoMeta>>(new Map());

  const loadMeta = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    try {
      const metas = await invoke<PhotoMeta[]>("get_photo_metadata", { filePaths: paths });
      setMetaMap((prev) => {
        const next = new Map(prev);
        for (const m of metas) {
          next.set(m.file_path, m);
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to load photo metadata:", e);
    }
  }, []);

  useEffect(() => {
    loadMeta(filePaths);
  }, [filePaths, loadMeta]);

  const setRating = useCallback(async (paths: string[], rating: number) => {
    try {
      await invoke("set_photo_rating", { filePaths: paths, rating });
      setMetaMap((prev) => {
        const next = new Map(prev);
        for (const fp of paths) {
          const existing = next.get(fp);
          next.set(fp, {
            file_path: fp,
            rating,
            color_label: existing?.color_label ?? "none",
            pick_status: existing?.pick_status ?? "none",
            quality_score: existing?.quality_score ?? null,
            blur_score: existing?.blur_score ?? null,
            closed_eyes: existing?.closed_eyes ?? false,
          });
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to set rating:", e);
    }
  }, []);

  const setColorLabel = useCallback(async (paths: string[], label: ColorLabel) => {
    try {
      await invoke("set_photo_color_label", { filePaths: paths, label });
      setMetaMap((prev) => {
        const next = new Map(prev);
        for (const fp of paths) {
          const existing = next.get(fp);
          next.set(fp, {
            file_path: fp,
            rating: existing?.rating ?? 0,
            color_label: label,
            pick_status: existing?.pick_status ?? "none",
            quality_score: existing?.quality_score ?? null,
            blur_score: existing?.blur_score ?? null,
            closed_eyes: existing?.closed_eyes ?? false,
          });
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to set color label:", e);
    }
  }, []);

  const setPickStatus = useCallback(async (paths: string[], status: PickStatus) => {
    try {
      await invoke("set_photo_pick_status", { filePaths: paths, status });
      setMetaMap((prev) => {
        const next = new Map(prev);
        for (const fp of paths) {
          const existing = next.get(fp);
          next.set(fp, {
            file_path: fp,
            rating: existing?.rating ?? 0,
            color_label: existing?.color_label ?? "none",
            pick_status: status,
            quality_score: existing?.quality_score ?? null,
            blur_score: existing?.blur_score ?? null,
            closed_eyes: existing?.closed_eyes ?? false,
          });
        }
        return next;
      });
    } catch (e) {
      console.error("Failed to set pick status:", e);
    }
  }, []);

  return { metaMap, setRating, setColorLabel, setPickStatus, loadMeta };
}
