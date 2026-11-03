import "server-only";
// Route-handler helpers: `{ ok: true, data } | { ok: false, error: { code, message } }`, Zod body parsing,
// and a per-IP token bucket for write routes on the hosted demo (docs/06-API-SPEC.md).
import { NextResponse } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { type AppError, HTTP_STATUS } from "@/lib/errors";
import type { Result } from "@/lib/result";

export function okJson<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function errorJson(error: AppError) {
  return NextResponse.json({ ok: false, error }, { status: HTTP_STATUS[error.code] });
}

export function fromResult<T>(r: Result<T, AppError>, status = 200) {
  return r.ok ? okJson(r.value, status) : errorJson(r.error);
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<Result<z.infer<S>, AppError>> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "VALIDATION", message: "Body must be JSON." } };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: { code: "VALIDATION", message: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid body." },
    };
  }
  return { ok: true, value: parsed.data };
}

/** Reads one cookie from the request (keeps handlers callable from tests, unlike next/headers). */
export function getCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("cookie")?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

const WINDOW_MS = 60_000;
const LIMIT = 30;
const buckets = new Map<string, { tokens: number; refilledAt: number }>();

/** 30 writes/min per IP. Only enforced in production so tests and local dev are never throttled. */
export function rateLimit(req: Request, now = Date.now()): AppError | null {
  if (env.NODE_ENV !== "production") return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const b = buckets.get(ip) ?? { tokens: LIMIT, refilledAt: now };
  b.tokens = Math.min(LIMIT, b.tokens + ((now - b.refilledAt) / WINDOW_MS) * LIMIT);
  b.refilledAt = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return { code: "RATE_LIMITED", message: "Too many requests. Try again in a minute." };
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return null;
}
