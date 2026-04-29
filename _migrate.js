// Consolidate the raw dictionary at dict/dictionary.json into the deployed
// dictionary at ./dictionary.json:
//   - 129+ free-form themes -> ~14 macro themes via the THEME_MAP below.
//   - Anything not in the map (or empty) goes to "Other".
//   - When `example` does not contain a <mark> tag, we try to wrap the
//     headword in <mark>...</mark> using a case-insensitive whole-word match.
//
// Run:  node _migrate.js
// Use --dry to inspect without writing.

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "dict", "dictionary.json");
const OUT = path.join(__dirname, "dictionary.json");
const BACKFILL = path.join(__dirname, "backfill_data.json");
const dryRun = process.argv.includes("--dry");

// Optional: model-generated fill-ins. Loaded if present.
let backfill = {};
if (fs.existsSync(BACKFILL)) {
  try {
    backfill = JSON.parse(fs.readFileSync(BACKFILL, "utf8"));
  } catch (e) {
    console.warn(`Warning: ${path.basename(BACKFILL)} exists but is invalid JSON: ${e.message}`);
  }
}

// ---------- Theme consolidation ----------
// Lowercase keys, normalized whitespace and slash. Anything not here -> "Other".
const THEME_MAP = {
  // --- Emotions ---
  "emotions": "Emotions",
  "emotion": "Emotions",
  "emotion difficulty": "Emotions",
  "emotional and psychological issues": "Emotions",
  "feeling sadness and remorse": "Emotions",
  "contentment fulfillment": "Emotions",
  "contentment": "Emotions",
  "pride": "Emotions",
  "thought feeling": "Emotions",
  "self-assurance": "Emotions",
  "self assurance": "Emotions",
  "sudden desire or change of mind especially one that is unusual or unexplained": "Emotions",
  "to protect and care for someone lovingly": "Emotions",

  // --- Personality ---
  "personality": "Personality",
  "behavior": "Personality",
  "action behavior": "Personality",
  "attitude or appearance": "Personality",
  "characteristics": "Personality",
  "description characteristics": "Personality",
  "description": "Personality",
  "conformity": "Personality",
  "dedication loyalty": "Personality",
  "discretion": "Personality",
  "gentle and kindly": "Personality",
  "harmlessness": "Personality",
  "well-meaning and kindly": "Personality",
  "well meaning and kindly": "Personality",

  // --- Relationships ---
  "relationships": "Relationships",
  "social relationships": "Relationships",
  "social etiquette and relationships": "Relationships",
  "social norms": "Relationships",
  "meeting overlap": "Relationships",
  "to come together to form one mass or whole": "Relationships",

  // --- Society ---
  "society": "Society",
  "politics and law": "Society",
  "politics and tradition": "Society",
  "law and finance": "Society",
  "law and order": "Society",
  "ethics values": "Society",
  "morality": "Society",
  "responsibility and accountability": "Society",
  "officially or legally prohibit something": "Society",
  "official recommended": "Society",
  "formal situations": "Society",
  "clear (someone) of blame or suspicion": "Society",

  // --- Business ---
  "business economics": "Business",
  "business or teamwork": "Business",
  "media & business": "Business",
  "media business": "Business",
  "financial and economic issues": "Business",
  "manufacturing and industry": "Business",
  "money": "Business",
  "practicality assistance": "Business",
  "practicality": "Business",

  // --- Communication ---
  "communication": "Communication",
  "language and communication": "Communication",
  "language and vocabulary": "Communication",
  "argument and language": "Communication",
  "seeking information and clarification": "Communication",
  "interrupt insert": "Communication",
  "adding to something": "Communication",

  // --- Knowledge & Science ---
  "ideas & science": "Knowledge & Science",
  "ideas science": "Knowledge & Science",
  "cognition": "Knowledge & Science",
  "knowledge and skill": "Knowledge & Science",
  "skill or expertise": "Knowledge & Science",
  "science research": "Knowledge & Science",
  "science and technology": "Knowledge & Science",
  "science": "Knowledge & Science",
  "mathematics": "Knowledge & Science",
  "computer science": "Knowledge & Science",
  "psychology and education": "Knowledge & Science",
  "psychology and human behavior": "Knowledge & Science",
  "memory and perception": "Knowledge & Science",
  "perception": "Knowledge & Science",
  "the senses": "Knowledge & Science",
  "speculation": "Knowledge & Science",
  "planning and invention": "Knowledge & Science",
  "planning organization": "Knowledge & Science",

  // --- Art & Culture ---
  "art": "Art & Culture",
  "art and design": "Art & Culture",
  "architecture and engineering": "Art & Culture",
  "creativity": "Art & Culture",
  "film": "Art & Culture",
  "literature": "Art & Culture",
  "literary analysis": "Art & Culture",
  "fashion": "Art & Culture",

  // --- Action & Events ---
  "action": "Action & Events",
  "action event": "Action & Events",
  "actions and events": "Action & Events",
  "verbs": "Action & Events",
  "disturbance": "Action & Events",
  "disaster and emergency": "Action & Events",
  "conflict & history": "Action & Events",
  "war and peace": "Action & Events",
  "to go past or around something": "Action & Events",
  "to attract and hold interest and attention": "Action & Events",
  "to see or observe something": "Action & Events",
  "secrecy": "Action & Events",
  "security investigation": "Action & Events",
  "separation": "Action & Events",

  // --- Time & Place ---
  "time sequence": "Time & Place",
  "time": "Time & Place",
  "direction opinion approach": "Time & Place",
  "direction": "Time & Place",
  "travel": "Time & Place",
  "geography and environment": "Time & Place",
  "weather and environment": "Time & Place",

  // --- Beauty ---
  "beauty": "Beauty",
  "appearance vs reality": "Beauty",

  // --- Evaluation ---
  "evaluation": "Evaluation",
  "praise and criticism": "Evaluation",
  "approval": "Evaluation",
  "challenge": "Evaluation",
  "importance relevance": "Evaluation",
  "interest curiosity": "Evaluation",
  "lack of significance influence": "Evaluation",
  "quantity importance": "Evaluation",
  "size amount location": "Evaluation",
  "occurring found or done often prevalent": "Evaluation",
  "fundamentally different or distinct in nature kind or quality": "Evaluation",
  "combining well together and enhancing each other's qualities": "Evaluation",
  "combining well together and enhancing each others qualities": "Evaluation",
  "the quality of being rough or harsh": "Evaluation",
  "ease": "Evaluation",
  "effect advantage": "Evaluation",
  "not familiar or recognized not known or identified": "Evaluation",
  "careful watch for possible danger or difficulties": "Evaluation",

  // --- State & Well-being ---
  "state well-being": "State & Well-being",
  "state well being": "State & Well-being",
  "personal growth development": "State & Well-being",
  "progress": "State & Well-being",
  "truth": "State & Well-being",
  "abstract": "State & Well-being",
  "adverbs": "State & Well-being",
  "em": "State & Well-being",
};

