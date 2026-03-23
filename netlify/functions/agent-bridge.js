/**
 * agent-bridge.js — Website ↔ Agent System Integration API
 *
 * Bridges the gap between the NY Spotlight Report website and the
 * sct-agency-bots system. Enables:
 *
 * GET  /api/agent-bridge?action=status     → Agent system health
 * GET  /api/agent-bridge?action=briefing   → Latest chairman briefing
 * GET  /api/agent-bridge?action=insights   → Recent agent insights
 * POST /api/agent-bridge?action=trigger    → Trigger a GitHub Actions workflow
 */

const { verifyAuth } = require("./_shared/auth");
const { cors, success, error } = require("./_shared/response");
const { parseBody } = require("./_shared/utils");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const GH_PAT = process.env.GH_PAT || "";
const REPO = "nyspotlightreport/sct-agency-bots";

async function supaQuery(table, query = "") {
  if (!SUPABASE_URL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  const action = (event.queryStringParameters || {}).action || "";

  // Public endpoints (no auth needed)
  if (action === "status" && event.httpMethod === "GET") {
    const runs = await supaQuery("agent_run_logs",
      "?order=completed_at.desc&limit=20&select=agent_name,status,performance_score,completed_at");
    if (!runs) return success({ status: "unavailable", agents: [] });

    const total = runs.length;
    const ok = runs.filter((r) => r.status === "success").length;
    const agents = [...new Set(runs.map((r) => r.agent_name))];

    return success({
      status: ok / total > 0.7 ? "healthy" : ok / total > 0.4 ? "degraded" : "critical",
      success_rate: Math.round((ok / total) * 100),
      active_agents: agents.length,
      recent_runs: total,
    });
  }

  if (action === "briefing" && event.httpMethod === "GET") {
    const briefs = await supaQuery("chairman_briefing",
      "?order=created_at.desc&limit=1&select=content,created_at");
    const brief = briefs?.[0];
    return success({
      briefing: brief?.content || "No briefing available",
      updated: brief?.created_at || null,
    });
  }

  if (action === "insights" && event.httpMethod === "GET") {
    const insights = await supaQuery("agent_memory",
      "?category=eq.strategy&order=created_at.desc&limit=10&select=topic,content,confidence,created_at");
    return success({ insights: insights || [] });
  }

  // Protected endpoints (auth required)
  try {
    verifyAuth(event);
  } catch (e) {
    return error(e.message, 401);
  }

  if (action === "trigger" && event.httpMethod === "POST") {
    if (!GH_PAT) return error("GitHub token not configured", 500);

    const body = parseBody(event);
    if (!body) return error("Invalid JSON", 400);

    const workflow = body.workflow || "";
    const allowedWorkflows = [
      "omega-intelligence.yml",
      "deadman-switch.yml",
      "test.yml",
    ];

    if (!allowedWorkflows.includes(workflow)) {
      return error(`Workflow not in allowed list: ${allowedWorkflows.join(", ")}`, 400);
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${GH_PAT}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (res.status === 204 || res.ok) {
        console.log(JSON.stringify({ event: "workflow_triggered", workflow, timestamp: new Date().toISOString() }));
        return success({ triggered: true, workflow });
      }
      const errText = await res.text();
      return error(`GitHub API error: ${res.status} ${errText.substring(0, 100)}`, 500);
    } catch (e) {
      return error(`Failed to trigger workflow: ${e.message}`, 500);
    }
  }

  return error("Unknown action. Use: status, briefing, insights, trigger", 400);
};
