import type { APIRequestContext } from "@playwright/test";

const SENTENCE = "Pay Brian's Term 1 fees at Lakeview Secondary School, up to $400, only against a real invoice.";

/** A fresh held Earmark through the real API (mock PayPal), so reruns never trip the duplicate rule. */
export async function freshHeldEarmark(request: APIRequestContext): Promise<string> {
  const compiled = await (await request.post("/api/contracts/compile", { data: { sentence: SENTENCE } })).json();
  const created = await (
    await request.post("/api/earmarks", { data: { sentence: SENTENCE, contract: compiled.data.contract, senderName: "Grace Kamau", recipientName: "Brian Kamau" } })
  ).json();
  const id: string = created.data.id;
  await request.post(`/api/earmarks/${id}/approve-contract`);
  const order = await (await request.post(`/api/earmarks/${id}/paypal/order`)).json();
  await request.post(`/api/earmarks/${id}/paypal/authorize`, { data: { orderId: order.data.orderId } });
  return id;
}
