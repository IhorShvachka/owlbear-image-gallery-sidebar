import { defineConfig } from "vite";

export default defineConfig({
  base: "/owlbear-image-gallery-sidebar/",
  server: {
    cors: {
      origin: [
        "https://www.owlbear.rodeo",
        "https://owlbear.rodeo"
      ]
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        background: "background.html",
        viewer: "viewer.html"
      }
    }
  }
});
