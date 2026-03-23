const { cors, success, error } = require("./_shared/response");

const TICKERS = [
  { sym: "DIS", name: "Disney", sector: "entertainment" },
  { sym: "NFLX", name: "Netflix", sector: "streaming" },
  { sym: "PARA", name: "Paramount", sector: "entertainment" },
  { sym: "AMC", name: "AMC Networks", sector: "entertainment" },
  { sym: "WBD", name: "Warner Bros", sector: "entertainment" },
  { sym: "SPOT", name: "Spotify", sector: "music" },
  { sym: "LUMN", name: "Lumen", sector: "media" },
  { sym: "LYV", name: "Live Nation", sector: "events" },
];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
  if (!AV_KEY) {
    return success({ stocks: [], error: "No AV key" });
  }

  const results = [];
  const toFetch = TICKERS.slice(0, 4);

  for (const t of toFetch) {
    try {
      const r = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${t.sym}&apikey=${AV_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const d = await r.json();
        const q = d["Global Quote"];
        if (q && q["05. price"]) {
          const price = parseFloat(q["05. price"]).toFixed(2);
          const change = parseFloat(q["09. change"]).toFixed(2);
          const pct = parseFloat(q["10. change percent"]).toFixed(2);
          const vol = parseInt(q["06. volume"] || 0);
          results.push({ symbol: t.sym, name: t.name, sector: t.sector, price, change, pct, vol, up: parseFloat(change) >= 0 });
        }
      }
    } catch (e) {
      console.warn(`Stock ${t.sym} fetch failed:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return success(
    { stocks: results, fetchedAt: new Date().toISOString() },
    200,
    { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" }
  );
};
