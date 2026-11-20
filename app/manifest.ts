import type { MetadataRoute } from "next";

/** Lets the owner "Add to Home screen" and open the app full-screen on a phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hardware POS",
    short_name: "Hardware POS",
    description: "Point of sale for hardware stores",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#e4572e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
