import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n";
import AppRuntime from "@/components/AppRuntime";
import SandboxDock from "@/components/SandboxDock";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import { getSetting } from "@/lib/settings";

const plex = IBM_Plex_Sans_Arabic({ variable: "--font-plex", subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تصاريح دخول الميدان | ميدان سيد الشهداء",
  description: "منصة إصدار تصاريح دخول المركبات والأفراد والمعدات والتحقق الميداني منها",
  applicationName: "تصاريح الميدان",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }, { url: "/brand/mark.svg", type: "image/svg+xml" }], apple: "/icons/apple-180.png" },
  appleWebApp: { capable: true, title: "تصاريح الميدان", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffaf5",
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  const demo = await getSetting("demo_mode");
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={`${plex.variable}`}>
      <body className="antialiased min-h-dvh">
        {children}
        <AppRuntime lang={lang} />
        <ClientErrorReporter />
        {demo && <SandboxDock lang={lang} />}
      </body>
    </html>
  );
}
