import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: "Stash — Free. Unlimited. Private. Storage.",
  description: "Storage that is free, unlimited and private. Sign in with Google. No card. Encrypted before it is stored.",
};

export const viewport: Viewport = { themeColor: "#fffbf5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // No fixed height on <html>: iOS Safari can trap scrolling when html is 100% tall
    // and the body overflows it. The body sizes itself from the viewport instead.
    <html lang="en" className={`${geist.variable} ${fraunces.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-svh flex flex-col">{children}</body>
    </html>
  );
}
