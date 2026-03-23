// Client Dashboard API — returns client-scoped data from Supabase
const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supaQuery(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  let user;
  try {
    user = verifyAuth(event);
  } catch (e) {
    return error("Unauthorized", 401);
  }

  const clientId = user.sub;
  const action = (event.queryStringParameters || {}).action || "dashboard";

  try {
    switch (action) {
      case "dashboard": {
        const [content, social, analytics, voice] = await Promise.all([
          supaQuery(`client_content?client_id=eq.${clientId}&select=id&status=eq.published`),
          supaQuery(`client_social_posts?client_id=eq.${clientId}&select=id&status=eq.published`),
          supaQuery(`client_analytics?client_id=eq.${clientId}&order=date.desc&limit=7`),
          supaQuery(`voice_conversations?select=id&limit=1000`),
        ]);
        const recentAnalytics = analytics || [];
        const thisWeek = recentAnalytics.slice(0, 7);
        const totalViews = thisWeek.reduce((s, r) => s + (r.page_views || 0), 0);
        const totalLeads = thisWeek.reduce((s, r) => s + (r.leads_generated || 0), 0);

        return success({
          contentCount: content ? content.length : 0,
          socialCount: social ? social.length : 0,
          leadCount: totalLeads,
          voiceCalls: voice ? voice.length : 0,
          pageViews: totalViews,
          analytics: recentAnalytics,
        });
      }

      case "content": {
        const data = await supaQuery(
          `client_content?client_id=eq.${clientId}&order=created_at.desc&limit=50`
        );
        return success({ items: data || [] });
      }

      case "social": {
        const data = await supaQuery(
          `client_social_posts?client_id=eq.${clientId}&order=created_at.desc&limit=50`
        );
        return success({ posts: data || [] });
      }

      case "analytics": {
        const data = await supaQuery(
          `client_analytics?client_id=eq.${clientId}&order=date.desc&limit=30`
        );
        return success({ days: data || [] });
      }

      case "leads": {
        const data = await supaQuery(
          `contacts?select=id,email,name,company,stage,score,created_at&order=created_at.desc&limit=50`
        );
        return success({ leads: data || [] });
      }

      case "voice": {
        const data = await supaQuery(
          `voice_conversations?order=created_at.desc&limit=50&select=call_sid,department,turn,caller_text,ai_response,created_at`
        );
        return success({ conversations: data || [] });
      }

      default:
        return error("Unknown action", 400);
    }
  } catch (err) {
    console.error("client-api error:", err.message);
    return error("Internal error", 500);
  }
};
