// Isomorphic (browser + node). Event type strings are frozen — see docs/02-DATA-MODEL.md.

export const EVENT_TYPES = [
  "earmark.created",
  "contract.compiled",
  "contract.approved",
  "paypal.order_created",
  "paypal.authorized",
  "invoice.received",
  "invoice.extracted",
  "invoice.signature_checked",
  "policy.evaluated",
  "approval.requested",
  "approval.granted",
  "approval.rejected",
  "ticket.issued",
  "ticket.redeemed",
  "paypal.captured",
  "paypal.capture_failed",
  "paypal.payout_sent",
  "paypal.payout_succeeded",
  "paypal.payout_failed",
  "remainder.released",
  "recipient.notified",
  "recipient.confirmed",
  "earmark.frozen",
  "earmark.unfrozen",
  "earmark.voided",
  "earmark.expired",
  "trace.step",
  "attack.started",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTORS = [
  "sender",
  "school",
  "recipient",
  "guardian",
  "gate",
  "orchestrator",
  "paypal",
  "system",
] as const;
export type Actor = (typeof ACTORS)[number];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };
export type JsonObject = { [key: string]: JsonValue | undefined };

/** The fields that make up a chained event, as stored and as served to the receipt page. */
export interface ChainEvent {
  earmarkId: string;
  seq: number;
  type: string;
  actor: string;
  payload: unknown;
  createdAt: number; // ms epoch
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = "0".repeat(64);
