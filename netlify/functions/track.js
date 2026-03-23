const { cors, success, error } = require("./_shared/response");
const { parseBody } = require("./_shared/utils");
const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const data = parseBody(event);
  if (!data) return error("Invalid JSON", 400);

  const { event: evtName, page, source, email } = data;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: evtName,
    page,
    source,
    email: email ? email.split("@")[1] : null,
    ip_hash: crypto.createHash("sha256").update(event.headers["x-forwarded-for"] || "").digest("hex").slice(0, 8),
  }));

  return success({ ok: true });
};
