import type { GalleryImage } from "./catalog";

export const CHANNEL = "com.example.imagegallery.messages";
export const VIEWER_POPOVER_ID = "com.example.imagegallery.viewer";

export type GalleryMessage =
  | { type: "SHOW"; image: GalleryImage; recipients: string[] }
  | { type: "HIDE"; recipients: string[] }
  | { type: "MOVE_VIEWER"; recipients: string[]; left: number; top: number }
  | { type: "SIZE_VIEWER"; recipients: string[]; width: number; height: number };

export function isGalleryMessage(value: unknown): value is GalleryMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.recipients) ||
      !candidate.recipients.every((id) => typeof id === "string")) return false;

  if (candidate.type === "HIDE") return true;
  if (candidate.type === "MOVE_VIEWER" || candidate.type === "SIZE_VIEWER") {
    return typeof candidate.left === "number" && typeof candidate.top === "number"
      ? candidate.type === "MOVE_VIEWER"
      : typeof candidate.width === "number" && typeof candidate.height === "number" && candidate.type === "SIZE_VIEWER";
  }
  if (candidate.type !== "SHOW" || !candidate.image || typeof candidate.image !== "object") return false;

  const image = candidate.image as Record<string, unknown>;
  return typeof image.id === "string"
    && typeof image.title === "string"
    && typeof image.url === "string"
    && (image.description === undefined || typeof image.description === "string");
}
