import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This Earmark or invoice does not exist. The demo data resets on each deploy.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary underline">
        Back to the start
      </Link>
    </main>
  );
}