function normalizeKey(t) {
  return (t || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\/]/g, " ")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ");
}

function consolidateTheme(raw) {
  if (!raw) return { macro: "Other", reason: "missing" };
  const key = normalizeKey(raw);
  if (THEME_MAP[key]) return { macro: THEME_MAP[key], reason: "mapped" };
  // Fallback: comma-separated compound theme like "Action, Separation".
  // Try each part; first hit wins.
  if (/[,;]/.test(raw)) {
    for (const part of raw.split(/[,;]/)) {
      const k = normalizeKey(part);
      if (k && THEME_MAP[k]) return { macro: THEME_MAP[k], reason: "mapped-split" };
    }
  }
  return { macro: "Other", reason: "unmapped" };
}

// ---------- Auto-mark example ----------
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tryAutoMark(example, headword) {
  if (!example) return example;
  if (/<mark>/i.test(example)) return example; // already marked
  if (!headword) return example;

  // Try whole-word case-insensitive match of the headword as written
  const re = new RegExp(`\\b(${escapeRegex(headword)})\\b`, "i");
  if (re.test(example)) {
    return example.replace(re, "<mark>$1</mark>");
  }

  // Fall back: for multi-word phrases, look for stem (drop trailing s/ed/ing)
  const stem = headword.replace(/(ies|es|s|ed|ing)$/i, "");
  if (stem && stem.length >= 4 && stem !== headword) {
    const re2 = new RegExp(`\\b(${escapeRegex(stem)}\\w*)\\b`, "i");
    if (re2.test(example)) {
      return example.replace(re2, "<mark>$1</mark>");
    }
  }
  return example; // give up
}

