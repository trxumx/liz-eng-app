// Backfill missing translations / synonyms / examples in dictionary.json
// using a local Llama via Ollama-compatible API.
//
// Default target: Ollama at http://localhost:11434, model "llama3.1".
// Override with env vars:
//   OLLAMA_URL=http://localhost:11434
//   OLLAMA_MODEL=llama3.1:8b   (or llama3.1:70b etc.)
//
// Output: backfill_data.json — keyed by word, with whatever fields the
// model produced. _migrate.js merges this into the deployed dictionary.
//
// Resumable: skips words already present in backfill_data.json.
// Pass --force to regenerate everything.
// Pass --only=word1,word2 to limit the run.
// Pass --limit=N to cap how many entries to process this run.

const fs = require("fs");
const path = require("path");

const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const TEMPERATURE  = parseFloat(process.env.TEMPERATURE || "0.2");
const TIMEOUT_MS   = parseInt(process.env.TIMEOUT_MS  || "60000", 10);

const DICT_PATH    = path.join(__dirname, "dictionary.json");
const BACKFILL_PATH = path.join(__dirname, "backfill_data.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const onlyArg = args.find((a) => a.startsWith("--only="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const onlyWords = onlyArg
  ? new Set(onlyArg.split("=")[1].split(",").map((s) => s.trim().toLowerCase()))
  : null;

// ---------- Helpers ----------
function loadJSON(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) {
    console.error(`Could not parse ${p}:`, e.message);
    return fallback;
  }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function needs(entry) {
  return {
    needT: !(Array.isArray(entry.translations) && entry.translations[0] && entry.translations[0].trim()),
    needS: !(Array.isArray(entry.synonyms)     && entry.synonyms[0]     && entry.synonyms[0].trim()),
    needE: !(entry.example && entry.example.trim()),
    noMark: !!entry.example && !/<mark>/i.test(entry.example),
  };
}

const SYSTEM_PROMPT = `You are an English-Russian lexicographer filling in a vocabulary deck for a Russian-speaking student.

You output ONLY a single JSON object — never any prose, never markdown, never code fences.

CRITICAL — translations must be SEMANTICALLY ACCURATE:
- The English synonyms provided in the user message are the ground truth for the headword's meaning.
  Your Russian translations must be direct dictionary equivalents of those synonyms.
- If you are not confident about an exact translation, stick to the safest, most common one and provide fewer entries (one is fine).
- DO NOT invent translations that share spelling or sound but not meaning.
  Example: "amorphous" is NEVER "бесполый" (that is "asexual").
  Example: "ameliorate" means "to improve", NEVER "to fix" (исправить implies repairing a defect).

Rules:
- "translations" — 1-3 Russian translations, Cyrillic only, no transliteration, no English fallback, lowercase first letter, matching the headword's part of speech.
- "synonyms"    — 2-3 English near-synonyms, all lowercase.
- "example"     — one short sentence written in ENGLISH (no Cyrillic letters), 6-15 words, natural. The headword must appear exactly once, surrounded by <mark>…</mark>, in the same form (or a close inflection of) the headword.
- No commentary, no extra fields.

Examples of good output:

Headword "abundant" (synonyms: plentiful, ample, copious):
{"translations":["обильный","изобильный","богатый"],"synonyms":["plentiful","ample","copious"],"example":"The orchard was <mark>abundant</mark> with ripe apples."}

Headword "amorphous" (synonyms: shapeless, formless, indeterminate):
{"translations":["бесформенный","аморфный","расплывчатый"],"synonyms":["shapeless","formless","vague"],"example":"The clay started as an <mark>amorphous</mark> blob in his hands."}

Headword "rejuvenated" (synonyms: refreshed, revitalized, renewed):
{"translations":["омолодившийся","посвежевший"],"synonyms":["refreshed","revitalized","renewed"],"example":"After the holiday she felt completely <mark>rejuvenated</mark>."}

Headword "came across" (synonyms: encountered, stumbled upon, found):
{"translations":["наткнуться","случайно встретить"],"synonyms":["encountered","stumbled upon","found"],"example":"I <mark>came across</mark> an old photograph in the attic."}`;

function buildPrompt(entry) {
  const n = needs(entry);
  const have = [];
  if (entry.transcription) have.push(`IPA: ${entry.transcription}`);
  if (entry.synonyms?.[0]) have.push(`Existing synonyms: ${entry.synonyms.slice(0,5).join(", ")}`);
  if (entry.example)       have.push(`Existing example: ${entry.example.replace(/<\/?mark>/g, "")}`);
  if (entry.translations?.[0]) have.push(`Existing translations: ${entry.translations.join(", ")}`);

  const want = [];
  if (n.needT) want.push('"translations"');
  if (n.needS) want.push('"synonyms"');
  if (n.needE || n.noMark) want.push('"example"');

  return `HEADWORD: "${entry.word}"
${have.join("\n")}

Produce a JSON object with these fields: ${want.join(", ")}.
You may also include the other fields if you have a clearly better suggestion than what already exists.`;
}

function extractJSON(text) {
  if (!text) return null;
  // Trim surrounding code fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(text); } catch (e) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (e) {}
  }
  return null;
}

