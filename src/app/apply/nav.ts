import type { NavItem } from "@/components/Shell";

export const APP_NAV: NavItem[] = [
  { href: "/apply", ar: "طلباتي وتصاريحي", en: "My requests", short: ["طلباتي", "Requests"], icon: "home" },
  { href: "/apply/new", ar: "طلب جديد", en: "New request", short: ["طلب جديد", "New"], icon: "plus" },
  { href: "/apply/profile", ar: "ملف الجهة", en: "Organization profile", short: ["ملف الجهة", "Profile"], icon: "doc" },
];
