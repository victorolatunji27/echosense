// Shared helpers for the /api serverless functions. Files prefixed with
// an underscore under /api are not exposed as routes by Vercel.

const buckets = new Map<string, { count: number; resetAt: number }>()

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

/**
 * Best-effort per-IP fixed-window rate limit. State lives in the module
 * scope of a serverless instance, so the effective ceiling is
 * (limit × warm instances) — enough to stop casual abuse of the proxied
 * keys without an external store.
 */
export function checkRateLimit(
  req: Request,
  limit: number,
  windowMs: number,
): Response | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()

  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key)
    }
  }

  const bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs })
    return null
  }
  if (bucket.count >= limit) {
    return jsonError(429, 'Too many requests — please slow down.')
  }
  bucket.count += 1
  return null
}

export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<{ body?: unknown; error?: Response }> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > maxBytes) {
    return { error: jsonError(413, 'Request body too large.') }
  }

  const text = await req.text()
  if (text.length > maxBytes) {
    return { error: jsonError(413, 'Request body too large.') }
  }

  try {
    return { body: JSON.parse(text) }
  } catch {
    return { error: jsonError(400, 'Invalid JSON body.') }
  }
}
