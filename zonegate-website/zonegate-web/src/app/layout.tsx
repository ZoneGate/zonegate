import type { Metadata } from "next";
import "./globals.css";

import Shell from "@/components/layout/Shell";
import SessionGate from "@/components/layout/SessionGate";

const basePath =
  process.env.BASE_PATH ??
  (process.env.NEXT_PUBLIC_DEMO_MODE === "true" &&
  process.env.NODE_ENV === "production"
    ? "/zonegate-website"
    : "");

export const metadata: Metadata = {
  title: "ZoneGate",
  description: "Secure logistics authorization platform",
  icons: {
    icon: [
      { url: `${basePath}/icon.png`, type: "image/png" },
      { url: `${basePath}/favicon.ico`, sizes: "32x32" },
    ],
    apple: `${basePath}/apple-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F8FAFC] text-[#0F172A] antialiased">
        <SessionGate>
          <Shell>{children}</Shell>
        </SessionGate>
      </body>
    </html>
  );
}
