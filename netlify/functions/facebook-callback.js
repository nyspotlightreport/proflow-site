const { html } = require("./_shared/response");
const { escapeHtml } = require("./_shared/utils");

exports.handler = async (event) => {
  const { code, error: fbError } = event.queryStringParameters || {};

  const page = (body) => html(`<!DOCTYPE html><html><head><title>Facebook - NYSR</title></head>
<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;max-width:600px;margin:0 auto;text-align:center">${body}
<p style="margin-top:20px"><a href="/tokens/" style="color:#C9A84C">← Token Center</a></p></body></html>`);

  if (fbError) {
    return page(`<h2 style="color:#EF4444">Facebook Error: ${escapeHtml(fbError)}</h2>`);
  }
  if (!code) {
    return page(`<h2>No code received</h2>`);
  }

  const APP_ID = process.env.FACEBOOK_APP_ID || "";
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
  const REDIRECT = "https://nyspotlightreport.com/api/facebook-callback";

  if (!APP_ID || !APP_SECRET) {
    return page(`<div style="font-size:48px">⚠️</div>
<h2 style="color:#F59E0B;margin:16px 0">App Configuration Missing</h2>
<p style="color:#64748B;margin-bottom:24px">FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set in environment variables.</p>`);
  }

  // Exchange code for user access token
  let userToken;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${APP_SECRET}&code=${encodeURIComponent(code)}`
    );
    const data = await res.json();
    userToken = data.access_token;
    if (!userToken) throw new Error(data.error?.message || "No token returned");
  } catch (e) {
    console.error("Facebook token exchange failed:", e.message);
    return page(`<h2 style="color:#EF4444">Token exchange failed</h2>
<p style="color:#64748B">${escapeHtml(e.message)}</p>`);
  }

  // Get pages the user manages
  let pages = [];
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`);
    const data = await res.json();
    pages = data.data || [];
  } catch (e) {
    console.warn("Failed to fetch Facebook pages:", e.message);
  }

  if (pages.length === 0) {
    // No pages — show success without exposing token in HTML
    return page(`<div style="font-size:48px">✅</div>
<h2 style="color:#22D3A0;margin:12px 0">Facebook Connected!</h2>
<p style="color:#64748B">No pages found. Your user token has been obtained. Check the Token Center to manage tokens.</p>`);
  }

  // Build page selection UI with properly escaped values
  const pageOptions = pages.map((p, i) => {
    const safeName = escapeHtml(p.name || "Unnamed Page");
    const safeId = escapeHtml(p.id);
    return `<div style="background:#111827;border:1px solid #1a2d42;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer"
      data-idx="${i}">
      <strong style="color:#E2E8F0">${safeName}</strong><br>
      <span style="font-size:11px;color:#64748B">ID: ${safeId}</span>
    </div>`;
  }).join("");

  // Pass token data via a JSON blob in a script tag — escape for safe embedding
  // Must escape </script>, <!-- and any string that could break out of the script context
  const safePageData = JSON.stringify(pages.map(p => ({
    id: p.id,
    name: p.name,
    token: p.access_token,
  }))).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

  return html(`<!DOCTYPE html><html><head><title>Select Page - NYSR</title></head>
<body style="font-family:system-ui;background:#020409;color:#E2E8F0;padding:40px;max-width:600px;margin:0 auto">
<div style="font-size:48px;text-align:center">✅</div>
<h2 style="color:#22D3A0;text-align:center;margin:12px 0">Facebook Connected!</h2>
<p style="color:#64748B;margin-bottom:16px;text-align:center">Select the Page to use for posting:</p>
${pageOptions}
<p style="text-align:center;margin-top:20px"><a href="/tokens/" style="color:#C9A84C">← Token Center</a></p>
<script>
var pageData=${safePageData};
document.querySelectorAll('[data-idx]').forEach(function(el){
  el.addEventListener('click',function(){
    var idx=parseInt(this.getAttribute('data-idx'));
    var pg=pageData[idx];
    if(pg){
      navigator.clipboard.writeText(pg.token).then(function(){
        alert('Page "'+pg.name+'" token copied! Add to GitHub Secrets as FB_PAGE_TOKEN');
      });
    }
  });
});
</script>
</body></html>`);
};
