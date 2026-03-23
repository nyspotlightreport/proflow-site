const bcrypt = require("bcryptjs");
const { signToken } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { isValidEmail, parseBody } = require("./_shared/utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!isValidEmail(email)) return error("Invalid email", 400);
  if (!password || password.length < 4) return error("Password required", 400);

  // Admin login: compare against hashed password in env
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || "";

  // Admin login (if configured)
  if (ADMIN_EMAIL && ADMIN_HASH && email === ADMIN_EMAIL) {
    const valid = await bcrypt.compare(password, ADMIN_HASH);
    if (!valid) return error("Invalid credentials", 401);

    const token = signToken({
      email,
      name: "S.C. Thomas",
      plan: "agency",
      role: "chairman",
    });

    return success({ token, email, name: "S.C. Thomas", plan: "agency", role: "chairman" });
  }

  // Client login: check Supabase client_users table
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/client_users?email=eq.${encodeURIComponent(email)}&active=eq.true&select=id,email,name,company,plan,role,password_hash&limit=1`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (res.ok) {
        const users = await res.json();
        if (users.length > 0) {
          const user = users[0];
          const valid = await bcrypt.compare(password, user.password_hash);
          if (!valid) return error("Invalid credentials", 401);

          // Update last_login (fire and forget)
          fetch(`${SUPABASE_URL}/rest/v1/client_users?id=eq.${user.id}`, {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ last_login: new Date().toISOString() }),
          }).catch(() => {});

          const token = signToken({
            sub: user.id,
            email: user.email,
            name: user.name,
            plan: user.plan,
            role: user.role,
          });

          return success({
            token,
            email: user.email,
            name: user.name,
            plan: user.plan,
            role: user.role,
            clientId: user.id,
          });
        }
      }
    } catch (err) {
      console.error("Supabase client lookup error:", err.message);
    }
  }

  return error("Invalid credentials", 401);
};
