const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  // Require auth — this is an admin-only debug endpoint
  try {
    verifyAuth(event);
  } catch (e) {
    return error(e.message, 401);
  }

  const KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!KEY) return success({ error: "No key configured", has_key: false });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const body = await res.text();
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) {
      console.warn("Failed to parse Anthropic response:", e.message);
    }

    return success({
      http_status: res.status,
      has_key: true,
      key_length: KEY.length,
      api_error: parsed?.error || null,
      model_responded: res.status === 200,
    });
  } catch (e) {
    console.error("Claude debug request failed:", e.message);
    return error("API request failed: " + e.message, 500);
  }
};
