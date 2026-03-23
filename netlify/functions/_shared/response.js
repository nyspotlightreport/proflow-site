const DEFAULT_ORIGIN = "https://nyspotlightreport.com";

function getAllowedOrigin() {
  return process.env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Butler-Key",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  };
}

function success(data, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(), ...extraHeaders },
    body: JSON.stringify(data),
  };
}

function error(message, statusCode = 400) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...getCorsHeaders() },
    body: JSON.stringify({ error: message }),
  };
}

function cors() {
  return { statusCode: 204, headers: getCorsHeaders(), body: "" };
}

function html(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": getAllowedOrigin() },
    body,
  };
}

// Backward compat: CORS_HEADERS as getter, ALLOWED_ORIGIN as getter
module.exports = {
  success, error, cors, html,
  get CORS_HEADERS() { return getCorsHeaders(); },
  get ALLOWED_ORIGIN() { return getAllowedOrigin(); },
};
