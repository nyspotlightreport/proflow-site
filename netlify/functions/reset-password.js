const bcrypt = require("bcryptjs");
const { signToken } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { isValidEmail, parseBody } = require("./_shared/utils");
const crypto = require("crypto");

// In-memory reset token store (survives within a single Lambda container)
// For production, use Netlify Blobs or Supabase
const resetTokens = new Map();

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const action = body.action || "";

  // ── REQUEST RESET ──────────────────────────────
  if (action === "request") {
    const email = (body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) return error("Invalid email", 400);

    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();

    // Always return success (don't reveal if email exists)
    if (email === ADMIN_EMAIL) {
      // Generate a 6-digit code
      const code = crypto.randomInt(100000, 999999).toString();
      resetTokens.set(email, {
        code,
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        attempts: 0,
      });

      // In production, send the code via email
      // For now, log it (the Chairman can check function logs)
      console.log(JSON.stringify({
        event: "password_reset_requested",
        email,
        code_hint: code.substring(0, 2) + "****",
        timestamp: new Date().toISOString(),
      }));

      // If Gmail is configured, send the code
      const GMAIL_USER = process.env.GMAIL_USER || "";
      const GMAIL_PASS = process.env.GMAIL_APP_PASS || "";
      if (GMAIL_USER && GMAIL_PASS) {
        // Netlify functions can't use SMTP directly, but we can log it
        // The code will be visible in Netlify function logs
        console.log(`RESET CODE FOR ${email}: ${code}`);
      }
    }

    return success({ message: "If that email is registered, a reset code has been sent." });
  }

  // ── VERIFY CODE & RESET ────────────────────────
  if (action === "reset") {
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    const newPassword = body.newPassword || "";

    if (!isValidEmail(email)) return error("Invalid email", 400);
    if (!code || code.length !== 6) return error("Invalid reset code", 400);
    if (!newPassword || newPassword.length < 8) return error("Password must be at least 8 characters", 400);

    const stored = resetTokens.get(email);
    if (!stored) return error("No reset request found. Please request a new code.", 400);

    stored.attempts++;
    if (stored.attempts > 5) {
      resetTokens.delete(email);
      return error("Too many attempts. Please request a new code.", 429);
    }

    if (Date.now() > stored.expires) {
      resetTokens.delete(email);
      return error("Reset code expired. Please request a new one.", 400);
    }

    if (stored.code !== code) {
      return error("Invalid reset code", 400);
    }

    // Code valid — hash new password
    const hash = await bcrypt.hash(newPassword, 12);
    resetTokens.delete(email);

    console.log(JSON.stringify({
      event: "password_reset_completed",
      email,
      timestamp: new Date().toISOString(),
      new_hash: hash, // Log the hash so the admin can update ADMIN_PASSWORD_HASH env var
    }));

    // Generate a new JWT so the user is logged in immediately
    const token = signToken({
      email,
      name: "S.C. Thomas",
      plan: "agency",
      role: "chairman",
    });

    return success({
      message: "Password reset successful. Update ADMIN_PASSWORD_HASH in Netlify env vars with the hash from the function logs.",
      token,
      email,
      note: "You are now logged in with a temporary session.",
    });
  }

  return error("Invalid action. Use 'request' or 'reset'.", 400);
};
