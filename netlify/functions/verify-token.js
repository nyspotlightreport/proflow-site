const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  try {
    const user = verifyAuth(event);
    return success({ valid: true, email: user.email, plan: user.plan, role: user.role });
  } catch (e) {
    return error(e.message, 401);
  }
};
