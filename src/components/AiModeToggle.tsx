"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Header toggle: Fixture (recorded AI outputs, free, deterministic) / Live (calls Claude).
export function AiModeToggle({ initial, liveAvailable }: { initial: "fixture" | "live"; liveAvailable: boolean }) {
  const [mode, setMode] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function choose(next: "fixture" | "live") {
    setError(null);
    const res = await fetch("/api/ai-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    if (!body.ok) {
      setError(body.error?.message ?? "Could not switch");
      return;
    }
    setMode(next);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">AI</span>
      <div role="radiogroup" aria-label="AI mode" className="flex rounded-md border p-0.5">
        {(["fixture", "live"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={m === "live" && !liveAvailable}
            title={m === "live" && !liveAvailable ? "Live AI is not configured on this server" : undefined}
            onClick={() => choose(m)}
            className={`rounded px-2 py-0.5 capitalize disabled:cursor-not-allowed disabled:opacity-40 ${mode === m ? "bg-primary text-primary-foreground" : ""}`}
          >
            {m}
          </button>
        ))}
      </div>
      {error && (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