async function callLlama(prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",                 // Ollama JSON mode
        options: { temperature: TEMPERATURE },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: prompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${await resp.text().catch(()=>'')}`);
    const json = await resp.json();
    return json.message?.content || json.response || "";
  } finally {
    clearTimeout(t);
  }
}

// ---------- Validation / merging ----------
function isCyrillic(s) {
  return typeof s === "string" && /[а-яё]/i.test(s);
}

function validate(filled, headword) {
  if (!filled || typeof filled !== "object") return null;
  const out = {};

  if (Array.isArray(filled.translations)) {
    const cleaned = filled.translations
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0 && t.toLowerCase() !== headword.toLowerCase())
      .filter(isCyrillic)        // must be Russian
      .slice(0, 3);
    if (cleaned.length) out.translations = cleaned;
  }

  if (Array.isArray(filled.synonyms)) {
    const cleaned = filled.synonyms
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0 && s.toLowerCase() !== headword.toLowerCase())
      .filter((s) => !isCyrillic(s))   // must NOT be Russian
      .slice(0, 4);
    if (cleaned.length) out.synonyms = cleaned;
  }

  if (typeof filled.example === "string" && filled.example.trim()) {
    let ex = filled.example.trim();

    // Reject any Russian-language example outright. The deck is for
    // a Russian speaker learning English — examples must be English.
    if (isCyrillic(ex)) {
      // skip
    } else {
      // Ensure <mark> wraps the headword (try whole-word match first)
      if (!/<mark>/i.test(ex)) {
        const re = new RegExp(`\\b(${headword.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")})\\b`, "i");
        if (re.test(ex)) ex = ex.replace(re, "<mark>$1</mark>");
      }
      // The <mark>…</mark> contents must themselves not be Russian
      // (catches transliterations like <mark>амелиорировать</mark>).
      const markMatch = ex.match(/<mark>([^<]*)<\/mark>/i);
      if (markMatch && !isCyrillic(markMatch[1])) {
        out.example = ex;
      }
    }
  }

  return Object.keys(out).length ? out : null;
}

// ---------- Main ----------
async function main() {
  const dict = loadJSON(DICT_PATH, null);
  if (!Array.isArray(dict)) {
    console.error("dictionary.json not found or not an array. Run `node _migrate.js` first.");
    process.exit(1);
  }
  const backfill = loadJSON(BACKFILL_PATH, {});

  // Re-validate existing entries against the current rules. If anything
  // becomes invalid (e.g. Russian-language example slipped in earlier),
  // drop just the bad fields so they get regenerated on this run.
  let scrubbed = 0;
  for (const word of Object.keys(backfill)) {
    const cleaned = validate(backfill[word], word);
    if (!cleaned) {
      delete backfill[word];
      scrubbed++;
    } else {
      // Track field-level drops too
      const before = Object.keys(backfill[word] || {}).length;
      const after = Object.keys(cleaned).length;
      if (after < before) scrubbed++;
      backfill[word] = cleaned;
    }
  }
  if (scrubbed) {
    saveJSON(BACKFILL_PATH, backfill);
    console.log(`Scrubbed ${scrubbed} stale/invalid entr${scrubbed === 1 ? "y" : "ies"} from ${path.basename(BACKFILL_PATH)} — they will be retried.`);
  }

  // Health check the endpoint
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name);
    console.log(`Ollama OK at ${OLLAMA_URL} · models loaded: ${names.join(", ") || "(none)"}`);
    if (names.length && !names.some((n) => n.startsWith(OLLAMA_MODEL.split(":")[0]))) {
      console.warn(`Warning: ${OLLAMA_MODEL} not in the loaded list. The first request will pull it.`);
    }
  } catch (e) {
    console.error(`Cannot reach Ollama at ${OLLAMA_URL}: ${e.message}`);
    console.error("Start it with:  ollama serve     (then `ollama pull llama3.1` if needed)");
    process.exit(1);
  }

  // Build queue
  let queue = dict.filter((e) => {
    if (onlyWords && !onlyWords.has(e.word.toLowerCase())) return false;
    const n = needs(e);
    if (!(n.needT || n.needS || n.needE || n.noMark)) return false;
    if (!force && backfill[e.word]) return false;
    return true;
  });
  if (!Number.isFinite(limit)) {
    console.log(`Queue: ${queue.length} entries`);
  } else {
    queue = queue.slice(0, limit);
    console.log(`Queue: ${queue.length} entries (capped by --limit)`);
  }

  let ok = 0, fail = 0, t0 = Date.now();
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    const tag = `[${i + 1}/${queue.length}]`;
    process.stdout.write(`${tag} ${entry.word.padEnd(28)} ... `);

    let raw = "", parsed = null, validated = null;
    let attempt = 0;
    while (attempt < 2 && !validated) {
      attempt++;
      try {
        raw = await callLlama(buildPrompt(entry));
        parsed = extractJSON(raw);
        validated = validate(parsed, entry.word);
      } catch (e) {
        process.stdout.write(`(attempt ${attempt} err: ${e.message}) `);
      }
    }

    if (validated) {
      backfill[entry.word] = validated;
      ok++;
      const fields = Object.keys(validated).join(",");
      console.log(`OK [${fields}]`);
    } else {
      fail++;
      console.log(`FAIL`);
    }

    // Save every 10 entries so progress survives interruption
    if ((i + 1) % 10 === 0) saveJSON(BACKFILL_PATH, backfill);
  }

  saveJSON(BACKFILL_PATH, backfill);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${ok} ok, ${fail} failed in ${dt}s. Wrote ${path.basename(BACKFILL_PATH)} (${Object.keys(backfill).length} total entries).`);
  console.log("Run `node _migrate.js` to merge into dictionary.json.");
}

main().catch((e) => { console.error(e); process.exit(1); });
