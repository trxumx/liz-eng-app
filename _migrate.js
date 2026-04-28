// One-shot migration: adds `theme` and `common_mistake` to dictionary.json
// Run with: node _migrate.js
// Safe to re-run: existing values are preserved unless --force is passed.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "dictionary.json");
const force = process.argv.includes("--force");

const themes = {
  "tumultuous": "Emotions",
  "whirlwind": "Relationships",
  "abnormally": "Personality",
  "the show aired": "Media & Business",
  "call out": "Society",
  "mass appeal": "Media & Business",
  "grip": "Abstract",
  "ash": "Beauty",
  "inflated": "Personality",
  "spouse": "Relationships",
  "superiority": "Personality",
  "feels off-putting": "Emotions",
  "the outlet": "Media & Business",
  "pitched as": "Media & Business",
  "ditzy": "Personality",
  "bleaching": "Beauty",
  "highlighting": "Beauty",
  "psyop": "Society",
  "connotation": "Ideas & Science",
  "youthfulness": "Beauty",
  "cite": "Ideas & Science",
  "bleaches": "Beauty",
  "cherished": "Emotions",
  "ends of the spectrum": "Ideas & Science",
  "morally loaded": "Society",
  "paragon": "Personality",
  "endured": "Abstract",
  "emblem": "Society",
  "chicness": "Fashion",
  "blondness": "Beauty",
  "woven fabrics": "Fashion",
  "draped": "Fashion",
  "heralded": "Society",
  "outbreak": "Conflict & History",
  "conscription": "Conflict & History",
  "retained": "Abstract",
  "upturned": "Abstract",
  "forbidding": "Personality",
  "dormant": "Abstract",
  "marvellous": "Emotions",
  "haute couture": "Fashion",
  "defiance": "Personality",
  "hourglass figure": "Beauty",
  "revival": "Society",
  "segued into": "Abstract",
  "staple": "Fashion",
  "bodice": "Fashion",
  "contoured": "Fashion",
  "tyrannical": "Personality",
  "chemise dress": "Fashion",
  "demeanour": "Personality",
  "overturned": "Society",
  "advent": "Society",
  "mustard": "Beauty",
  "ginger": "Beauty",
  "redefining": "Society",
  "misfits": "Society",
  "hippies": "Society",
  "skimpy": "Fashion",
  "carapace": "Fashion",
  "buckled": "Fashion",
  "insertion": "Fashion",
  "interchangeable": "Abstract",
  "pantyhose": "Fashion",
  "seduction": "Relationships",
  "infiltrated": "Society",
  "sprang up": "Society",
  "periphery": "Society",
  "midriffs": "Beauty",
  "contours": "Beauty",
  "exacerbated": "Emotions",
  "consolidate": "Media & Business",
  "post-war regeneration": "Conflict & History",
  "stature": "Personality",
  "promulgated": "Society",
  "taupe": "Beauty",
  "beige": "Beauty",
  "ivory": "Beauty",
  "flattering": "Beauty",
  "embodied": "Personality",
  "voluptuous": "Beauty",
  "bricolage": "Fashion",
  "promulgation": "Society",
  "rejuvenated": "Society",
  "tweed suit": "Fashion",
  "behemoths": "Media & Business",
  "conglomerate": "Media & Business",
  "merger": "Media & Business",
  "break down": "Ideas & Science",
  "mind-bending": "Ideas & Science",
  "falls into": "Ideas & Science",
  "came into being": "Ideas & Science",
  "came across": "Relationships",
  "on the same wavelength": "Relationships",
  "pushed me to": "Relationships",
};

