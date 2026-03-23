const { cors, success, error } = require("./_shared/response");
const { isValidEmail, sanitizeString, parseBody } = require("./_shared/utils");
const { checkRateLimit, getClientIP } = require("./_shared/rate-limit");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  // Rate limit: 5 subscriptions per minute per IP
  const ip = getClientIP(event);
  const { allowed, retryAfterMs } = checkRateLimit(`subscribe:${ip}`, 5, 60_000);
  if (!allowed) {
    return { statusCode: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
      body: JSON.stringify({ error: "Too many requests. Please try again later." }) };
  }

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const email = (body.email || "").trim().toLowerCase();
  const name = sanitizeString(body.name || "", 200);

  if (!isValidEmail(email)) {
    return error("Invalid email", 400);
  }

  const results = {};

  // HubSpot CRM — add as contact
  const HS_KEY = process.env.HUBSPOT_API_KEY || "";
  if (HS_KEY) {
    try {
      const nameParts = name.split(" ");
      const hsRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HS_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          properties: {
            email,
            firstname: nameParts[0] || "",
            lastname: nameParts.slice(1).join(" ") || "",
            lifecyclestage: "subscriber",
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (hsRes.status === 201 || hsRes.status === 200) {
        results.hubspot = "added";
      } else if (hsRes.status === 409) {
        results.hubspot = "already_exists";
      } else {
        const hsBody = await hsRes.text();
        console.warn(`HubSpot error ${hsRes.status}: ${hsBody.substring(0, 200)}`);
        results.hubspot = `http_${hsRes.status}`;
      }
    } catch (e) {
      console.error("HubSpot request failed:", e.message);
      results.hubspot = "error";
    }
  } else {
    results.hubspot = "no_key";
  }

  console.log(JSON.stringify({
    event: "subscribe", email, name, hubspot: results.hubspot,
    timestamp: new Date().toISOString(),
  }));

  return success({ success: true, email, results });
};
