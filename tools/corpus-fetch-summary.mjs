// Fetch the fold→summary corpus into data/corpus/summary/ — four registers (academic
// texts, novels, news stories, chat histories), each a plain-text document the bench
// (tools/fold-summary-bench.mjs) parses with the engine's own parseText. Everything
// here is regenerable: run this tool again to refresh; the checked-in copies exist so
// the bench and tests run offline and byte-stable.
//
// The ARMSTRONG PROBE GROUP (`group: "armstrong"`) is the cross-source coreference
// fixture: Neil Armstrong and Louis Armstrong each discussed in several sources, in
// several registers, with same-surname family members (Janet, Lucille) inside single
// sources — the exact shape that once collapsed the two referents onto one entity
// (PR #196). The bench folds these sources together and measures that the fold keeps
// the referents apart.
//
// Sources and licenses:
//   · Project Gutenberg (public domain)      — academic texts and novels
//   · Wikinews, CC BY 2.5                    — news stories
//   · Wikipedia, CC BY-SA 4.0                — encyclopedic Armstrong lives (academic register)
//   · HuggingFace ultrachat_200k (MIT)       — chat histories (skipped, with a note, when
//                                              the datasets-server is unreachable)
//   · written-for-this-repo                  — the synthetic Armstrong chat fixture, which
//                                              no public corpus provides (a chat that
//                                              discusses BOTH Armstrongs, bare surname and
//                                              all). Marked synthetic in the manifest.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data', 'corpus', 'summary');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(1500 * 2 ** attempt);
    }
  }
}
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

// ── cleaners ─────────────────────────────────────────────────────────────────────────

// Strip the Project Gutenberg boilerplate; keep the work itself.
const stripGutenberg = (raw) => {
  let t = String(raw).replace(/\r\n/g, '\n');
  const start = t.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i);
  if (start >= 0) t = t.slice(t.indexOf('\n', start) + 1);
  const end = t.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if (end >= 0) t = t.slice(0, end);
  return t.trim();
};

// A readable excerpt: whole paragraphs from `fromPara`, until ~maxChars. The corpus
// wants documents a parse can cross in seconds, not whole books.
const excerpt = (text, { fromPara = 0, maxChars = 9000, skipShort = true } = {}) => {
  const paras = String(text).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p && !/^\[\d+\]/.test(p))                 // footnote apparatus, not prose
    .filter((p) => !skipShort || p.length > 40 || /[.!?]$/.test(p));
  const out = [];
  let n = 0;
  for (const p of paras.slice(fromPara)) {
    if (n + p.length > maxChars && out.length) break;
    out.push(p);
    n += p.length;
  }
  return out.join('\n\n');
};

// ── fetchers per register ────────────────────────────────────────────────────────────

const gutenberg = async (id, opts) => {
  const raw = await fetchText(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`);
  return excerpt(stripGutenberg(raw), opts);
};

const mediawikiExtract = async (host, title, { maxChars = 9000 } = {}) => {
  const url = `https://${host}/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  const j = await fetchJson(url);
  const pages = j?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) throw new Error(`no extract for ${title} on ${host}`);
  // Drop the MediaWiki section markers and the tail apparatus (Sources / Related news /
  // External links) — the bench reads prose, and deep reading already refuses apparatus.
  let t = page.extract.replace(/\r\n/g, '\n');
  const tail = t.search(/^==\s*(Sources|Related news|External links|References|See also)\s*==/im);
  if (tail >= 0) t = t.slice(0, tail);
  t = t.replace(/^==+\s*(.*?)\s*==+$/gm, '$1.');
  return excerpt(t, { maxChars, skipShort: false });
};

// Ubuntu IRC logs (public support-channel archives) — a REAL chat history: many voices,
// terse turns, topic drift. Join/part/rename noise is stripped; what remains is the
// conversation itself, "[time] <nick> text" per line.
const ircLog = async (date, channel = '#ubuntu', { maxChars = 8000, fromLine = 0 } = {}) => {
  const url = `https://irclogs.ubuntu.com/${date.replace(/-/g, '/')}/${encodeURIComponent(channel)}.txt`;
  const raw = await fetchText(url);
  const lines = raw.split('\n')
    .filter((l) => /^\[\d\d:\d\d\] </.test(l))              // spoken turns only, no join/part
    .map((l) => l.replace(/^\[(\d\d:\d\d)\] <([^>]+)>\s*/, '$2: ').trim())
    .filter(Boolean);
  const out = [];
  let n = 0;
  for (const l of lines.slice(fromLine)) {
    if (n + l.length > maxChars && out.length) break;
    out.push(l); n += l.length;
  }
  return out.join('\n');
};

