// EO: CON(Network → Link, Binding) — the declared cross-holon seams
// The seam registry — every import that reaches PAST a holon's entrance, declared.
//
// The holon law (docs/holons.md, docs/architecture.md) is one entrance: outside a
// holon's boundary only its index.js is visible. The kernel's stance on crossings
// (docs/eo-for-coders.md §7.5, core/contract.js) is that a crossing is legal but
// must be DECLARED — the sin was crossing silently. This registry applies that
// stance to the import graph, and tests/boundaries.test.js enforces it: no
// undeclared crossing ever lands, no declared seam goes stale.
//
// The 2026-07 compliance pass (docs/eo-compliance-2026-07.md) found 205 silent
// crossings, declared the survivors here, then healed every one: each deep import
// now rides its holon's entrance, with the entrance re-exporting what its
// neighbors legitimately need. What remains is the declared floor — each row a
// crossing that CANNOT ride an entrance, with the reason on the row. A new deep
// import fails loudly until it is either routed through the entrance or
// deliberately declared here, in review, the same way:
//
//   ['src/<importer>.js', 'src/<holon>/<internal>.js', 'why the entrance will not do'],
export const SEAMS = Object.freeze([
  ['src/rooms/reader/boot.js', 'src/core/contracts.js',
    'Law 1 at emit: the conformance registry aggregates every holon\'s manifest, so it cannot ride core\'s entrance — core imports nothing; only the assembly membrane may load it'],
  ['src/perceiver/referents/mentions.js', 'src/perceiver/parse/entities.js',
    'the referent read observes surfaces with the parser\'s OWN entity scanner (scanEntities), so a mention\'s span is exactly the span the relation extractor cites; routing it through parse/index.js would close an import cycle (parse barrel → pipeline → referents → parse barrel), so it reads the leaf directly'],
  ['src/perceiver/audio/waveform.js', 'src/organs/in/acoustic.js',
    'organs/in/acoustic.js itself depends on organs/ingest (attachReading), which depends on the perceiver entrance (organs/ingest/read.js) — riding organs/in\'s entrance here would close that cycle the instant either barrel is evaluated, so it reads the leaf directly'],
  ['src/organs/in/reading-dispatch.js', 'src/perceiver/audio/waveform.js',
    'the perceiver entrance deliberately does not re-export buildAudioReading (same cycle as the seam above, from the other side): audio/waveform.js -> organs/in/acoustic.js -> organs/ingest -> the perceiver entrance would close on itself if the entrance also carried buildAudioReading, so this reads the leaf directly'],
  ['src/perceiver/text/waveform.js', 'src/model/embed-hash.js',
    'model/index.js also pulls in every model backend (anthropic.js, wllama.js, webllm.js, …), several of which reach weave/write -> organs/ingest -> the perceiver entrance — closing a cycle back on this very module the instant model/index.js is evaluated, so it reads the leaf directly'],
  // Every ingest organ pins its sentence/clause embedding matrices under the shared global
  // budget (model/embed-store.js). Riding model/index.js would pull the whole backend barrel
  // (webllm/wllama/anthropic → weave/write → organs/ingest), closing an import cycle the moment
  // an organ loads — the same hazard the embed-hash seam above records — so each reads the leaf.
  ['src/organs/in/text.js',     'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/audio.js',    'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/motion.js',   'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/acoustic.js', 'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/image.js',    'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/table.js',    'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/document.js', 'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/json.js',     'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/organs/in/music.js',    'src/model/embed-store.js', 'bounded embedding matrices — leaf import avoids the model-barrel cycle (see embed-hash seam)'],
  ['src/rooms/reader/app/registry.js', 'src/perceiver/nest.js',
    'docFor recovers a source\'s nested structure via nestComposite before caching it — but nest.js depends on surfer/index.js and organs/in/index.js, both of which already depend back on the perceiver entrance (surf.js -> readingAt, reading-dispatch.js -> buildTextReading), so riding perceiver/index.js here would close that cycle the instant it loads; this reads the leaf directly'],
].map(Object.freeze));

// The seam set, keyed "from → to", for the boundary test's membership check.
export const seamKey = (from, to) => `${from} → ${to}`;
export const SEAM_SET = Object.freeze(new Set(SEAMS.map(([f, t]) => seamKey(f, t))));
