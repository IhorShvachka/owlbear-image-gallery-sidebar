import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL, VIEWER_POPOVER_ID } from "./protocol";
import "./viewer.css";

const params = new URLSearchParams(window.location.search);
const image = document.querySelector<HTMLImageElement>("#viewer-image")!;
const title = document.querySelector<HTMLElement>("#viewer-title")!;
const caption = document.querySelector<HTMLElement>("#viewer-caption")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close-viewer")!;
const smallerButton = document.querySelector<HTMLButtonElement>("#smaller-viewer")!;
const largerButton = document.querySelector<HTMLButtonElement>("#larger-viewer")!;
const imageError = document.querySelector<HTMLDivElement>("#image-error")!;
const header = document.querySelector<HTMLElement>(".viewer-header")!;

const imageUrl = params.get("url") ?? "";
const imageTitle = params.get("title") ?? "Зображення";
const imageDescription = params.get("description") ?? "";
const SIZE_KEY = "image-gallery-viewer-size";
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const MIN_HEIGHT = 360;
const MAX_HEIGHT = 900;
const WIDTH_STEP = 80;
const HEIGHT_STEP = 100;
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

function readSize(): { width: number; height: number } {
  try {
    const value = localStorage.getItem(SIZE_KEY);
    if (value) {
      const size = JSON.parse(value);
      if (typeof size.width === "number" && typeof size.height === "number") return size;
    }
  } catch { /* Use a size derived from the image below. */ }
  return { width: 360, height: 520 };
}

title.textContent = imageTitle;
caption.textContent = imageDescription;
image.src = imageUrl;
image.alt = imageTitle;

image.addEventListener("load", () => {
  const ratio = image.naturalWidth / image.naturalHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const maxImageWidth = 820;
  const maxImageHeight = 620;
  const scale = Math.min(maxImageWidth / image.naturalWidth, maxImageHeight / image.naturalHeight, 1);
  const imageWidth = Math.max(180, Math.round(image.naturalWidth * scale));
  const imageHeight = Math.max(120, Math.round(image.naturalHeight * scale));
  const target = { width: imageWidth + 24, height: imageHeight + 118 };
  const saved = readSize();
  if (Math.abs(saved.width - 360) > 1 || Math.abs(saved.height - 520) > 1) return;
  if (Math.abs(saved.width - target.width) < 8 && Math.abs(saved.height - target.height) < 8) return;
  void sendViewerMessage({ type: "SIZE_VIEWER", ...target });
});

image.addEventListener("error", () => {
  image.hidden = true;
  imageError.hidden = false;
});

async function changeViewerSize(direction: -1 | 1): Promise<void> {
  const current = readSize();
  const size = {
    width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, current.width + WIDTH_STEP * direction)),
    height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, current.height + HEIGHT_STEP * direction))
  };
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch { /* The size message still works without local persistence. */ }
  await sendViewerMessage({ type: "SIZE_VIEWER", ...size });
  // Owlbear's popover dimensions can be changed directly by its owner.
  try {
    const [width, height] = await Promise.all([
      OBR.popover.getWidth(VIEWER_POPOVER_ID),
      OBR.popover.getHeight(VIEWER_POPOVER_ID)
    ]);
    if (width !== undefined && height !== undefined) {
      await Promise.all([
        OBR.popover.setWidth(VIEWER_POPOVER_ID, size.width),
        OBR.popover.setHeight(VIEWER_POPOVER_ID, size.height)
      ]);
    }
  } catch (error) {
    console.error("Image Gallery: could not resize viewer", error);
  }
}

smallerButton.addEventListener("click", () => void changeViewerSize(-1));
largerButton.addEventListener("click", () => void changeViewerSize(1));

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
