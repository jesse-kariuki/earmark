import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { AiModeToggle } from "@/components/AiModeToggle";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { ResetButton } from "@/components/ResetButton";
import { SandboxBadge } from "@/components/SandboxBadge";
import { liveAiAvailable } from "@/lib/ai/provider";
import { AI_MODE_COOKIE, resolveAiMode } from "@/lib/ai/runtime";
import { env } from "@/lib/env";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const aiMode = resolveAiMode((await cookies()).get(AI_MODE_COOKIE)?.value);
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight">
              Earmark
            </Link>
            <SandboxBadge />
          </div>
          <PersonaSwitcher />
          <div className="flex items-center gap-2">
            <AiModeToggle initial={aiMode} liveAvailable={liveAiAvailable()} />
            {env.JUDGE_MODE && <ResetButton />}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
