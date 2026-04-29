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
const dryRun = process.argv.includes("--dry");

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

const out = raw.map((entry) => {
  const e = { ...entry };

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
  if (e.common_mistake.trim()) withMistake++;

  // Example: ensure <mark> is present where possible
  const before = e.example || "";
  const had = /<mark>/i.test(before);
  e.example = tryAutoMark(before, e.word);
  const has = /<mark>/i.test(e.example);
  if (had) exampleMarked++;
  else if (has) exampleAutoMarked++;
  else if (e.example) exampleStillUnmarked++;

  return e;
});

if (!dryRun) {
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
}

// ---------- Report ----------
console.log(`\nWrote ${out.length} entries → ${path.basename(OUT)}${dryRun ? " (DRY RUN)" : ""}\n`);

console.log("Macro themes:");
Object.keys(macroCount)
  .sort((a, b) => macroCount[b] - macroCount[a])
  .forEach((k) => console.log(`  ${k.padEnd(25)} ${macroCount[k]}`));

console.log(`\nExamples with <mark>: ${exampleMarked} pre-existing + ${exampleAutoMarked} auto-wrapped = ${exampleMarked + exampleAutoMarked} / ${out.length}`);
console.log(`Examples still without <mark>: ${exampleStillUnmarked}`);
console.log(`Entries with common_mistake: ${withMistake} / ${out.length}`);

if (unmappedThemes.size) {
  const sorted = [...unmappedThemes.entries()].sort((a, b) => b[1] - a[1]);
  const totalUnmapped = sorted.reduce((s, [, n]) => s + n, 0);
  console.log(`\nUnmapped raw themes (${totalUnmapped} entries → "Other"):`);
  sorted.slice(0, 30).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
  if (sorted.length > 30) console.log(`  ...and ${sorted.length - 30} more`);
}
