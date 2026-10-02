import type { MetadataRoute } from "next";

// PWA manifest — makes the app installable to the home screen with the Magnum icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מגנום · סיטונאות",
    short_name: "מגנום",
    description: "פורטל הזמנות סיטונאות",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1f2a78",
    lang: "he",
    dir: "rtl",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
