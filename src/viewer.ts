import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL, VIEWER_POPOVER_ID } from "./protocol";
import "./viewer.css";

const params = new URLSearchParams(window.location.search);
const image = document.querySelector<HTMLImageElement>("#viewer-image")!;
const title = document.querySelector<HTMLElement>("#viewer-title")!;
const caption = document.querySelector<HTMLElement>("#viewer-caption")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close-viewer")!;
const imageError = document.querySelector<HTMLDivElement>("#image-error")!;
const header = document.querySelector<HTMLElement>(".viewer-header")!;

const imageUrl = params.get("url") ?? "";
const imageTitle = params.get("title") ?? "Зображення";
const imageDescription = params.get("description") ?? "";
let dragging = false;
let startX = 0;
let startY = 0;
let startLeft = 1180;
let startTop = 760;
let moved = false;

function readPosition(): { left: number; top: number } {
  try {
    const value = localStorage.getItem("image-gallery-viewer-position");
    if (value) {
      const position = JSON.parse(value);
      if (typeof position.left === "number" && typeof position.top === "number") return position;
    }
  } catch { /* Use the default bottom-right anchor. */ }
  return { left: 1180, top: 760 };
}

async function sendViewerMessage(data: Record<string, unknown>): Promise<void> {
  try {
    const connectionId = await OBR.player.getConnectionId();
    await OBR.broadcast.sendMessage(CHANNEL, { ...data, recipients: [connectionId] }, { destination: "ALL" });
  } catch (error) {
    console.error("Image Gallery: could not update viewer position or size", error);
  }
}

title.textContent = imageTitle;
caption.textContent = imageDescription;
image.src = imageUrl;
image.alt = imageTitle;

image.addEventListener("load", () => {
  const ratio = image.naturalWidth / image.naturalHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  // Fit the full image to a comfortable viewing area while preserving its aspect ratio.
  const maxImageWidth = 820;
  const maxImageHeight = 620;
  const scale = Math.min(maxImageWidth / image.naturalWidth, maxImageHeight / image.naturalHeight, 1);
  const imageWidth = Math.max(180, Math.round(image.naturalWidth * scale));
  const imageHeight = Math.max(120, Math.round(image.naturalHeight * scale));
  const target = { width: imageWidth + 24, height: imageHeight + 118 };
  try {
    const saved = localStorage.getItem("image-gallery-viewer-size");
    const current = saved ? JSON.parse(saved) : null;
    if (current && Math.abs(current.width - target.width) < 8 && Math.abs(current.height - target.height) < 8) return;
  } catch { /* Send the size if no valid saved size exists. */ }
  void sendViewerMessage({ type: "SIZE_VIEWER", ...target });
});

image.addEventListener("error", () => {
  image.hidden = true;
  imageError.hidden = false;
});

header.title = "Перетягни за цю панель, щоб перемістити вікно";
header.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("button")) return;
  dragging = true;
  moved = false;
  startX = event.clientX;
  startY = event.clientY;
  const position = readPosition();
  startLeft = position.left;
  startTop = position.top;
  header.setPointerCapture(event.pointerId);
});
header.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 3) moved = true;
});
header.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  if (!moved) return;
  const position = {
    left: Math.max(200, Math.min(2400, Math.round(startLeft + event.clientX - startX))),
    top: Math.max(100, Math.min(1600, Math.round(startTop + event.clientY - startY)))
  };
  try { localStorage.setItem("image-gallery-viewer-position", JSON.stringify(position)); } catch { /* optional persistence */ }
  void sendViewerMessage({ type: "MOVE_VIEWER", ...position });
});
header.addEventListener("pointercancel", () => { dragging = false; });

closeButton.addEventListener("click", async () => {
  try {
    await OBR.popover.close(VIEWER_POPOVER_ID);
  } catch (error) {
    console.error("Image Gallery: could not close viewer", error);
  }
});
