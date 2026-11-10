import { describe, expect, it } from "vitest";
import { confirmRecipient, recipientView } from "@/lib/earmarks/recipient";
import { getEvents } from "@/lib/events/append";
import { makeTestDb, TEST_NOW } from "../helpers/db";

describe("recipient view", () => {
  it("a paid Earmark shows the amount, logs recipient.notified once, and confirms once", async () => {
    const { db } = makeTestDb();
    const v = await recipientView(db, "em_hist_04", null, TEST_NOW); // paid, not yet confirmed
    expect(v).toMatchObject({ ok: true, value: { paidMinor: 38000, institution: "Lakeview Secondary School", confirmedAt: null, messages: { source: "template" } } });
    if (!v.ok) return;
    expect(v.value.messages.recipientMessage.sw).toContain("imelipwa kwa Lakeview Secondary School: $380.00");
    await recipientView(db, "em_hist_04", null, TEST_NOW);
    expect(getEvents(db, "em_hist_04").filter((e) => e.type === "recipient.notified")).toHaveLength(1);

    expect(confirmRecipient(db, "em_hist_04", TEST_NOW)).toMatchObject({ ok: true, value: { confirmedAt: TEST_NOW } });
    expect(confirmRecipient(db, "em_hist_04", TEST_NOW + 1)).toMatchObject({ ok: true, value: { confirmedAt: TEST_NOW } });
    expect(getEvents(db, "em_hist_04").filter((e) => e.type === "recipient.confirmed")).toHaveLength(1);
  });

  it("a held Earmark shows the held amount and cannot be confirmed yet", async () => {
    const { db } = makeTestDb();
    const v = await recipientView(db, "em_demo", null, TEST_NOW);
    expect(v).toMatchObject({ ok: true, value: { paidMinor: null, heldMinor: 40000, senderFirstName: "Grace" } });
    expect(confirmRecipient(db, "em_demo", TEST_NOW)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(getEvents(db, "em_demo").some((e) => e.type === "recipient.notified")).toBe(false);
    expect(await recipientView(db, "em_nope", null, TEST_NOW)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(confirmRecipient(db, "em_nope", TEST_NOW)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
