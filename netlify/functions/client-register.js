// Client Registration — creates new client users in Supabase
const bcrypt = require("bcryptjs");
const { signToken } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { parseBody, isValidEmail } = require("./_shared/utils");
const { checkRateLimit } = require("./_shared/rate-limit");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  const rl = checkRateLimit(event, { windowMs: 60000, max: 3 });
  if (rl) return rl;

  const { email, password, name, company } = parseBody(event);

  if (!email || !isValidEmail(email)) return error("Valid email required", 400);
  if (!password || password.length < 8) return error("Password must be at least 8 characters", 400);
  if (!name || name.length < 2) return error("Name required", 400);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return error("Registration unavailable", 503);

  try {
    // Check if user already exists
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_users?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const existing = await checkRes.json();
    if (existing && existing.length > 0) return error("An account with this email already exists", 409);

    // Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/client_users`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password_hash: hash,
        name: name.trim(),
        company: (company || "").trim(),
        plan: "starter",
        role: "client",
        active: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Supabase create error:", err);
      return error("Registration failed", 500);
    }

    const [user] = await createRes.json();
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
  } catch (err) {
    console.error("Registration error:", err.message);
    return error("Registration failed", 500);
  }
};
