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
  "Unrelated to the searched role or location",
  "Same broad field but a different role",
  "Partially relevant to the searched role",
  "Relevant match for the searched role and location",
  "Strong direct match for the searched role and location",
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
      instructions: `How relevant is \`results[${i}]\` to a job seeker searching for \`${state.keywords}\`${state.location ? ` in \`${state.location}\`` : ""}? Judge by its title \`results[${i}].title\` and snippet \`results[${i}].description\`.`,
      criteria: REL_LEVELS,
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
  }));
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
    send(404, { error: "not found" });
  } catch (e) {
    send(502, { error: String(e.message || e).slice(0, 200) });
  }
});

server.listen(PORT, () =>
  console.log(`ats-search-tool → http://localhost:${PORT}  brave:${BRAVE ? "on" : "off"}  typesafe:${TYPESAFE ? "on" : "off"}`)
);