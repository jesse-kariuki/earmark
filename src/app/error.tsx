"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">No money moved because of this error. Try again, or use Reset in the header to restore the demo.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">ref {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Try again
      </button>
    </main>
  );
}
