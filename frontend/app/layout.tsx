import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Duo — aturan untuk pembayaran XRP",
  description:
    "Pembayaran XRP masuk, kebutuhan hidup langsung diamankan, sisanya menabung sendiri. Dibangun di Flare.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${mono.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