// ---------- String normalization ----------
function lcFirst(s) {
  if (!s || typeof s !== "string") return s;
  return s[0].toLowerCase() + s.slice(1);
}

function cleanString(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim();
}

// Strip a known theme name glued to the end of an example without
// proper sentence punctuation. Conservative: only strips if the
// remaining text is itself unpunctuated (i.e. clearly fragment + theme).
const APPENDED_THEME_NAMES = [
  "war and peace", "law and order", "praise and criticism",
  "the senses", "size, amount, location", "size amount location",
  "politics and tradition", "knowledge and skill", "argument and language",
];
function stripGluedTheme(example) {
  if (!example) return example;
  const trimmed = example.trim();
  // If example ends with sentence punctuation, leave it alone
  if (/[.!?…]\s*$/.test(trimmed)) return example;
  for (const t of APPENDED_THEME_NAMES) {
    const re = new RegExp(`\\s+${escapeRegex(t)}\\s*$`, "i");
    if (re.test(trimmed)) {
      const stripped = trimmed.replace(re, "").trim();
      if (stripped.length >= 3) return stripped;
    }
  }
  return example;
}

// ---------- Run ----------
if (!fs.existsSync(SRC)) {
  console.error(`Source not found: ${SRC}`);
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
if (!Array.isArray(raw)) {
  console.error("Source dictionary is not an array");
  process.exit(1);
}

const macroCount = {};
const unmappedThemes = new Map(); // raw theme -> count
let withMistake = 0;
let exampleMarked = 0;
let exampleAutoMarked = 0;
let exampleStillUnmarked = 0;

let stripped = 0;
let backfilledTrans = 0, backfilledSyn = 0, backfilledEx = 0;

const out = raw.map((entry) => {
  const e = { ...entry };

  // Word: lowercase, trim
  e.word = cleanString((e.word || "").toLowerCase());

  // Transcription
  e.transcription = cleanString(e.transcription || "");

  // Sentiment: keep as-is, default to Neutral
  if (!["Positive", "Negative", "Neutral"].includes(e.sentiment)) {
    e.sentiment = "Neutral";
  }

  // Translations: array of cleaned strings, drop empties, lowercase first letter
  e.translations = Array.isArray(e.translations)
    ? e.translations.map((t) => cleanString(lcFirst(t))).filter(Boolean)
    : [];

  // Synonyms: same treatment
  e.synonyms = Array.isArray(e.synonyms)
    ? e.synonyms.map((s) => cleanString(lcFirst(s))).filter(Boolean)
    : [];

  // Backfill from model-generated data (only fills gaps, never overrides)
  const fill = backfill[e.word];
  if (fill) {
    if (e.translations.length === 0 && Array.isArray(fill.translations) && fill.translations.length) {
      e.translations = fill.translations.map((t) => cleanString(lcFirst(t))).filter(Boolean);
      backfilledTrans++;
    }
    if (e.synonyms.length === 0 && Array.isArray(fill.synonyms) && fill.synonyms.length) {
      e.synonyms = fill.synonyms.map((s) => cleanString(lcFirst(s))).filter(Boolean);
      backfilledSyn++;
    }
    if ((!e.example || !e.example.trim()) && typeof fill.example === "string" && fill.example.trim()) {
      e.example = cleanString(fill.example);
      backfilledEx++;
    }
  }

  // meanings_count: prefer recorded, else use translations.length
  e.meanings_count = typeof e.meanings_count === "number" && e.meanings_count > 0
    ? e.meanings_count
    : (e.translations.length || 1);

  // Example: strip glued theme, then ensure <mark>
  const exBefore = e.example || "";
  const exStripped = stripGluedTheme(exBefore);
  if (exStripped !== exBefore) stripped++;
  const had = /<mark>/i.test(exStripped);
  e.example = tryAutoMark(exStripped, e.word);
  const has = /<mark>/i.test(e.example);
  if (had) exampleMarked++;
  else if (has) exampleAutoMarked++;
  else if (e.example) exampleStillUnmarked++;

  // Theme
  const result = consolidateTheme(e.theme);
  if (result.reason === "unmapped") {
    const k = (e.theme || "(empty)").toString();
    unmappedThemes.set(k, (unmappedThemes.get(k) || 0) + 1);
  }
  e.theme = result.macro;
  macroCount[e.theme] = (macroCount[e.theme] || 0) + 1;

  // Common mistake (just normalize to string)
  if (typeof e.common_mistake !== "string") e.common_mistake = "";
  e.common_mistake = e.common_mistake.replace(/\s+/g, " ").trim();
  if (e.common_mistake) withMistake++;

  return e;
});

// De-duplicate by word: keep the entry with the most filled fields
const byWord = new Map();
for (const e of out) {
  const score = (e.translations.length ? 4 : 0) + (e.synonyms.length ? 2 : 0) + (e.example ? 1 : 0) + (e.common_mistake ? 1 : 0);
  const prev = byWord.get(e.word);
  if (!prev || score > prev.score) byWord.set(e.word, { entry: e, score });
}
const deduped = [...byWord.values()].map((x) => x.entry);
const removed = out.length - deduped.length;

if (!dryRun) {
  fs.writeFileSync(OUT, JSON.stringify(deduped, null, 2) + "\n");
}

// ---------- Report ----------
console.log(`\nWrote ${deduped.length} entries → ${path.basename(OUT)}${dryRun ? " (DRY RUN)" : ""}\n`);

const withTrans = deduped.filter((e) => e.translations.length > 0).length;
const withSyn = deduped.filter((e) => e.synonyms.length > 0).length;
const withEx = deduped.filter((e) => e.example).length;

console.log("Coverage:");
console.log(`  with translations: ${withTrans} / ${deduped.length}  (${Math.round(100*withTrans/deduped.length)}%)`);
console.log(`  with synonyms:     ${withSyn} / ${deduped.length}  (${Math.round(100*withSyn/deduped.length)}%)`);
console.log(`  with example:      ${withEx} / ${deduped.length}  (${Math.round(100*withEx/deduped.length)}%)`);
console.log(`  with mistake note: ${withMistake} / ${deduped.length}`);
console.log(`  examples cleaned (theme suffix stripped): ${stripped}`);
console.log(`  duplicates removed: ${removed}`);
if (Object.keys(backfill).length) {
  console.log(`  backfill applied: +${backfilledTrans} translations, +${backfilledSyn} synonyms, +${backfilledEx} examples`);
}

console.log("\nMacro themes:");
Object.keys(macroCount)
  .sort((a, b) => macroCount[b] - macroCount[a])
  .forEach((k) => console.log(`  ${k.padEnd(25)} ${macroCount[k]}`));

console.log(`\nExamples with <mark>: ${exampleMarked} pre-existing + ${exampleAutoMarked} auto-wrapped`);
console.log(`Examples still without <mark>: ${exampleStillUnmarked}`);

if (unmappedThemes.size) {
  const sorted = [...unmappedThemes.entries()].sort((a, b) => b[1] - a[1]);
  const totalUnmapped = sorted.reduce((s, [, n]) => s + n, 0);
  console.log(`\nUnmapped raw themes (${totalUnmapped} entries → "Other"):`);
  sorted.slice(0, 30).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
  if (sorted.length > 30) console.log(`  ...and ${sorted.length - 30} more`);
}