// HuggingFace ultrachat: whole conversations per row — a chat history is one document,
// speakers labelled, so the parse reads it as a transcript-like source.
const ultrachat = async ({ n = 3, offset = 1000 } = {}) => {
  const url = 'https://datasets-server.huggingface.co/rows?dataset=HuggingFaceH4%2Fultrachat_200k' +
    `&config=default&split=train_sft&offset=${offset}&length=${Math.max(10, n * 3)}`;
  const j = await fetchJson(url, { retries: 2 });
  const rows = (j.rows || []).map((r) => r.row).filter((r) => Array.isArray(r.messages) && r.messages.length >= 4);
  return rows.slice(0, n).map((r, i) => ({
    id: `chat-ultrachat-${offset + i}`,
    text: r.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).replace(/\s+/g, ' ').trim()}`).join('\n\n'),
  }));
};

// ── the synthetic Armstrong chat (written for this repo; the one register no public
//    corpus supplies with both Armstrongs in it) ─────────────────────────────────────
const ARMSTRONG_CHAT = `Dana: I finally watched that Apollo 11 documentary last night.
Sam: The one about Neil Armstrong? I heard the archival footage is incredible.
Dana: Yes. Armstrong stays so calm during the landing — the fuel warning is blaring and his heart rate barely moves.
Sam: He trained as a test pilot before NASA, right? X-15 flights out of Edwards.
Dana: Exactly. And after Apollo 11 he mostly withdrew from public life, taught engineering at the University of Cincinnati.
Sam: Funny thing — my grandmother heard "Armstrong" and thought we meant the trumpet player.
Dana: Louis Armstrong! Honestly a fair guess. She grew up on his records.
Sam: He grew up in New Orleans, sang on street corners, then made the Hot Five recordings in Chicago in the twenties.
Dana: West End Blues still gives me chills. That opening cadenza changed jazz singing and playing both.
Sam: And What a Wonderful World came so late in his life — 1967, when he was already in his sixties.
Dana: Two Armstrongs, two different kinds of firsts. One walked on the Moon in 1969; the other cut Heebie Jeebies and basically invented scat.
Sam: Wild that the trumpeter never saw the Moon landing as a rival for the name. Different worlds entirely.
Dana: My favorite detail: Louis carried his trumpet everywhere; Neil carried a slide rule. Tools of two trades.
Sam: Did either ever comment on the other? I only know Louis joked that the astronaut borrowed his name for the Moon.
Dana: I could not find a real quote, so I would not repeat that as fact. What is certain is the overlap confused headline writers in 1969.
Sam: Fair. Anyway — the documentary is worth your evening. And put on the Hot Fives afterward for balance.`;

// ── the corpus plan ──────────────────────────────────────────────────────────────────
const PLAN = [
  // academic — public-domain scientific prose (Gutenberg)
  { id: 'academic-einstein-relativity', register: 'academic', title: 'Relativity: The Special and General Theory (excerpt)',
    source: 'Project Gutenberg #30155', license: 'public domain',
    fetch: () => gutenberg(30155, { fromPara: 20, maxChars: 9000 }) },
  { id: 'academic-darwin-origin', register: 'academic', title: 'On the Origin of Species (excerpt)',
    source: 'Project Gutenberg #1228', license: 'public domain',
    fetch: () => gutenberg(1228, { fromPara: 10, maxChars: 9000 }) },
  // academic register, encyclopedic voice — the two Armstrong lives (the probe's spine)
  { id: 'academic-wiki-neil-armstrong', register: 'academic', title: 'Neil Armstrong (Wikipedia)',
    source: 'Wikipedia', license: 'CC BY-SA 4.0', group: 'armstrong', about: 'Neil Armstrong',
    fetch: () => mediawikiExtract('en.wikipedia.org', 'Neil Armstrong', { maxChars: 9000 }) },
  { id: 'academic-wiki-louis-armstrong', register: 'academic', title: 'Louis Armstrong (Wikipedia)',
    source: 'Wikipedia', license: 'CC BY-SA 4.0', group: 'armstrong', about: 'Louis Armstrong',
    fetch: () => mediawikiExtract('en.wikipedia.org', 'Louis Armstrong', { maxChars: 9000 }) },

  // novels — public-domain fiction (Gutenberg) + the local Metamorphosis the repo already reads
  { id: 'novel-moby-dick', register: 'novel', title: 'Moby-Dick (opening chapters)',
    source: 'Project Gutenberg #2701', license: 'public domain',
    fetch: () => gutenberg(2701, { fromPara: 6, maxChars: 9000 }) },
  { id: 'novel-pride-prejudice', register: 'novel', title: 'Pride and Prejudice (opening chapters)',
    source: 'Project Gutenberg #1342', license: 'public domain',
    fetch: () => gutenberg(1342, { fromPara: 4, maxChars: 9000 }) },
  { id: 'novel-metamorphosis', register: 'novel', title: 'The Metamorphosis (opening)',
    source: 'data/metamorphosis.txt (already in-repo)', license: 'public domain',
    fetch: () => excerpt(readFileSync(join(ROOT, 'data', 'metamorphosis.txt'), 'utf8'), { maxChars: 9000 }) },

  // news — Wikinews stories: the two Armstrong-adjacent ones plus register breadth
  { id: 'news-neil-armstrong-dies', register: 'news', title: 'US astronaut Neil Armstrong dies',
    source: 'Wikinews', license: 'CC BY 2.5', group: 'armstrong', about: 'Neil Armstrong',
    fetch: () => mediawikiExtract('en.wikinews.org', 'US astronaut Neil Armstrong dies', { maxChars: 9000 }) },
  { id: 'news-moon-landing-40th', register: 'news', title: 'Fortieth anniversary of first manned Moon landing',
    source: 'Wikinews', license: 'CC BY 2.5', group: 'armstrong', about: 'Neil Armstrong',
    fetch: () => mediawikiExtract('en.wikinews.org', 'Fortieth anniversary of first manned Moon landing', { maxChars: 9000 }) },
  { id: 'news-anita-oday', register: 'news', title: '"Jezebel of Jazz" Anita O\'Day dies at age 87',
    source: 'Wikinews', license: 'CC BY 2.5', group: 'armstrong', about: 'Louis Armstrong',
    fetch: () => mediawikiExtract('en.wikinews.org', `"Jezebel of Jazz" Anita O'Day dies at age 87`, { maxChars: 9000 }) },
  { id: 'news-water-on-moon', register: 'news', title: 'NASA mission finds water on the Moon',
    source: 'Wikinews', license: 'CC BY 2.5',
    fetch: () => mediawikiExtract('en.wikinews.org', 'NASA mission finds water on the Moon', { maxChars: 9000 }) },

  // chat — the synthetic Armstrong probe chat (always), plus real ultrachat threads when
  // the datasets-server answers (skipped with a note when it does not).
  { id: 'chat-armstrongs', register: 'chat', title: 'Two Armstrongs (synthetic probe chat)',
    source: 'written-for-this-repo', license: 'synthetic fixture', group: 'armstrong', about: 'both',
    fetch: async () => ARMSTRONG_CHAT },
  { id: 'chat-irc-ubuntu-1', register: 'chat', title: '#ubuntu IRC support channel (2015-03-04)',
    source: 'irclogs.ubuntu.com', license: 'public channel archive',
    fetch: () => ircLog('2015-03-04', '#ubuntu', { maxChars: 7000, fromLine: 40 }) },
  { id: 'chat-irc-ubuntu-2', register: 'chat', title: '#ubuntu IRC support channel (2016-07-11)',
    source: 'irclogs.ubuntu.com', license: 'public channel archive',
    fetch: () => ircLog('2016-07-11', '#ubuntu', { maxChars: 7000, fromLine: 40 }) },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  const skipped = [];

  for (const doc of PLAN) {
    try {
      const text = await doc.fetch();
      if (!text || text.length < 400) throw new Error(`too short (${text?.length ?? 0} chars)`);
      const file = `${doc.id}.txt`;
      writeFileSync(join(OUT_DIR, file), text + '\n');
      manifest.push({ id: doc.id, file, register: doc.register, title: doc.title,
        source: doc.source, license: doc.license,
        ...(doc.group ? { group: doc.group } : {}), ...(doc.about ? { about: doc.about } : {}) });
      console.log(`${doc.id}: ${text.length} chars -> ${file}`);
    } catch (e) {
      skipped.push({ id: doc.id, reason: String(e.message || e) });
      console.log(`SKIPPED ${doc.id}: ${e.message || e}`);
    }
  }

  try {
    const chats = await ultrachat({ n: 3, offset: 1000 });
    for (const c of chats) {
      const file = `${c.id}.txt`;
      writeFileSync(join(OUT_DIR, file), c.text + '\n');
      manifest.push({ id: c.id, file, register: 'chat', title: 'ultrachat conversation',
        source: 'HuggingFaceH4/ultrachat_200k', license: 'MIT' });
      console.log(`${c.id}: ${c.text.length} chars -> ${file}`);
    }
  } catch (e) {
    skipped.push({ id: 'chat-ultrachat-*', reason: `datasets-server unreachable: ${e.message || e}` });
    console.log(`SKIPPED chat-ultrachat-*: ${e.message || e}`);
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify({ docs: manifest, skipped }, null, 2) + '\n');
  console.log(`manifest: ${manifest.length} docs, ${skipped.length} skipped -> ${join(OUT_DIR, 'manifest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
