/**
 * In-memory rate limiter for Netlify functions.
 *
 * Uses a sliding window approach. State lives in the Lambda container's memory,
 * so it resets on cold starts — but still prevents burst abuse within warm containers.
 *
 * For stronger protection, upgrade to Netlify Blobs or Redis-backed limits.
 */

const windows = new Map();

const CLEANUP_INTERVAL = 60_000; // Clean stale entries every 60s
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of windows) {
    if (now - entry.windowStart > entry.windowMs * 2) {
      windows.delete(key);
    }
  }
}

/**
 * Check if a request is within rate limits.
 *
 * @param {string} key - Unique identifier (e.g., IP address, email)
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
function checkRateLimit(key, maxRequests = 10, windowMs = 60_000) {
  cleanup();
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0, windowMs };
    windows.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Get the client IP from a Netlify event.
 */
function getClientIP(event) {
  return event.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || event.headers["x-nf-client-connection-ip"]
    || event.headers["client-ip"]
    || "unknown";
}

module.exports = { checkRateLimit, getClientIP };
