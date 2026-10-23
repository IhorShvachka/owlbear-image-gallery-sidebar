import OBR from "@owlbear-rodeo/sdk";
import { CHANNEL, isGalleryMessage, VIEWER_POPOVER_ID } from "./protocol";

const BASE_URL = "https://ihorshvachka.github.io/owlbear-image-gallery-sidebar/";

OBR.onReady(() => {
  OBR.broadcast.onMessage(CHANNEL, async (event) => {
    if (!isGalleryMessage(event.data)) return;

    try {
      const connectionId = await OBR.player.getConnectionId();
      const message = event.data;

      // Не відкривати вікно в майстра або в учасників, яких не обрали.
      if (!message.recipients.includes(connectionId)) return;

      if (message.type === "HIDE") {
        await OBR.popover.close(VIEWER_POPOVER_ID);
        return;
      }

      const params = new URLSearchParams({
        url: message.image.url,
        title: message.image.title,
        description: message.image.description ?? message.image.category ?? ""
      });

      await OBR.popover.close(VIEWER_POPOVER_ID).catch(() => undefined);
      await OBR.popover.open({
        id: VIEWER_POPOVER_ID,
        url: `${BASE_URL}viewer.html?${params.toString()}`,
        width: 360,
        height: 520,
        anchorReference: "POSITION",
        anchorPosition: { left: 1180, top: 760 },
        anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
        transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
        disableClickAway: true
      });
    } catch (error) {
      console.error("Image Gallery: could not update viewer", error);
    }
  });
});
