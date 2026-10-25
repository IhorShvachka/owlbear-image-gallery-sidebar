import OBR from "@owlbear-rodeo/sdk";
import { VIEWER_POPOVER_ID } from "./protocol";
import "./viewer.css";

const params = new URLSearchParams(window.location.search);
const image = document.querySelector<HTMLImageElement>("#viewer-image")!;
const title = document.querySelector<HTMLElement>("#viewer-title")!;
const caption = document.querySelector<HTMLElement>("#viewer-caption")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close-viewer")!;
const smallerButton = document.querySelector<HTMLButtonElement>("#smaller-viewer")!;
const largerButton = document.querySelector<HTMLButtonElement>("#larger-viewer")!;
const imageError = document.querySelector<HTMLDivElement>("#image-error")!;

const imageUrl = params.get("url") ?? "";
const imageTitle = params.get("title") ?? "Зображення";
const imageDescription = params.get("description") ?? "";

const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const MIN_HEIGHT = 360;
const MAX_HEIGHT = 900;
const WIDTH_STEP = 80;
const HEIGHT_STEP = 100;

title.textContent = imageTitle;
caption.textContent = imageDescription;
image.src = imageUrl;
image.alt = imageTitle;

image.addEventListener("error", () => {
  image.hidden = true;
  imageError.hidden = false;
});

async function changeViewerSize(direction: -1 | 1) {
  try {
    const [currentWidth, currentHeight] = await Promise.all([
      OBR.popover.getWidth(VIEWER_POPOVER_ID),
      OBR.popover.getHeight(VIEWER_POPOVER_ID)
    ]);

    if (currentWidth === undefined || currentHeight === undefined) return;

    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, currentWidth + WIDTH_STEP * direction));
    const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, currentHeight + HEIGHT_STEP * direction));

    await Promise.all([
      OBR.popover.setWidth(VIEWER_POPOVER_ID, width),
      OBR.popover.setHeight(VIEWER_POPOVER_ID, height)
    ]);
  } catch (error) {
    console.error("Image Gallery: could not resize viewer", error);
  }
}

smallerButton.addEventListener("click", () => void changeViewerSize(-1));
largerButton.addEventListener("click", () => void changeViewerSize(1));

closeButton.addEventListener("click", async () => {
  // Closes this participant's viewer only. The master's Hide button closes it for everyone.
  try {
    await OBR.popover.close(VIEWER_POPOVER_ID);
  } catch (error) {
    console.error("Image Gallery: could not close viewer", error);
  }
});
