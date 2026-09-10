import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RPM",
    short_name: "RPM",
    description: "Rodier Property Maintenance",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/R.jpg",
        sizes: "any",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  }
}
