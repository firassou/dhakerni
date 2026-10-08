import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dhakerni",
    short_name: "dhakerni",
    description: "Voice-first tasks and reminders.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The blue of the intro: the phone's own launch screen uses this colour, so the two flow into each other.
    background_color: "#2152d1",
    theme_color: "#f2f5f4",
    lang: "en",
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
