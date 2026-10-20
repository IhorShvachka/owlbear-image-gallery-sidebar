import type { GalleryImage } from "./catalog";

export const CHANNEL = "com.example.imagegallery.messages";
export const VIEWER_POPOVER_ID = "com.example.imagegallery.viewer";

export type GalleryMessage =
  | { type: "SHOW"; image: GalleryImage }
  | { type: "HIDE" };

export function isGalleryMessage(value: unknown): value is GalleryMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "HIDE") return true;
  if (candidate.type !== "SHOW" || !candidate.image || typeof candidate.image !== "object") return false;

  const image = candidate.image as Record<string, unknown>;
  return typeof image.id === "string"
    && typeof image.title === "string"
    && typeof image.category === "string"
    && typeof image.url === "string"
    && (image.description === undefined || typeof image.description === "string");
}
