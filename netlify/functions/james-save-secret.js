const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
require("tweetnacl-sealedbox-js");  // Adds nacl.sealedBox
const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { parseBody } = require("./_shared/utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") return error("Method not allowed", 405);

  // Require either Butler key or JWT auth
  const butlerKey = event.headers["x-butler-key"];
  const hasButlerAuth = butlerKey && butlerKey === process.env.BUTLER_API_KEY;

  if (!hasButlerAuth) {
    try {
      verifyAuth(event);
    } catch (e) {
      return error("Unauthorized", 401);
    }
  }

  const body = parseBody(event);
  if (!body) return error("Invalid JSON", 400);

  const { secretName, secretValue } = body;
  if (!secretName || !secretValue) {
    return error("Missing secretName or secretValue", 400);
  }

  // Validate secret name format (GitHub requires alphanumeric + underscores)
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(secretName)) {
    return error("Invalid secret name format. Use alphanumeric characters and underscores.", 400);
  }

  const ghToken = process.env.GH_PAT;
  const repo = "nyspotlightreport/sct-agency-bots";

  if (!ghToken) return error("GH_PAT not configured", 500);

  try {
    // Get repository public key
    const pkRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
      headers: {
        "Authorization": `token ${ghToken}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "JamesButler/3.0",
      },
    });

    if (!pkRes.ok) {
      const errText = await pkRes.text();
      console.error(`GitHub public key fetch failed: ${pkRes.status} ${errText.substring(0, 200)}`);
      throw new Error(`Failed to get public key: HTTP ${pkRes.status}`);
    }

    const { key, key_id } = await pkRes.json();

    // Encrypt using NaCl sealed box (proper GitHub Actions secret encryption)
    const publicKeyBytes = naclUtil.decodeBase64(key);
    const secretBytes = naclUtil.decodeUTF8(secretValue);
    const encrypted = nacl.sealedBox.seal(secretBytes, publicKeyBytes);
    const encryptedBase64 = naclUtil.encodeBase64(encrypted);

    // Save the encrypted secret
    const saveRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${secretName}`, {
      method: "PUT",
      headers: {
        "Authorization": `token ${ghToken}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "JamesButler/3.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ encrypted_value: encryptedBase64, key_id }),
    });

    if (!saveRes.ok && saveRes.status !== 204) {
      const errText = await saveRes.text();
      console.error(`GitHub secret save failed: ${saveRes.status} ${errText.substring(0, 200)}`);
      throw new Error(`Failed to save secret: HTTP ${saveRes.status}`);
    }

    console.log(JSON.stringify({
      event: "secret_saved",
      secret: secretName,
      timestamp: new Date().toISOString(),
    }));

    return success({
      success: true,
      message: `${secretName} saved successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Secret save error:", err.message);
    return error(err.message, 500);
  }
};
