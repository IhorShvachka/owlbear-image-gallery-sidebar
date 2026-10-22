import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL, isGalleryMessage, VIEWER_POPOVER_ID } from "./protocol";

const BASE_URL = "/owlbear-image-gallery-sidebar/";

OBR.onReady(() => {
  OBR.broadcast.onMessage(CHANNEL, async (event) => {
    if (!isGalleryMessage(event.data)) return;
    const message = event.data;

    try {
      if (message.type === "HIDE") {
        await OBR.popover.close(VIEWER_POPOVER_ID);
        return;
      }

      const params = new URLSearchParams({
        url: message.image.url,
        title: message.image.title,
        description: message.image.description ?? message.image.category
      });

      await OBR.popover.close(VIEWER_POPOVER_ID).catch(() => undefined);
      await OBR.popover.open({
        id: VIEWER_POPOVER_ID,
        url: `${BASE_URL}viewer.html?${params.toString()}`,
        width: 360,
        height: 520,
        anchorReference: "POSITION",
        anchorPosition: { left: 1180, top: 420 },
        anchorOrigin: { horizontal: "RIGHT", vertical: "CENTER" },
        transformOrigin: { horizontal: "RIGHT", vertical: "CENTER" },
        disableClickAway: true
      });
    } catch (error) {
      console.error("Image Gallery: could not update viewer", error);
    }
  });
});
