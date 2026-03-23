const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
require("tweetnacl-sealedbox-js");  // Adds nacl.sealedBox
const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { parseBody } = require("./_shared/utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  // Require JWT auth
  try {
    verifyAuth(event);
  } catch (e) {
    return error(e.message, 401);
  }

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const secrets = body.secrets || {};
  if (Object.keys(secrets).length === 0) {
    return error("No secrets provided", 400);
  }

  const GH_TOKEN = process.env.GH_PAT;
  const REPO = "nyspotlightreport/sct-agency-bots";

  if (!GH_TOKEN) return error("GH_PAT not configured", 500);

  const results = {};

  // Get public key once for all secrets
  let publicKey, keyId;
  try {
    const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
      headers: {
        "Authorization": `token ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "NYSR-SaveSecret/2.0",
      },
    });
    if (!pkRes.ok) throw new Error(`HTTP ${pkRes.status}`);
    const pkData = await pkRes.json();
    publicKey = naclUtil.decodeBase64(pkData.key);
    keyId = pkData.key_id;
  } catch (e) {
    console.error("Failed to get GitHub public key:", e.message);
    return error("Failed to get repository public key", 500);
  }

  for (const [name, value] of Object.entries(secrets)) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
      results[name] = "error: invalid name format";
      continue;
    }

    try {
      const secretBytes = naclUtil.decodeUTF8(String(value));
      const encrypted = nacl.sealedBox.seal(secretBytes, publicKey);
      const encryptedBase64 = naclUtil.encodeBase64(encrypted);

      const saveRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, {
        method: "PUT",
        headers: {
          "Authorization": `token ${GH_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "NYSR-SaveSecret/2.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ encrypted_value: encryptedBase64, key_id: keyId }),
      });

      results[name] = saveRes.ok || saveRes.status === 204 ? "saved" : `error: HTTP ${saveRes.status}`;
    } catch (e) {
      console.error(`Failed to save secret ${name}:`, e.message);
      results[name] = `error: ${e.message}`;
    }
  }

  return success({ success: true, results });
};
