// server.mjs — zero-dep local server. Run: node server.mjs → http://localhost:8787
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, braveSearch } from "./lib.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

// ponytail: 10-line .env parser instead of the dotenv package
const env = {};
if (existsSync(join(ROOT, ".env"))) {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const BRAVE = process.env.BRAVE_API_KEY || env.BRAVE_API_KEY || "";
const TYPESAFE = process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY || "";

const JOB_LEVELS = [
  "Clearly not a job posting: blog post, category or board index, company story, marketing or SEO page",
  "Probably not an individual job posting",
  "Unclear whether this page is an individual job posting",
  "Probably an individual job posting for a currently open role",
  "Clearly an individual job posting for a currently open role",
];
const REL_LEVELS = [
  "Unrelated to the searched role",
  "Same broad field but a different role",
  "Partially relevant to the searched role",
  "Relevant match for the searched role",
  "Strong direct match for the searched role",
];
const LOC_LEVELS = [
  "Cannot determine the work location from the provided text",
  "Located in a different country than the requested location",
  "Same country as the requested location but a different city",
  "Same broader region as the requested location, or remote within the same country",
  "In or around the requested location",
];
const LIVE_LEVELS = [
  "Text shows or strongly implies the posting is expired, closed, or no longer accepting applications",
  "Strong signs of staleness: past closing date, role already filled",
  "No freshness information: unclear whether the posting is still open",
  "Looks currently open: no negative signals",
  "Confidently open: explicit future closing date or accepting-applications wording",
];

// One batched System One request per platform: 2 Score questions per result.
// ponytail: parallel questions in one call is ~12x cheaper than per-result requests.
async function typesafeScores(body) {
  const state = {
    keywords: body.keywords || "",
    location: body.location || "",
    query: body.query,
    results: body.results.map((r, i) => ({ i, title: r.title, description: r.description })),
  };
  const questions = {};
  state.results.forEach((r, i) => {
    questions[`job${i}`] = {
      type: "score",
      instructions: `Is \`results[${i}]\` an individual job posting page for a currently open role? Judge by its title \`results[${i}].title\` and snippet \`results[${i}].description\`.`,
      criteria: JOB_LEVELS,
    };
    questions[`rel${i}`] = {
      type: "score",
      instructions: `How relevant is \`results[${i}]\` to a job seeker searching for \`${state.keywords}\`? (Location fit is scored by a separate question.) Judge by its title \`results[${i}].title\` and snippet \`results[${i}].description\`.`,
      criteria: REL_LEVELS,
    };
    questions[`loc${i}`] = {
      type: "score",
      instructions: `Where is \`results[${i}]\` located relative to the requested location \`${state.location}\`? Judge ONLY by location text in \`results[${i}].title\` and \`results[${i}].description\`.`,
      criteria: LOC_LEVELS,
    };
    questions[`live${i}`] = {
      type: "score",
      instructions: `Is \`results[${i}]\` likely still an open, accepting-applications posting? Judge ONLY by freshness signals in \`results[${i}].title\` and \`results[${i}].description\`.`,
      criteria: LIVE_LEVELS,
    };
  });
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${TYPESAFE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
  });
  if (!r.ok) throw new Error(`typesafe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return state.results.map((_, i) => ({
    i,
    job: j.answers?.[`job${i}`]?.score ?? null,
    rel: j.answers?.[`rel${i}`]?.score ?? null,
    loc: j.answers?.[`loc${i}`]?.score ?? null,
    live: j.answers?.[`live${i}`]?.score ?? null,
  }));
}

// ---- verify pass: fetch posting pages, re-score loc+live from real page content ----
// ponytail: crude tag-strip instead of a DOM parser; the model reads flattened text fine.
function pageText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 12000);
}

async function verifyPages(body) {
  const urls = (Array.isArray(body.urls) ? body.urls : []).slice(0, 10); // cap: one expand verifies the top 10
  const errs = [], pregone = [], picked = [];
  for (let i = 0; i < urls.length; i++) {
    let err = null, page = "", fin = urls[i], gone = false;
    try {
      const p = await fetch(urls[i], {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", Accept: "text/html" },
        redirect: "follow", signal: AbortSignal.timeout(10000),
      });
      fin = p.url || urls[i];
      if (!p.ok) err = `HTTP ${p.status}${p.status === 403 || p.status === 429 ? ", the site blocked the fetch" : ""}`;
      else {
        // layer 1, deterministic: a removed posting redirects to a board/list page, losing its
        // job-id path segment (greenhouse: .../jobs/678… → .../<company>?error=true). The "no
        // longer open" banner is client-rendered JS, so the URL — not the text — is the signal.
        const oSeg = new URL(urls[i]).pathname.split("/").filter(Boolean);
        const fSeg = new URL(fin).pathname.split("/").filter(Boolean);
        if (!fSeg.includes(oSeg[oSeg.length - 1])) gone = true;
        else {
          page = pageText(await p.text());
          if (page.length < 400) err = "page nearly empty, likely a bot check"; // challenge pages strip to a stub
        }
      }
    } catch (e) {
      err = /timeout|abort/i.test(String(e.cause?.name || e.message || e)) ? "timed out" : "network error";
    }
    if (err) errs[i] = err;
    else if (gone) pregone[i] = true;
    else picked.push({ oi: i, url: urls[i], fin, page });
    if (i < urls.length - 1) await new Promise((s) => setTimeout(s, 350)); // 1qps pacing between sites
  }
  const scores = [];
  for (let i = 0; i < urls.length; i++) scores.push({ i, ok: false, gone: false, err: errs[i], loc: null, live: null });
  pregone.forEach((_, i) => { scores[i] = { i, ok: true, gone: true, err: null, loc: null, live: 0 }; });
  if (picked.length) {
    const state = { keywords: body.keywords || "", location: body.location || "", query: "verified posting pages", results: picked.map((p) => ({ i: p.oi, url: p.url, final: p.fin, page: p.page })) };
    const questions = {};
    picked.forEach((p, idx) => {
      questions[`still${idx}`] = {
        type: "score",
        instructions: `The posting originally lived at \`results[${idx}].url\`; the fetch followed redirects and the page actually served is \`results[${idx}].final\`, whose text is \`results[${idx}].page\`. Is \`results[${idx}].page\` still an individual job posting page for that URL — its own title, description, apply option? If it instead shows a general board/list of jobs, a landing page, or a "role filled / no longer open" message, the posting is gone.`,
        criteria: JOB_LEVELS,
      };
      questions[`loc${idx}`] = {
        type: "score",
        instructions: `Based ONLY on this job posting page text \`results[${idx}].page\`, where is the position located relative to the requested location \`${state.location}\`?`,
        criteria: LOC_LEVELS,
      };
      questions[`live${idx}`] = {
        type: "score",
        instructions: `Is the posting at \`results[${idx}].url\` still open and accepting applications, judging by the fetched page \`results[${idx}].page\`? If the served page (\`results[${idx}].final\`) is a general board/list/landing page rather than the posting itself, the posting is gone — score 0. Look for banners like "no longer available", "expired", "closed for applications", and past closing dates.`,
        criteria: LIVE_LEVELS,
      };
    });
    const r = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST", headers: { Authorization: `Bearer ${TYPESAFE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: "jev-latest", questions }),
    });
    if (!r.ok) throw new Error(`typesafe ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    picked.forEach((p, idx) => {
      const still = j.answers?.[`still${idx}`]?.score ?? null;
      const gone = still != null && still < 2; // layer 2: page no longer shows the posting → dead
      scores[p.oi] = { i: p.oi, ok: true, gone, err: null, loc: j.answers?.[`loc${idx}`]?.score ?? null, live: gone ? 0 : j.answers?.[`live${idx}`]?.score ?? null };
    });
  }
  return scores;
}

const server = createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  try {
    const u = new URL(req.url, `http://x`);
    if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
      if (!existsSync(join(ROOT, "index.html"))) return send(404, { error: "index.html missing" });
      const html = readFileSync(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (req.method === "GET" && u.pathname === "/api/config")
      return send(200, { brave: !!BRAVE, typesafe: !!TYPESAFE });
    if (req.method === "GET" && u.pathname === "/api/platforms")
      return send(200, PLATFORMS);
    if (req.method === "GET" && u.pathname === "/api/count") {
      if (!BRAVE) return send(200, { disabled: true });
      return send(200, await braveSearch(u.searchParams.get("q") || "", BRAVE));
    }
    if (req.method === "POST" && u.pathname === "/api/ai") {
      if (!TYPESAFE) return send(200, { disabled: true });
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        n += c.length;
        if (n > 1e6) throw new Error("body too large");
        chunks.push(c);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!Array.isArray(body?.results) || !body.results.length) return send(200, { scores: [] });
      return send(200, { scores: await typesafeScores(body) });
    }
    if (req.method === "POST" && u.pathname === "/api/verify") {
      if (!TYPESAFE) return send(200, { disabled: true });
      const chunks = [];
      let n = 0;
      for await (const c of req) {
        n += c.length;
        if (n > 1e6) throw new Error("body too large");
        chunks.push(c);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!Array.isArray(body?.urls) || !body.urls.length) return send(200, { scores: [] });
      return send(200, { scores: await verifyPages(body) });
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(502, { error: String(e.message || e).slice(0, 200) });
  }
});

server.listen(PORT, () =>
  console.log(`ats-search-tool → http://localhost:${PORT}  brave:${BRAVE ? "on" : "off"}  typesafe:${TYPESAFE ? "on" : "off"}`)
);