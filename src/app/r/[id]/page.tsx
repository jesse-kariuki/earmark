import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AI_MODE_COOKIE, aiRuntime, resolveAiMode } from "@/lib/ai/runtime";
import { getDb } from "@/lib/db";
import { recipientView } from "@/lib/earmarks/recipient";
import { formatMoney } from "@/lib/money";
import { RecipientCard } from "./RecipientCard";

export const dynamic = "force-dynamic";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

export default async function RecipientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ai = aiRuntime(resolveAiMode((await cookies()).get(AI_MODE_COOKIE)?.value));
  const r = await recipientView(getDb(), id, ai, Date.now());
  if (!r.ok) notFound();
  const v = r.value;
  const paid = v.paidMinor !== null;
  const first = v.beneficiary.split(" ")[0] ?? v.beneficiary;

  return (
    <main className="min-h-[calc(100vh-57px)] bg-zinc-50 px-4 py-6">
      <RecipientCard
        earmarkId={v.earmarkId}
        paid={paid}
        headline={
          paid
            ? { en: `${first}, your ${v.period} fees were paid`, sw: `${first}, ada yako ya ${v.period} imelipwa` }
            : { en: `${v.senderFirstName} set money aside for your ${v.period} fees`, sw: `${v.senderFirstName} ametenga pesa kwa ada yako ya ${v.period}` }
        }
        message={v.messages.recipientMessage}
        amount={paid ? formatMoney(v.paidMinor!, v.currency) : v.heldMinor > 0 ? formatMoney(v.heldMinor, v.currency) : null}
        institution={v.institution}
        date={v.paidAt === null ? null : day(v.paidAt)}
        confirmed={v.confirmedAt !== null}
      />
      <p className="mx-auto mt-4 max-w-md text-center text-xs text-muted-foreground">
        Every step is on a tamper-evident record.{" "}
        <Link href={`/receipt/${v.earmarkId}`} className="text-primary underline">
          See the proof receipt
        </Link>
      </p>
    </main>
  );
}