const mistakes = {
  "the show aired": "Use 'aired' (past tense) — same form as the present.",
  "call out": "'Call out' (verb, two words) ≠ 'callout' (noun, an alert).",
  "grip": "'Grip' (firm hold) ≠ 'gripe' (a complaint).",
  "ash": "Hair-color sense — not the same as 'ashy' (describing dry skin).",
  "inflated": "'Inflated' (exaggerated) ≠ 'inflamed' (red and swollen).",
  "spouse": "Pronounced /spaʊs/ — like 'house', not 'spowze'.",
  "feels off-putting": "Hyphenated: 'off-putting', not 'offputting' or 'off putting'.",
  "the outlet": "Here = a media publication, NOT an electrical socket.",
  "ditzy": "Sometimes spelled 'ditsy' — both accepted.",
  "highlighting": "In hair: streaks of lighter color — not just 'emphasizing'.",
  "psyop": "Short for 'psychological operation'. Pronounced /ˈsaɪɒp/.",
  "connotation": "'Connotation' (implied meaning) ≠ 'denotation' (literal meaning).",
  "cite": "'Cite' ≠ 'site' (place) ≠ 'sight' (vision). All sound the same.",
  "endured": "'Endured' (lasted) ≠ 'ensured' (made certain).",
  "chicness": "Spelled 'chicness'; pronounced /ˈʃiːknəs/.",
  "blondness": "British: 'blonde' (♀), 'blond' (♂). American: 'blond' for both.",
  "heralded": "'Heralded' (announced) ≠ 'herded' (drove animals).",
  "outbreak": "'Outbreak' (sudden start, e.g. of war) ≠ 'outburst' (sudden show of emotion).",
  "conscription": "'Conscription' (military draft) ≠ 'conscientious' (careful, thorough).",
  "forbidding": "'Forbidding' (intimidating) ≠ 'foreboding' (sense of coming evil).",
  "dormant": "'Dormant' (inactive but alive) ≠ 'extinct' (gone forever).",
  "marvellous": "British 'marvellous' = American 'marvelous' (one L).",
  "haute couture": "Pronounced /ˌəʊt kuːˈtjʊə/ — silent 'h'.",
  "defiance": "'Defiance' (resistance) ≠ 'deviance' (departure from a norm).",
  "segued into": "Pronounced /ˈseɡweɪd/. Often misspelled 'segwayed'.",
  "staple": "'Staple' (essential item) ≠ 'stapler' (the tool).",
  "bodice": "'Bodice' (top of a dress) ≠ 'bodies' (plural of body).",
  "demeanour": "British 'demeanour' = American 'demeanor'.",
  "advent": "'Advent' (arrival) ≠ 'advert' (an advertisement).",
  "ginger": "Can mean the spice OR red hair (UK slang for redhead).",
  "hippies": "Plural of 'hippie' (the person). 'Hippy' as adjective = having wide hips.",
  "buckled": "Two senses: 'buckled' (fastened) and 'buckled' (collapsed under pressure).",
  "pantyhose": "Plural-form noun: 'a pair of pantyhose', not 'a pantyhose'.",
  "sprang up": "Past tense is 'sprang' (preferred) or 'sprung' (also accepted).",
  "periphery": "'Periphery' (noun: the edge) ≠ 'peripheral' (adjective).",
  "exacerbated": "'Exacerbated' (made worse) ≠ 'exasperated' (extremely annoyed). Very common mix-up.",
  "post-war regeneration": "Note the hyphen: 'post-war', not 'postwar' (in British English).",
  "stature": "'Stature' (status/height) ≠ 'statue' (sculpture) ≠ 'statute' (law).",
  "taupe": "Pronounced /təʊp/ — like 'tope', not 'tow-pay'.",
  "beige": "Pronounced /beɪʒ/ — like 'baizh', not 'beig'.",
  "flattering": "'Flattering' (looks good) ≠ 'flattening' (making flat).",
  "voluptuous": "Spelling: vo-lup-tu-ous. A common typo is 'voluptous'.",
  "bricolage": "French origin. Pronounced /ˌbrɪkəˈlɑːʒ/, not 'brick-o-lage'.",
  "behemoths": "Pronounced /bɪˈhiːməθs/. Note the silent 'h' is optional.",
  "break down": "'Break down' (verb, two words) ≠ 'breakdown' (noun, one word).",
  "mind-bending": "Hyphenated when used as an adjective: 'mind-bending ideas'.",
  "came across": "Two senses: 'came across X' = found by chance, OR = gave a certain impression.",
};

const dict = JSON.parse(fs.readFileSync(FILE, "utf8"));

let added = 0, kept = 0, missing = [];
for (const entry of dict) {
  const key = entry.word;
  const t = themes[key];
  if (!t) missing.push(key);

  if (force || entry.theme === undefined) {
    entry.theme = t || "Abstract";
    added++;
  } else {
    kept++;
  }
  if (force || entry.common_mistake === undefined) {
    entry.common_mistake = mistakes[key] || "";
  }
}

fs.writeFileSync(FILE, JSON.stringify(dict, null, 2) + "\n");

console.log(`Updated ${added} entries (kept ${kept} existing).`);
if (missing.length) {
  console.log(`No theme mapping for ${missing.length} entr${missing.length === 1 ? "y" : "ies"} — defaulted to "Abstract":`);
  missing.forEach((w) => console.log("  -", w));
}
