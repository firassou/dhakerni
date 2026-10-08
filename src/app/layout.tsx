import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { NO_FLASH_SCRIPT } from "@/lib/i18n/locales";
import { ToastProvider } from "@/components/Toast";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["arabic", "latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dhakerni",
  description: "Voice-first tasks and reminders.",
  applicationName: "Dhakerni",
  appleWebApp: { capable: true, title: "Dhakerni", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={readex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
