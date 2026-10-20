import OBR from "@owlbear-rodeo/sdk";
import { VIEWER_POPOVER_ID } from "./protocol";
import "./viewer.css";

const params = new URLSearchParams(window.location.search);
const image = document.querySelector<HTMLImageElement>("#viewer-image")!;
const title = document.querySelector<HTMLElement>("#viewer-title")!;
const caption = document.querySelector<HTMLElement>("#viewer-caption")!;
const closeButton = document.querySelector<HTMLButtonElement>("#close-viewer")!;
const imageError = document.querySelector<HTMLDivElement>("#image-error")!;

const imageUrl = params.get("url") ?? "";
const imageTitle = params.get("title") ?? "Зображення";
const imageDescription = params.get("description") ?? "";

title.textContent = imageTitle;
caption.textContent = imageDescription;
image.src = imageUrl;
image.alt = imageTitle;

image.addEventListener("error", () => {
  image.hidden = true;
  imageError.hidden = false;
});

closeButton.addEventListener("click", async () => {
  // Closes this participant's viewer only. The master's Hide button closes it for everyone.
  try {
    await OBR.popover.close(VIEWER_POPOVER_ID);
  } catch (error) {
    console.error("Image Gallery: could not close viewer", error);
  }
});
