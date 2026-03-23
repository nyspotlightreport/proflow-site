const crypto = require("crypto");
const { cors, success, error } = require("./_shared/response");

const PRODUCT_MAP = {
  hrmta: { file: "100_instagram_captions.pdf", name: "100 Instagram Caption Templates" },
  uizhhy: { file: "content_creation_checklist.pdf", name: "Content Creation Checklist" },
  arleib: { file: "annual_business_plan_template.pdf", name: "Annual Business Plan Template" },
  ubcsk: { file: "daily_habit_tracker_30day.pdf", name: "Daily Habit Tracker" },
  shtebf: { file: "weekly_meal_prep_planner.pdf", name: "Weekly Meal Prep Planner" },
  tzmuw: { file: "monthly_budget_planner.pdf", name: "Monthly Budget Planner" },
  anlxcn: { file: "50_chatgpt_prompts_business.pdf", name: "50 ChatGPT Prompts for Business" },
  jdimsu: { file: "30_day_social_content_calendar.pdf", name: "30-Day Social Media Calendar" },
  cxacdr: { file: "90_day_goal_planner.pdf", name: "90-Day Goal Planner" },
  ybryh: { file: "passive_income_zero_cost_guide.pdf", name: "Passive Income Zero-Cost Guide" },
};
const SITE = "https://nyspotlightreport.com";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();
  if (event.httpMethod !== "POST") {
    return success({ status: "Gumroad delivery webhook active", products: Object.keys(PRODUCT_MAP).length });
  }

  // Verify Gumroad webhook signature if secret is configured
  const GUMROAD_SECRET = process.env.GUMROAD_WEBHOOK_SECRET || "";
  if (GUMROAD_SECRET) {
    const signature = event.headers["x-gumroad-signature"] || "";
    const hash = crypto.createHmac("sha256", GUMROAD_SECRET)
      .update(event.body || "").digest("hex");
    if (signature && hash !== signature) {
      console.warn("Gumroad webhook signature mismatch");
      return error("Invalid signature", 401);
    }
  }

  try {
    const p = new URLSearchParams(event.body || "");
    const email = (p.get("email") || "").trim().toLowerCase();
    const link = p.get("product_permalink") || "";
    const buyer = p.get("full_name") || "there";
    const product = PRODUCT_MAP[link];

    if (!product || !email) {
      return success({ received: true });
    }

    const dlUrl = `${SITE}/downloads/${product.file}`;

    console.log(JSON.stringify({
      event: "gumroad_sale",
      product: product.name,
      email,
      buyer,
      url: dlUrl,
      timestamp: new Date().toISOString(),
    }));

    return success({ success: true, product: product.name, email, url: dlUrl });
  } catch (e) {
    console.error("Gumroad delivery error:", e.message);
    return success({ received: true });
  }
};
