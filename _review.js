// Review helper: prints every backfilled entry side-by-side with the
// English synonyms, so semantic mismatches are easy to spot.
//
// Usage:
//   node _review.js               # print everything in backfill_data.json
//   node _review.js --suspect     # only show entries flagged as suspect
//   node _review.js --word=xyz    # one entry, full detail
//   node _review.js --edit        # open backfill_data.json in $EDITOR after listing

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DICT_PATH     = path.join(__dirname, "dictionary.json");
const BACKFILL_PATH = path.join(__dirname, "backfill_data.json");

const args = process.argv.slice(2);
const onlySuspect = args.includes("--suspect");
const wordArg = args.find((a) => a.startsWith("--word="));
const targetWord = wordArg ? wordArg.split("=")[1].trim().toLowerCase() : null;
const edit = args.includes("--edit");

function load(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

const dict = load(DICT_PATH) || [];
const backfill = load(BACKFILL_PATH) || {};
const dictByWord = new Map(dict.map((e) => [e.word, e]));

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREY   = "\x1b[90m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function pad(s, n) {
  // crude visual-width pad (assumes 1 cell per cyrillic/latin char)
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

// Heuristic suspect detection
function suspectFlags(word, fill, dictEntry) {
  const flags = [];
  const trans = fill.translations || [];
  const syns  = (dictEntry?.synonyms?.length ? dictEntry.synonyms : fill.synonyms) || [];

  // No translations at all
  if (!trans.length) flags.push("no-translations");

  // Suspiciously long translation (likely a paraphrase, not a word)
  for (const t of trans) {
    if (t.split(/\s+/).length >= 4) flags.push(`wordy: "${t}"`);
  }

  // Translation contains the headword (transliteration sneak-by)
  for (const t of trans) {
    const tLower = t.toLowerCase();
    if (tLower.includes(word.toLowerCase()) && /[a-z]/.test(tLower)) {
      flags.push(`latin chars in: "${t}"`);
    }
  }

  // Example missing or no <mark>
  if (fill.example !== undefined) {
    if (!/<mark>/i.test(fill.example)) flags.push("example without <mark>");
    if (/[а-яё]/i.test(fill.example))  flags.push("example contains Cyrillic");
  }

  return flags;
}

function show(word, fill, dictEntry) {
  const trans = (fill.translations || []).join(", ");
  const synonyms = ((dictEntry?.synonyms?.length ? dictEntry.synonyms : fill.synonyms) || []).join(", ");
  const flags = suspectFlags(word, fill, dictEntry);

  const isFlag = flags.length > 0;
  const headColor = isFlag ? RED + BOLD : BOLD;

  process.stdout.write(`${headColor}${pad(word, 24)}${RESET} `);
  process.stdout.write(`${pad(trans, 50)}  `);
  process.stdout.write(`${GREY}${synonyms}${RESET}\n`);
  if (fill.example) {
    process.stdout.write(`  ${GREY}↳${RESET} ${fill.example}\n`);
  }
  if (isFlag) {
    process.stdout.write(`  ${YELLOW}⚠ ${flags.join(" · ")}${RESET}\n`);
  }
}

if (targetWord) {
  const fill = backfill[targetWord];
  if (!fill) {
    console.log(`No backfill entry for "${targetWord}".`);
    process.exit(0);
  }
  console.log(`${BOLD}${targetWord}${RESET}`);
  console.log(JSON.stringify(fill, null, 2));
  const flags = suspectFlags(targetWord, fill, dictByWord.get(targetWord));
  if (flags.length) console.log(`${YELLOW}⚠ ${flags.join(" · ")}${RESET}`);
  process.exit(0);
}

const entries = Object.entries(backfill);
let suspectCount = 0;

console.log(`${BOLD}${pad("WORD", 24)} ${pad("RUSSIAN TRANSLATIONS", 50)}  ENGLISH SYNONYMS${RESET}`);
console.log("─".repeat(110));

for (const [word, fill] of entries.sort()) {
  const flags = suspectFlags(word, fill, dictByWord.get(word));
  if (flags.length) suspectCount++;
  if (onlySuspect && flags.length === 0) continue;
  show(word, fill, dictByWord.get(word));
}

console.log("─".repeat(110));
console.log(`Total backfilled: ${entries.length} · flagged as suspect: ${suspectCount}`);

if (edit) {
  const editor = process.env.EDITOR || "vi";
  console.log(`Opening ${BACKFILL_PATH} in ${editor}…`);
  spawnSync(editor, [BACKFILL_PATH], { stdio: "inherit" });
}
