import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SandboxBadge } from "@/components/SandboxBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Earmark",
  description: "Money that remembers why it was sent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold tracking-tight">Earmark</span>
          <SandboxBadge />
        </header>
        {children}
      </body>
    </html>
  );
}
