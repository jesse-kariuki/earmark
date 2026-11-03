import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Money that remembers why it was sent.</h1>
      <p className="mt-4 text-muted-foreground">
        Hold funds for a purpose. Pay only a verified invoice. Release the rest. Prove every step.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/compose" className={buttonVariants({ size: "lg" })}>
          Earmark money
        </Link>
        <Link href="/earmarks/em_demo" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Open the demo Earmark
        </Link>
      </div>
    </main>
  );
}
