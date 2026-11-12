import { describe, expect, it } from "vitest";
import { parseToolResult } from "@/lib/paypal/toolkit";

describe("parseToolResult", () => {
  it("parses the JSON string the Agent Toolkit returns into the Orders v2 object", () => {
    const raw = JSON.stringify({ id: "ORDER1", status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } }] });
    expect(parseToolResult(raw)).toEqual({ id: "ORDER1", status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } }] });
  });

  it("passes objects through unchanged (mock stubs)", () => {
    const order = { id: "ORDER1", status: "COMPLETED" };
    expect(parseToolResult(order)).toBe(order);
  });

  it("turns a non-JSON string into an error object, so the Guardian reports the hold as unconfirmed", () => {
    expect(parseToolResult("Internal error")).toEqual({ name: "UNPARSEABLE_TOOL_RESULT", message: "Internal error" });
  });
});
