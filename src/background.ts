import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL, isGalleryMessage, VIEWER_POPOVER_ID } from "./protocol";

const BASE_URL = "https://ihorshvachka.github.io/owlbear-image-gallery-sidebar/";
const POSITION_KEY = "image-gallery-viewer-position";
const SIZE_KEY = "image-gallery-viewer-size";
const URL_KEY = "image-gallery-viewer-url";
const DEFAULT_POSITION = { left: 1180, top: 760 };
const DEFAULT_SIZE = { width: 360, height: 520 };

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

async function openViewer(url: string, position = readStored(POSITION_KEY, DEFAULT_POSITION), size = readStored(SIZE_KEY, DEFAULT_SIZE)): Promise<void> {
  await OBR.popover.close(VIEWER_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({
    id: VIEWER_POPOVER_ID,
    url,
    width: size.width,
    height: size.height,
    anchorReference: "POSITION",
    anchorPosition: position,
    anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    disableClickAway: true
  });
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(CHANNEL, async (event) => {
    if (!isGalleryMessage(event.data)) return;

    try {
      const connectionId = await OBR.player.getConnectionId();
      const message = event.data;
      if (!message.recipients.includes(connectionId)) return;

      if (message.type === "HIDE") {
        await OBR.popover.close(VIEWER_POPOVER_ID);
        return;
      }

      if (message.type === "MOVE_VIEWER") {
        const position = { left: Math.round(message.left), top: Math.round(message.top) };
        localStorage.setItem(POSITION_KEY, JSON.stringify(position));
        const currentUrl = localStorage.getItem(URL_KEY);
        if (currentUrl) await openViewer(currentUrl, position);
        return;
      }

      if (message.type === "SIZE_VIEWER") {
        const size = {
          width: Math.max(220, Math.min(900, Math.round(message.width))),
          height: Math.max(160, Math.min(900, Math.round(message.height)))
        };
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
        const currentUrl = localStorage.getItem(URL_KEY);
        if (currentUrl) await openViewer(currentUrl, undefined, size);
        return;
      }

      const params = new URLSearchParams({
        url: message.image.url,
        title: message.image.title,
        description: message.image.description ?? message.image.category ?? ""
      });
      const viewerUrl = `${BASE_URL}viewer.html?${params.toString()}`;
      localStorage.setItem(URL_KEY, viewerUrl);
      await openViewer(viewerUrl);
    } catch (error) {
      console.error("Image Gallery: could not update viewer", error);
    }
  });
});
