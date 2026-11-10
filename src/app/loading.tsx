export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-7 w-72 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-28 animate-pulse rounded-xl bg-muted" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </main>
  );
}
