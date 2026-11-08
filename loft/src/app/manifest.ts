import type { MetadataRoute } from "next";

// Install metadata for "Add to home screen". Icons live in public/brand (see public/brand/README.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stash",
    short_name: "Stash",
    description: "Free. Unlimited. Private. Storage.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#111111",
    icons: [
      { src: "/brand/app-icon/png/stash-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon/png/stash-app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/app-icon/png/stash-app-icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/app-icon/png/stash-app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
