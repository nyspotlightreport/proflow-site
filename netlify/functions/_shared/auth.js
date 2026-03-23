const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "";

function verifyAuth(event) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("No token provided");
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new Error("Token expired");
    }
    throw new Error("Invalid token");
  }
}

function signToken(payload) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

module.exports = { verifyAuth, signToken };
