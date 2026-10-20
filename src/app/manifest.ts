import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dhakerni",
    short_name: "Dhakerni",
    description: "Voice-first tasks and reminders.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The terracotta of the intro: the phone's own launch screen uses this colour, so the two flow into each other.
    background_color: "#ab4927",
    theme_color: "#faf4ec",
    lang: "en",
    // Share a message from another app (WhatsApp, SMS) into the text field, to be checked and sent.
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
