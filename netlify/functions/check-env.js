const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  // Admin-only endpoint
  try {
    verifyAuth(event);
  } catch (e) {
    return error(e.message, 401);
  }

  return success({
    has_anthropic: !!process.env.ANTHROPIC_API_KEY,
    has_newsapi: !!process.env.NEWSAPI_KEY,
    has_av: !!process.env.ALPHA_VANTAGE_API_KEY,
    has_guardian: !!process.env.GUARDIAN_API_KEY,
    has_hubspot: !!process.env.HUBSPOT_API_KEY,
    has_beehiiv: !!process.env.BEEHIIV_API_KEY,
    has_jwt_secret: !!process.env.JWT_SECRET,
    node_ver: process.version,
  });
};
