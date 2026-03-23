const { getStore } = require("@netlify/blobs");

const GUARDIAN_SECTIONS = [
  { section: "broadway", tag: "stage/theatre" },
  { section: "film", tag: "film/film" },
  { section: "music", tag: "music/music" },
  { section: "fashion", tag: "fashion/fashion" },
  { section: "tv", tag: "tv-and-radio/tv-and-radio" },
  { section: "nyc", tag: "us-news/new-york" },
];

const SECTION_KICKERS = {
  broadway: "Broadway Coverage", film: "Film Review", music: "Music Coverage",
  fashion: "NYC Fashion", tv: "Television", nyc: "NYC News",
};

exports.handler = async (event) => {
  const store = getStore("nyspotlight-news");
  const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
  const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY || "";

  console.log(JSON.stringify({ event: "fetch_news_start", timestamp: new Date().toISOString() }));
  const allArticles = [];

  // Guardian API
  if (GUARDIAN_KEY) {
    for (const { section, tag } of GUARDIAN_SECTIONS) {
      try {
        const url = `https://content.guardianapis.com/search?tag=${tag}&order-by=newest&page-size=5&show-fields=headline,trailText,thumbnail&api-key=${GUARDIAN_KEY}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          const arts = (data.response?.results || []).slice(0, 4).map((a) => ({
            title: a.fields?.headline || a.webTitle,
            deck: a.fields?.trailText || "",
            url: a.webUrl,
            img: a.fields?.thumbnail || "",
            source: "The Guardian",
            date: a.webPublicationDate,
            section,
            kicker: SECTION_KICKERS[section] || "Coverage",
          }));
          allArticles.push(...arts);
        }
      } catch (e) {
        console.warn(`Guardian ${section} fetch failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // NewsAPI
  if (NEWSAPI_KEY) {
    const newsQueries = [
      { q: "Broadway theater New York musical", section: "broadway" },
      { q: "film premiere New York cinema review", section: "film" },
      { q: "music concert New York Grammy", section: "music" },
      { q: "fashion NYFW New York designer", section: "fashion" },
      { q: "NYC entertainment arts culture", section: "nyc" },
    ];
    for (const { q, section } of newsQueries) {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=4&apiKey=${NEWSAPI_KEY}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const data = await r.json();
          const arts = (data.articles || [])
            .filter((a) => a.title && a.title !== "[Removed]")
            .slice(0, 3)
            .map((a) => ({
              title: a.title,
              deck: a.description || "",
              url: a.url,
              img: a.urlToImage || "",
              source: a.source?.name || "News",
              date: a.publishedAt,
              section,
              kicker: q.split(" ").slice(0, 2).join(" "),
            }));
          allArticles.push(...arts);
        }
      } catch (e) {
        console.warn(`NewsAPI ${section} fetch failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Claude enhancement
  if (ANTHROPIC_KEY && allArticles.length > 0) {
    try {
      const list = allArticles
        .slice(0, 10)
        .map((a, i) => `${i + 1}. [${a.section.toUpperCase()}] "${a.title}" — ${(a.deck || "").substring(0, 80)}`)
        .join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are S.C. Thomas, Editor in Chief of NY Spotlight Report. Write a sharp 1-line kicker and 1-sentence editorial deck for each. NYC-focused, authoritative, direct.\n\nReturn ONLY JSON: [{"index":1,"kicker":"...","editorialDeck":"..."},...]\n\nArticles:\n${list}`,
          }],
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (res.ok) {
        const cd = await res.json();
        const text = cd.content?.[0]?.text || "[]";
        const enhancements = JSON.parse(text.replace(/```json|```/g, "").trim());
        if (Array.isArray(enhancements)) {
          enhancements.forEach((e) => {
            if (allArticles[e.index - 1]) {
              allArticles[e.index - 1].kicker = e.kicker;
              allArticles[e.index - 1].editorialDeck = e.editorialDeck;
            }
          });
        }
      } else {
        const errBody = await res.text();
        console.warn(`Claude API error ${res.status}: ${errBody.substring(0, 100)}`);
      }
    } catch (e) {
      console.warn("Claude enhancement failed:", e.message);
    }
  }

  const payload = { articles: allArticles, fetchedAt: new Date().toISOString(), count: allArticles.length };
  await store.setJSON("latest-news", payload);

  console.log(JSON.stringify({
    event: "fetch_news_complete",
    count: allArticles.length,
    has_claude: !!ANTHROPIC_KEY,
    timestamp: new Date().toISOString(),
  }));

  return { statusCode: 200, body: JSON.stringify({ success: true, count: allArticles.length }) };
};
