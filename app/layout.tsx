import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";

import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Dify Skills Evaluator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} app-shell`}
        style={{
          fontFamily: "var(--font-body), sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
