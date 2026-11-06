import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/start",
    name: "تصاريح ميدان سيد الشهداء",
    short_name: "تصاريح الميدان",
    description: "إصدار تصاريح دخول المركبات والأفراد والمعدات والتحقق الميداني منها",
    lang: "ar",
    dir: "rtl",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#5a2a20",
    theme_color: "#fffaf5",
    categories: ["government", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "طلب تصريح جديد", short_name: "طلب جديد", url: "/apply/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "بوابة التحقق الميداني", short_name: "التحقق", url: "/verify", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "غرفة العمليات", short_name: "العمليات", url: "/staff/ops", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
