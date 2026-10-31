import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "MOZES LIFE", template: "%s · MOZES LIFE" },
  description: "MOZES LIFE — לומדים להציל חיים",
  robots: { index: false, follow: false }, // pre-launch
};

export const viewport: Viewport = { themeColor: "#182f3c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
