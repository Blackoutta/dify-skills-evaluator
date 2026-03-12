import type { ReactNode } from "react";

export const metadata = {
  title: "Dify Skills Evaluator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "linear-gradient(180deg, #f5f1e8 0%, #ebe4d5 100%)",
          color: "#1f1d18",
        }}
      >
        {children}
      </body>
    </html>
  );
}
