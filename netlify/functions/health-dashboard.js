const { verifyAuth } = require("./_shared/auth");
const { cors, success, error, html } = require("./_shared/response");
const { escapeHtml } = require("./_shared/utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  // Check if JSON API request or HTML page request
  const accept = event.headers.accept || "";
  const wantsJSON = accept.includes("application/json") || event.queryStringParameters?.format === "json";

  // Auth required for JSON API
  if (wantsJSON) {
    try {
      verifyAuth(event);
    } catch (e) {
      return error(e.message, 401);
    }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (wantsJSON) return success({ error: "Supabase not configured" });
    return html(dashboardHTML({ agents: [], briefing: "Supabase not configured" }));
  }

  try {
    // Fetch agent run logs (last 24h)
    const agentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_run_logs?order=completed_at.desc&limit=50&select=agent_name,status,performance_score,duration_seconds,completed_at`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    const agents = agentRes.ok ? await agentRes.json() : [];

    // Fetch latest chairman briefing
    const briefRes = await fetch(
      `${SUPABASE_URL}/rest/v1/chairman_briefing?order=created_at.desc&limit=1&select=content,created_at`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    const briefings = briefRes.ok ? await briefRes.json() : [];
    const briefing = briefings[0]?.content || "No briefing available";

    // Aggregate stats
    const total = agents.length;
    const succeeded = agents.filter((a) => a.status === "success").length;
    const failed = agents.filter((a) => a.status === "failed").length;
    const avgScore = total > 0
      ? Math.round(agents.reduce((s, a) => s + (a.performance_score || 0), 0) / total)
      : 0;

    const data = {
      agents,
      briefing,
      stats: { total, succeeded, failed, avgScore },
      updatedAt: new Date().toISOString(),
    };

    if (wantsJSON) return success(data);
    return html(dashboardHTML(data));
  } catch (e) {
    console.error("Dashboard error:", e.message);
    if (wantsJSON) return error("Dashboard data fetch failed", 500);
    return html(dashboardHTML({ agents: [], briefing: "Error loading data", stats: {} }));
  }
};

function dashboardHTML(data) {
  const { agents = [], briefing = "", stats = {} } = data;

  const agentRows = agents
    .slice(0, 20)
    .map((a) => {
      const status = a.status === "success" ? "&#9679; OK" : a.status === "failed" ? "&#9679; FAIL" : "&#9679; " + a.status;
      const color = a.status === "success" ? "#22c55e" : a.status === "failed" ? "#ef4444" : "#f59e0b";
      const score = a.performance_score ? Math.round(a.performance_score) : "-";
      const duration = a.duration_seconds ? Math.round(a.duration_seconds) + "s" : "-";
      const time = a.completed_at ? new Date(a.completed_at).toLocaleString() : "-";
      return `<tr><td>${escapeHtml(a.agent_name || "-")}</td><td style="color:${color}">${status}</td><td>${score}</td><td>${duration}</td><td style="color:rgba(255,255,255,.4)">${time}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>System Health — NYSR</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',system-ui,sans-serif;background:#0a0a0f;color:#f7f5f0;min-height:100vh;padding:32px}
h1{font-size:24px;margin-bottom:8px}
.sub{color:rgba(255,255,255,.4);font-size:13px;margin-bottom:32px}
.stats{display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap}
.stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:20px;flex:1;min-width:150px}
.stat-label{font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.stat-val{font-size:28px;font-weight:700}
.briefing{background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.2);border-radius:12px;padding:20px;margin-bottom:32px;font-size:14px;line-height:1.7;color:rgba(255,255,255,.8)}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
td{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.03);font-size:14px}
tr:hover{background:rgba(255,255,255,.02)}
</style></head><body>
<h1>System Health Dashboard</h1>
<div class="sub">NY Spotlight Report — Agent Observatory</div>
<div class="stats">
<div class="stat"><div class="stat-label">Total Runs (24h)</div><div class="stat-val">${stats.total || 0}</div></div>
<div class="stat"><div class="stat-label">Succeeded</div><div class="stat-val" style="color:#22c55e">${stats.succeeded || 0}</div></div>
<div class="stat"><div class="stat-label">Failed</div><div class="stat-val" style="color:#ef4444">${stats.failed || 0}</div></div>
<div class="stat"><div class="stat-label">Avg Score</div><div class="stat-val" style="color:#c9a84c">${stats.avgScore || 0}%</div></div>
</div>
<div class="briefing"><strong>Latest Briefing:</strong><br>${escapeHtml(briefing)}</div>
<table><thead><tr><th>Agent</th><th>Status</th><th>Score</th><th>Duration</th><th>Last Run</th></tr></thead>
<tbody>${agentRows || "<tr><td colspan=5 style='text-align:center;color:rgba(255,255,255,.3)'>No data</td></tr>"}</tbody></table>
</body></html>`;
}
