// Browser-side fetch helper for our `{ ok, data } | { ok, error }` API envelope.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; detail?: Record<string, string | string[]> } };

export async function api<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Could not reach the server. Check your connection and try again." } };
  }
}
