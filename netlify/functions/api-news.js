const { cors, success } = require("./_shared/response");

const GUARDIAN_SECTIONS = [
  { section: "broadway", tag: "stage/theatre" },
  { section: "film", tag: "film/film" },
  { section: "music", tag: "music/music" },
  { section: "fashion", tag: "fashion/fashion" },
  { section: "tv", tag: "tv-and-radio/tv-and-radio" },
  { section: "nyc", tag: "us-news/new-york" },
];

const SECTION_LABELS = {
  broadway: "Broadway", film: "Film", music: "Music",
  fashion: "Fashion", tv: "TV", nyc: "NYC",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY || "";
  const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

  const allArticles = [];

  // Guardian API
  if (GUARDIAN_KEY) {
    for (const { section, tag } of GUARDIAN_SECTIONS) {
      try {
        const r = await fetch(
          `https://content.guardianapis.com/search?tag=${tag}&order-by=newest&page-size=4&show-fields=headline,trailText,thumbnail&api-key=${GUARDIAN_KEY}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (r.ok) {
          const data = await r.json();
          (data.response?.results || []).slice(0, 4).forEach((a) => {
            allArticles.push({
              title: a.fields?.headline || a.webTitle,
              deck: a.fields?.trailText || "",
              url: a.webUrl,
              img: a.fields?.thumbnail || "",
              source: "The Guardian",
              date: a.webPublicationDate,
              section,
              kicker: SECTION_LABELS[section] || "News",
            });
          });
        }
      } catch (e) {
        console.warn(`Guardian ${section} fetch failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  // NewsAPI
  if (NEWSAPI_KEY) {
    const newsQueries = [
      { q: "Broadway theater New York opening 2026", section: "broadway" },
      { q: "film premiere New York cinema", section: "film" },
      { q: "fashion NYFW designer New York", section: "fashion" },
    ];
    for (const { q, section } of newsQueries) {
      try {
        const r = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${NEWSAPI_KEY}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (r.ok) {
          const d = await r.json();
          (d.articles || [])
            .filter((a) => a.title && a.title !== "[Removed]")
            .slice(0, 3)
            .forEach((a) => {
              allArticles.push({
                title: a.title,
                deck: a.description || "",
                url: a.url,
                img: a.urlToImage || "",
                source: a.source?.name || "NewsAPI",
                date: a.publishedAt,
                section,
                kicker: section.charAt(0).toUpperCase() + section.slice(1),
              });
            });
        }
      } catch (e) {
        console.warn(`NewsAPI ${section} fetch failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Claude editorial enhancement
  if (ANTHROPIC_KEY && allArticles.length > 0) {
    try {
      const top6 = allArticles.slice(0, 6);
      const list = top6.map((a, i) => `${i + 1}. ${a.title.substring(0, 60)}`).join("\n");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `NY Spotlight Report editorial. For each article give a 3-word kicker and 1-sentence deck (NYC entertainment angle).\n\nReturn ONLY valid JSON array, no markdown:\n[{"i":1,"k":"kicker here","d":"deck sentence here"}]\n\nArticles:\n${list}`,
          }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const cd = await res.json();
        const raw = cd.content?.[0]?.text || "";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const enhancements = JSON.parse(jsonMatch[0]);
          enhancements.forEach((e) => {
            const idx = (e.i || e.index) - 1;
            if (allArticles[idx]) {
              allArticles[idx].kicker = e.k || e.kicker || allArticles[idx].kicker;
              allArticles[idx].editorialDeck = e.d || e.editorialDeck || e.deck;
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

  return success(
    {
      articles: allArticles,
      fetchedAt: new Date().toISOString(),
      count: allArticles.length,
      sources: ["guardian" + (NEWSAPI_KEY ? ",newsapi" : "") + (ANTHROPIC_KEY ? "+claude" : "")],
      live: true,
    },
    200,
    { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" }
  );
};
