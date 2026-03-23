const { cors, success, error } = require("./_shared/response");
const { isValidEmail, sanitizeString, parseBody } = require("./_shared/utils");
const { checkRateLimit, getClientIP } = require("./_shared/rate-limit");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  // Rate limit: 5 leads per minute per IP
  const ip = getClientIP(event);
  const { allowed, retryAfterMs } = checkRateLimit(`lead:${ip}`, 5, 60_000);
  if (!allowed) {
    return { statusCode: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      body: JSON.stringify({ error: "Too many requests. Please try again later." }) };
  }

  const data = parseBody(event);
  if (!data) return error("Invalid JSON", 400);

  const { source } = data;
  const name = sanitizeString(data.name || "", 200);
  const email = (data.email || "").trim().toLowerCase();
  const niche = sanitizeString(data.niche || "", 500);
  const goal = sanitizeString(data.goal || "", 500);

  if (!isValidEmail(email)) return error("Valid email required", 400);

  const BH_KEY = process.env.BEEHIIV_API_KEY;
  const BH_PUB = process.env.BEEHIIV_PUB_ID;
  const results = { email, subscribed: false, tagged: false };

  if (BH_KEY && BH_PUB) {
    try {
      await fetch(`https://api.beehiiv.com/v2/publications/${BH_PUB}/subscriptions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${BH_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: sanitizeString(source || "free-plan", 100),
          custom_fields: [
            { name: "niche", value: niche },
            { name: "goal", value: goal },
            { name: "first_name", value: name },
          ],
        }),
      });
      results.subscribed = true;
    } catch (e) {
      console.error("Beehiiv error:", e.message);
    }
  }

  console.log(JSON.stringify({
    event: "lead_captured", name, email, niche, goal, source,
    timestamp: new Date().toISOString(),
  }));

  return success({ success: true, message: "Lead captured", email });
};
