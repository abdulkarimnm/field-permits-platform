import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n";
import AppRuntime from "@/components/AppRuntime";
import SandboxDock from "@/components/SandboxDock";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import { getSetting } from "@/lib/settings";
import { cookies } from "next/headers";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#221714" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  const demo = await getSetting("demo_mode");
  const c = (await cookies()).get("theme")?.value;
  const pref = c === "dark" || c === "light" ? c : "system";
  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${plex.variable}`}
      data-theme-pref={pref}
      data-theme={pref === "system" ? undefined : pref}
      style={pref === "system" ? undefined : { colorScheme: pref }}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint: resolves "system" from the device and follows it live, so there is never a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="antialiased min-h-dvh">
        {children}
        <AppRuntime lang={lang} />
        <ClientErrorReporter />
        {demo && <SandboxDock lang={lang} />}
      </body>
    </html>
  );
}

// Resolves "system" before first paint, follows the device live, and keeps the browser bar colour
// (theme-color meta) in step with the chosen theme even when it differs from the device setting.
const THEME_BOOT = `(function(){try{var h=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function bar(){var c=h.dataset.theme==="dark"?"#221714":"#fffaf5";document.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.setAttribute("content",c)});}function s(){if(h.dataset.themePref==="system"){var d=m.matches;h.dataset.theme=d?"dark":"light";h.style.colorScheme=d?"dark":"light";}bar();}s();m.addEventListener("change",s);document.addEventListener("DOMContentLoaded",bar);}catch(e){}})();`;
