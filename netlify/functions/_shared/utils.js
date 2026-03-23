const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INPUT_LENGTH = 500;

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email) && email.length <= 254;
}

function sanitizeString(str, maxLength = MAX_INPUT_LENGTH) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim().substring(0, maxLength);
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
}

module.exports = { escapeHtml, isValidEmail, sanitizeString, parseBody };
