// EO: INS·CON·SYN(Void → Network,Field, Composing) — parse orchestrator (text→doc)
// parseText / createParser — text → doc.
//
// The factory form is the engine reality: the parser instance owns its
// language module state and transcript-active flag. The state stays at
// the holon boundary, never at module scope. (engine.js:4228 mutates
// LANGUAGE_MODULES and TRANSCRIPT_ACTIVE from a module-scoped `let` —
// that's what we don't do here.)
//
// `parseText(text, opts)` is the one-shot convenience: it spins up a
// fresh parser and parses once. Use `createParser(opts)` when the same
// configuration needs to be applied to multiple texts in sequence, or
// when state ownership matters for testing.

import { createLog }            from '../../core/index.js';
import { VERDICTS }             from '../../core/index.js';
import { attributesConflict }   from '../../core/index.js';
import { segmentSentences }     from './sentences.js';
import { induceBoundaries }     from './boundaries.js';
import { isChrome }             from './chrome.js';
import { frameSpan }            from './frame.js';
import { extractMetadata }      from './metadata.js';
import { createEntityAdmission, scanInitialisms, scanFunctionalAttributes }from './entities.js';
import { parseRelations, scanDescriptors } from './relations.js';
import { argumentSpanSeg }      from './proposition.js';
import { createCorefField }     from './coref.js';
import { createDeixisFrame }    from './deixis.js';
import { induceNarrativeDepth } from './narrative-depth.js';
import { discoverNamings }      from './naming.js';
import { distinctReferentCount } from './name-variants.js';
import { induceInflections } from './inflection.js';
import { discoverUncasedReferents } from './uncased.js';
import { createCentreScanner } from './unnamed-referent.js';
import { readUncasedGrain } from './grain.js';
import { induceAdpositions } from './adpositions.js';
import { buildReferents }       from '../referents/index.js';
import { tok }                  from './tokenize.js';
import { createConventions, induceAttributions, induceCalendar, BOUNDARY } from '../../core/conventions/index.js';

// A pronoun-resolved descriptor owner ("his sister") is taken only when the prior
// field's top candidate outweighs the runner-up by this ratio — an unambiguous
// winner. Below it the descriptor is held with no owner, never a confident guess.
const DESC_OWNER_MARGIN = 2;

// The emitter's self-identification for Law 1 at emit (core/log.js): passed as
// append's meta on every event this module AUTHORS (inline `{ op: … }` literals).
// Events it forwards on others' behalf — the conventions' rules, the relation
// parser's edges — carry no tag: attribution belongs to their author.
const EMIT = Object.freeze({ src: 'src/perceiver/parse/pipeline.js' });

export const createParser = ({
  languageModules    = {},
  transcriptHandler  = null,
  chromeHint         = null,   // optional (sentence) → score nudge toward chrome
  // Law 1 at emit (core/log.js): the contract registry's resolver, INJECTED by
  // the assembly layer (boot) — parse never imports the registry. With it, every
  // event this orchestrator authors (tagged EMIT below) is checked at append
  // against this module's declared Act face; violations are recorded on the log.
  contractOf         = null,
  // The role-conflict predicate for the standing-descriptor trigger. INJECTED by
  // the assembly layer (ingest), which is allowed to see both holons and backs it
  // with the typing bridge's areDisjoint. Parse never imports the algebra; the
  // default asserts no conflict, so a bare parse has no descriptor exclusivity.
  rolesConflict      = undefined,
  // The coref field's tuning — the CONFINEMENT WINDOW. The reach over which a
  // pronoun resolves (`maxDist`) and a standing role epithet can still bind a name
  // (`descMaxDist`, `descGamma`). INJECTED so a harness can sweep it without the
  // parser knowing why: too wide and wrong-owner relations bind, too narrow and the
  // long-range descriptor (a sibling named long after its epithet) never reaches.
  // The default is the coref field's own (a bare parse is unchanged).
  corefOpts          = undefined,
  // The coherence-strain threshold at which the boundary-induction loop RECs a
  // punctuation mark into a sentence boundary (parse/boundaries.js). The default is
  // deliberately conservative (a rare crisis); exposed so a test or a known dialect
  // can set its own sensitivity. Undefined → the loop's own default.
  boundaryThreshold  = undefined,
  // The core's learning layer (reshape §5), injectable so a harness can turn the
  // inherited priors OFF ({ seeds: false }) to prove the core still reads from
  // units alone (TEST 1), or feed sediment a prior read deposited ({ inherit }).
  // Default undefined → the seeded ledger; a bare parse is unchanged.
  conventionsOpts    = undefined,
  // Coordinated-subject reading (relations.js): when a clause coordinates two named
  // subjects onto one predicate ("Delgado and Reyes listed…"), bond EACH conjunct to
  // the shared object so the convergence reaches the graph as a length-two path. A
  // RULES_REV-style switch held OFF by default: with it off the single-subject scan is
  // byte-identical (the goldens are untouched); a harness flips it on to expose the
  // convergence the bond graph otherwise never sees.
  coordSubjects      = false,
  // Causal gender as a SOFT coref cue (off by default → byte-identical). When on, a title
  // at first naming and a pronoun that already resolved record an entity's gender, and a
  // later gendered subject pronoun prefers a gender-compatible antecedent. Strictly
  // backward-looking: only gender noted before a pronoun can bias it. The reading the engine
  // is already good at is unchanged when this is off.
  genderCoref        = false,
  // The common-noun admission catalyst (entities.js) — a recurring definite common noun that
  // takes content verbs reacts into an entity node, gated by an inhibitor against runaway.
  // Off by default → the capitalised reading is byte-identical.
  commonNouns        = false,
  // The total read (relations.js, §1–§9): every clause and sub-clause is a proposition
  // site, every edge carries a graded confidence, relative clauses bind their antecedent,
  // and subordinators become inter-proposition links. OFF by default → the scan is
  // byte-identical (the simple SVO path parses to the same edges, §9 golden parity); the
  // total read only ever ADDS propositions, each graded by how surely it was apprehended.
  totalRead          = false,
  // Induce the document's SLOTS (core/conventions/slots.js) and carry the field on the ledger,
  // so every organ that reads conventions inherits the seed-free geometry (a unit's slot, its
  // slot-mates, the emergent closed class). OFF by default → the ledger and the whole read are
  // byte-identical; on, the parse additionally learns which units are one KIND from company.
  induceSlots        = false,
  // Fold morphological variants (declensions) of a name onto one referent — Наташу→Наташа,
  // Aranak→Arana. Morphology PROPOSES (a shared stem, inflection.js), COMPLEMENTARY DISTRIBUTION
  // disposes (a case-mate never co-occurs with its base in a clause; a distinct name sharing a stem
  // does — Франц/Франция, French/Frenchman — and is vetoed), and the asterisk carries each survivor
  // as a `*` it promotes on that evidence, still splittable by conflict. No nominative anchor, so an
  // ergative/agglutinative cast folds too. OFF by default → English folds nothing, byte-identical.
  foldInflections    = false,
  // Discover the figures of an UNCASED document (Japanese, Chinese, Arabic, Hebrew) by gravity
  // (parse/uncased.js), where a name carries no capital for the scanner to anchor on. Unlike the
  // flags above this defaults ON — but it is byte-identical for any cased document, because it fires
  // ONLY when most of the text's letters are caseless (\p{Lo}); a Latin/Cyrillic/Greek read never
  // triggers it. It only ever lights up input the capital scan leaves completely dark (zero figures),
  // so turning it on adds figures where there were none and changes nothing that already worked.
  // Pass an OBJECT to keep it on and hand the discovery its options (e.g. a known closedClass —
  // sediment from a prior read of the language — or a harness's thresholds).
  uncasedReferents   = true,
  // Read the GRAIN of each admitted figure (parse/grain.js) — which Existence terrain it sits in:
  // a figure (Entity), a kind (Kind), or a setting (Void) — from its own company (subject-rate,
  // oblique-rate, lowercase/plural twin), and record the judgment as a defeasible DEF{key:'grain'}.
  // ON by default: the pass is ADDITIVE-ONLY (it appends judgments, never changes admission or
  // edges) and it abstains — no event — wherever the signal is not clean, the no-commit
  // discipline; the full suite reads identically with it on. Off restores the ungraded log.
  grainRead          = true,
  // A referent has no name of its own — a name is just its brightest manifestation (unnamed-
  // referent.js). This resolves a figure that wears none, only a description the text keeps returning
  // to ("the creature"), off the descriptions and pronouns that point at it (recurrence × subject-
  // agency). OFF by default HERE → a minimal, byte-identical parse (distributional, could nudge a
  // golden); the reader turns it ON (organs/in/text.js) as ordinary reading. `nameReferent` is the
  // optional injected hook (ideally the talker) that may rename/fold bodies before they are admitted.
  unnamedReferents      = false,
  nameReferent       = null,
  // REFERENT-FIRST IDENTITY (perceiver/referents/). OFF by default → byte-identical (the whole
  // layer is skipped, no surface/denotation events are appended). Set to 'mention' to build the
  // mention→referent quotient on top of the finished read: a spelling becomes an observed surface
  // that DENOTES an opaque referent, identity is shared denotation (never string-merging), and the
  // doc gains the referent API (surfaceMentions / referents / referentOf / surfacesOf / propose /
  // assert / assertDistinct / retract / referentEdges). The label quotient stays intact beneath it
  // as the compatibility bridge — this is additive.
  referentIdentity   = null,
} = {}) => {
  // State owned by this parser instance. Mutated by parse(); the mutation
  // is visible only inside the holon. Tests construct one parser per case.
  const state = {
    languageModules:  { ...languageModules },
    transcriptActive: false,
  };

  // `onProgress` and `chunkSize` are the FEEDBACK channel (large-document ingestion). With
  // no sink the parse runs as one synchronous sweep, byte-identical to before — every golden
  // parse and every test takes this path. With a sink the per-sentence pass yields to the
  // event loop as it goes (below), and parse returns a Promise instead.
  const parse = (text, { docId, onProgress, chunkSize = 250 } = {}) => {
    const log         = createLog({ docId, contractOf });
    // Conventions first — the home for the language-specific stuff. The splitter
    // reads its abbreviation list from the ledger, so segmentation already honours
    // "Mr. Darcy" before a single word is classified, and the relation parser
    // reads its copula/modifier/speech lists from the same place.
    // The induce stream is this document's tokens, lowercased, with a BOUNDARY between segments
    // so no company forms across a break. A naive split suffices — slot statistics don't need
    // perfect segmentation, only local company. Built only when slot induction is asked for.
    const induceStream = induceSlots
      ? String(text || '').split(/[.!?;:]+/).flatMap((seg) =>
          [...(seg.toLowerCase().match(/[a-zà-öø-ÿ]+(?:['’][a-zà-öø-ÿ]+)?/g) || []), BOUNDARY])
      : null;
    const conventions = createConventions(
      induceStream ? { ...conventionsOpts, induce: induceStream } : conventionsOpts);
    // Before the first cut, let MEANING revise SYNTAX (parse/boundaries.js): the
    // DEF·EVA·REC coherence loop learns whether THIS document uses ':'/';' as
    // sentence boundaries — promoting one only when leaving it ignored fuses
    // propositions into run-on units that will not cohere (the KJV genealogies). The
    // learned marks are recorded as 'boundary' conventions, exactly as learned
    // abbreviations are, and flow into the splitter.
    const { extraBoundaries, recs: boundaryRecs } =
      induceBoundaries(text, {
        isAbbreviation: conventions.isAbbreviation,
        thresholds: boundaryThreshold != null ? { segmentation: boundaryThreshold } : undefined,
      });
    for (const r of boundaryRecs) conventions.learn('boundary', r.token, r.fused || 1);
    const sentences   = segmentSentences(text, { isAbbreviation: conventions.isAbbreviation, extraBoundaries });
    // Admission reads its language-specific word-classes (starters, prepositions,
    // role words, function words, auxiliaries) from the same conventions ledger the
    // splitter and relation parser use — seed ∪ what this document taught.
    const admission   = createEntityAdmission({ conventions, commonNouns, text });

    // Uncased figures (parse/uncased.js), discovered ONCE up front. Guarded to fire only on a
    // genuinely uncased document — one whose letters are mostly caseless (\p{Lo}: CJK, Arabic,
    // Hebrew), which is exactly where the capital-anchored scan above finds nothing. A cased read
    // (Latin/Cyrillic/Greek) never enters here, so it stays byte-identical. Longest-first so a figure
    // and its superstring do not double-count when matched into a sentence below.
    const uncasedByForm = (() => {
      if (!uncasedReferents) return new Map();
      const lo = (text.match(/\p{Lo}/gu) || []).length;
      const letters = (text.match(/\p{L}/gu) || []).length;
      if (!letters || lo / letters < 0.5) return new Map();
      const opts = typeof uncasedReferents === 'object' ? uncasedReferents : undefined;
      return new Map(discoverUncasedReferents(text, opts).referents.map((r) => [r.form, r]));
    })();
    const uncasedForms = [...uncasedByForm.keys()].sort((a, b) => b.length - a.length);

    // Referents pointed at without a name — Frankenstein's creature (only "the creature"/"the
    // monster"/"the wretch"). Discovered up front (like the uncased read) and admitted INLINE in the
    // main loop as first-class coref candidates, so the activation field and the gendered pronoun
    // binding resolve them exactly as a scanned name — the creature captures its own "it/he" chain
    // instead of leaking it to the last-named figure. OFF unless `unnamedReferents` is set → the
    // census never runs and the parse is byte-identical.
    const centreScanner = unnamedReferents ? createCentreScanner(sentences, { conventions, nameReferent })
                                           : { active: false, headToBody: new Map(), bodies: [], scan: () => [] };
    // Alias every epithet head → its body id up front, so the relation parser resolves a definite-
    // description subject ("the wretch <verb>") to the one body from the first sentence it reads
    // (leadingSubject looks the bare head up in admission). The id is deterministic (idFor(label)),
    // so aliasing before the body is first sighted is sound; its mass accrues as it is admitted below.
    // The canonical label ("the creature") is aliased FIRST so labelOf returns it, not a bare head.
    for (const body of (centreScanner.bodies || [])) {
      admission.aliasTo?.(body.label, body.id);
      for (const [head, b] of centreScanner.headToBody) if (b.id === body.id) admission.aliasTo?.(head, body.id);
    }

    // Transcript detection — the handler is injected, not imported.
    if (transcriptHandler && transcriptHandler.detect && transcriptHandler.detect(text)) {
      state.transcriptActive = true;
      state.languageModules['transcript-v1'] = { enabled: true };
    } else {
      state.transcriptActive = false;
      if (state.languageModules['transcript-v1']) {
        state.languageModules['transcript-v1'] = {
          ...state.languageModules['transcript-v1'], enabled: false,
        };
      }
    }

    // Pass 0 — learn the document's conventions before reading it, off their SLOTS: how this
    // text marks SPEECH (attribution verbs against quotation) AND how it RELAYS claims (the
    // report verbs and source nouns of the attribution nest, "the study found that …"). All
    // become REC entries in the ledger, written into the log, biasing every later sentence.
    induceAttributions(conventions, sentences); induceCalendar(conventions, sentences);   // + this document's own dated months (induce.js)

    // Structural frame: the head and tail OUTSIDE the body the banners bracket (the
    // licence header, the title block, the boilerplate footer). Read from the
    // document's own shape, embedder-free (parse/frame.js). The per-line loop below
    // holds it; the metadata harvest reads the same front matter from raw lines.
    const frame = frameSpan(sentences);

    // Pass 0 (cont.) — front-matter metadata (parse/metadata.js). Read the title
    // block's STRUCTURE — labeled fields, "Title:" / "Author:" / "Release date:" —
    // off the RAW LINES (a header carries no terminal punctuation, so the sentence
    // splitter would glue the block into one run): learn each field LABEL into the
    // ledger (the field-label register, so the document's own header vocabulary joins
    // what it taught the reader) and take note of the VALUES as the document's own
    // facts. Conservative — it harvests nothing without a clear header block.
    const metadata = extractMetadata(text, { conventions });

    for (const r of conventions.rules) log.append(r);

    // The harvested metadata as DEF notes on the log — a structural fact about the
    // DOCUMENT ("the title is X"), tagged kind:'meta', distinct from a per-unit role
    // DEF (key:'role'). Each fact is addressed under the DOCUMENT's own holon —
    // `<doc>.meta.<key>` — so the holon address reflects WHICH document it belongs to:
    // the title of one document is not the title of another, and the address keeps them
    // apart exactly as the namespaced referents do (organs/in/composite.js). Held
    // DEFEASIBLY: harvested front matter is a held theory, a DEF the reading can still
    // revise, not a collapsed axiom. The field lines are still held as frame below
    // (NUL → no figure); this only records what their structure says. The sentIdx is
    // the sentence carrying the value (for the trail) — best-effort, omitted when the
    // splitter glued it past recognition.
    const slugOf = (s) => String(s || '').trim().replace(/[.\s]+/g, '-').replace(/[^\w-]/g, '');
    const docSlug = slugOf(docId) || 'doc';
    for (const f of metadata.fields) {
      const keySlug = slugOf(f.key) || 'field';
      const sentIdx = f.value ? sentences.findIndex(s => s.includes(f.value)) : -1;
      log.append({ op: 'DEF', id: `${docSlug}.meta.${keySlug}`, kind: 'meta',
                   key: f.key, label: f.label, value: f.value, known: f.known,
                   defeasible: true, line: f.line, ...(sentIdx >= 0 ? { sentIdx } : {}) }, EMIT);
    }

    const isSpeech = (verb) => conventions.isAttributionVerb(verb);

    // Coreference is a field, not a decision. Each mention feeds a decaying
    // referent trace; a subject pronoun reads the field *as it stood before
    // this sentence* and the strongest candidate's weight becomes the bond's
    // coupling. Nothing is committed — the weight carries the uncertainty.
    const corefField = createCorefField({ ...corefOpts, ...(rolesConflict ? { rolesConflict } : {}) });
    // The structural run a first-person mention sits in (parse/narrative-depth.js) — a
    // labelled numbered-heading series (Letter N / Chapter N) and “ ” nesting, read from the
    // document's own shape. A document with neither stays at depth 0 throughout, so this is
    // byte-identical wherever no such structure exists.
    const depthAt = induceNarrativeDepth(sentences);
    const deixis = createDeixisFrame({ field: (idx) => corefField.field(idx), depthAt });
    // Derived descriptor edges (owner->bearer:role), logged after the candidates, marked `derived` (defeasible).
    const derivedEdges = [];

    // Candidate relations are collected here and emitted AFTER the pass, so each
    // can be weighed by how often its verb recurs across the whole document (the
    // recurrence gate, move 3). INS/SYN still emit inline, in reading order.
    const candidates = [];

    // The arrow of time, tracked at instantiation: the LAST INS referent activated,
    // in reading order. A clause that resolves no subject defaults to it (the
    // genealogy's "and begat …" continues the patriarch just named, not whatever
    // has the most accumulated mass). Snapshotted before each line so a subjectless
    // clause looks strictly backward, and bounded by the activation reach so a
    // long-dead referent never reaches forward to claim a verb.
    const INHERIT_REACH = 8;
    let lastIns = null;                         // { id, sentIdx } in reading order

    // Defeasible surname (tail) merges accumulate here as they are committed, each
    // with the seq of its SYN and its endpoints. After the read, the reconciliation
    // fires their rebutter when the surname proves shared by distinct agents — OR when
    // the endpoints carry a conflicting high-functionality key (a birth date).
    const surnameMerges = [];
    // Per-entity functional attributes harvested during the read: id → Map(key →
    // Map(value → firstSentIdx)). A high-functionality key (a birth date) takes one
    // value per entity, so TWO ids a tail merge would unite bearing different values is
    // positive evidence of two entities (the §6 ID-6 / §7 PER-2 veto, B5), while ONE id
    // sighted under one name bearing two values is DISAGREEMENT, not distinctness (the
    // Fellegi-Sunter indeterminate zone, B6). The conflict verdict is the injected
    // oracle's, never decided here; bornOn is flagged functional (ID-1).
    const attrsById = new Map();
    const FUNCTIONAL_KEYS = new Set(['bornOn']);
    const valuesOf = (id, key) => { const v = attrsById.get(id)?.get(key); return v ? [...v.keys()] : []; };

    // The structural frame (computed in Pass 0 above) is held BEFORE the per-line
    // chrome test so a block of licence prose — full sentences a per-line test reads
    // as narrative — is held by the bracket it sits outside. Empty for an unframed
    // document; this changes nothing there.
    const processSentence = (sent, sentIdx) => {
      // Frame is held like chrome (NUL → no entities, no edges) AND marked a site (DEF
      // role=site), so retrieval and the fold skip it too — a licence line can no longer
      // surface as a citable span. The `via:'frame'` stamp distinguishes it in the trail
      // from the degenerate-line chrome below.
      if (frame.all.has(sentIdx)) {
        log.append({ op: 'NUL', kind: 'chrome', via: 'frame', sentIdx, text: sent }, EMIT);
        log.append({ op: 'DEF', id: `unit:${sentIdx}`, key: 'role', value: 'site', sentIdx }, EMIT);
        return;
      }
      // Chrome-ness is a weight: the mechanical score plus an optional nudge
      // (a mini-LLM's chrome probability) decides whether the line is held.
      if (isChrome(sent, chromeHint ? chromeHint(sent) : 0)) {
        // NUL is non-transformation — the line is *held*, not cleared. It is
        // simply not turned into entities or relations. (Voiding a fact would
        // be a DEF to VOID, an assertion; NUL asserts nothing.)
        log.append({ op: 'NUL', kind: 'chrome', sentIdx, text: sent }, EMIT);
        return;
      }
      // ── The 1:1 retention layer — formatting, not reading ──────────────────────
      // Every contentful sentence is HELD VERBATIM in the log before a single figure is
      // read off it, so the append-only log is a 1:1 formatting of the input into the
      // grammar: the prose reconstructs from the log alone, and a sentence the reader
      // extracts NOTHING from (a barren line — no name, no relation) is still on the
      // record, not silently absent. The extraction below rides ON TOP as defeasible
      // reafference; it never rewrites the span. NUL is exactly right — non-transformation,
      // the line held as-is: project.js has no NUL case and reading.js ignores it, so the
      // retention adds no node, edge, or surprise (the formatting is information-neutral).
      // `kind:'span'` marks it a retention hold, distinct from the chrome/frame holds above.
      log.append({ op: 'NUL', kind: 'span', id: `unit:${sentIdx}`, sentIdx, text: sent }, EMIT);
      // Snapshot the field and last-INS register BEFORE this line's entities fold in, so a
      // subject pronoun — and the first-person deixis teller below — looks strictly backward.
      const priorField = corefField.field(sentIdx);
      const priorLastIns = lastIns;
      // Ground the teller from that same pre-line field, so "I" binds to the established
      // narrator and never borrows the salience of an addressee this very line names.
      if (/^\s*(?:and|but|now|so|then|or|nor|yet|for|therefore|thus)?[\s,]*i\b/i.test(sent))
        { deixis.noteFirstPerson(sentIdx); deixis.groundTeller(sentIdx); }

      // Causal gender cue (opt-in). A title introduces an entity's gender at the moment it
      // is named (a convention, she/he/Mr — not a name table); a leading subject pronoun's
      // gender is read for THIS line. Both are used only to bias the BACKWARD field below.
      const TITLE_GENDER = { mr: 'm', mister: 'm', sir: 'm', lord: 'm', mrs: 'f', miss: 'f', ms: 'f', lady: 'f', madam: 'f', madame: 'f' };
      const titleGenders = {};
      if (genderCoref) for (const m of sent.matchAll(/\b(Mr|Mrs|Miss|Ms|Mister|Madam|Madame|Lady|Lord|Sir)\.?\s+([A-Z][a-zA-Z]+)/g)) titleGenders[m[2].toLowerCase()] = TITLE_GENDER[m[1].toLowerCase()];
      const lead = genderCoref ? /^\s*(he|she|they)\b/i.exec(sent) : null;
      const pg = lead ? { he: 'm', she: 'f', they: 'p' }[lead[1].toLowerCase()] : null;

      for (const obs of admission.observe(sent, sentIdx)) {
        // INS on every sighting (admit and present) so edge weights track how
        // often a figure actually appears, not just that it exists.
        if (obs.status === 'admit' || obs.status === 'present') {
          log.append({ op: 'INS', id: obs.id, label: obs.label, sentIdx }, EMIT);
          corefField.note(obs.id, sentIdx);
          // a title naming this entity fixes its gender, causally, at first sight.
          if (genderCoref) for (const w of String(obs.label || '').toLowerCase().split(/\s+/)) if (titleGenders[w]) corefField.noteGender(obs.id, titleGenders[w]);
          lastIns = { id: obs.id, sentIdx };       // the arrow of time advances
        }
        if (obs.status !== 'admit' || !obs.aliasOf) continue;
        // A name-containment alias is a synthesis (SYN), and EVA fires AS it is
        // committed — the write-time evaluation the ingestion log used to lack.
        if (obs.aliasKind === 'head') {
          // "Gregor" folded into "Gregor Samsa": the given name individuates, so the
          // ids were unified at admission and the merge is corroborated on its face.
          if (obs.rawId !== obs.id) {
            const syn = log.append({ op: 'SYN', kind: 'alias', from: obs.rawId, to: obs.id,
                                     label: obs.label, sentIdx, match: 'head', warrant: 'given-name' }, EMIT);
            log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                         reason: 'given-name-containment', sentIdx }, EMIT);
          }
        } else if (obs.aliasKind === 'tail') {
          // "Samsa" folded into "Gregor Samsa": a surname is shared across a family,
          // so the merge is THIN. It is a REAL merge (kind:'merge' — the projection
          // unions it), so a single-Samsa document still folds; but it is committed
          // DEFEASIBLY, carrying its rebutter, with the write-time EVA held at
          // indeterminate. The reconciliation after the read overturns it — by an
          // appended SEG-retract the projection honours — if the surname proves shared.
          const syn = log.append({ op: 'SYN', kind: 'merge', from: obs.id, to: obs.aliasOf,
                                   label: obs.label, sentIdx, match: 'tail', surname: obs.surname,
                                   warrant: 'surname', defeasible: true,
                                   rebutter: 'distinct-agent-shares-surname' }, EMIT);
          log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.INDETERMINATE,
                       reason: 'surname-containment-thin', surname: obs.surname, sentIdx }, EMIT);
          surnameMerges.push({ synSeq: syn.seq, surname: obs.surname, from: obs.id, to: obs.aliasOf });
        }
      }

      // Admit any UNCASED figure occurring in this sentence — the caseless-script names discovered
      // by gravity up front (empty, so a no-op, for every cased document). Longest-first with masking
      // so a figure and its superstring do not double-count; each is an INS + a coref trace, exactly
      // like a scanned name, and advances the arrow of time so a following clause can inherit it.
      if (uncasedForms.length) {
        let masked = sent;
        for (const form of uncasedForms) {
          if (!masked.includes(form)) continue;
          masked = masked.split(form).join(' ');     // mask so a substring figure will not re-hit
          const id = admission.admit(form, sentIdx);
          log.append({ op: 'INS', id, label: form, sentIdx }, EMIT);
          corefField.note(id, sentIdx);
          lastIns = { id, sentIdx };
        }
      }

      // Admit any UNNAMED referent body sighted here (the creature) BEFORE the relation parser reads
      // this sentence, so "the creature stretched" bonds in reading order and the following "it"/"he"
      // — resolved by the relation parser through the field below — binds to the freshly-noted body,
      // not to the last-named figure. Noted at PROPOSITION grain (`at`) so the field decays by clause.
      // One INS per body per sentence (its mass is its description sightings, like a name's).
      if (centreScanner.active) {
        const seenBody = new Set();
        for (const c of centreScanner.scan(sent, sentIdx)) {
          const id = admission.admit(c.label, sentIdx);
          if (!seenBody.has(id)) { seenBody.add(id); log.append({ op: 'INS', id, label: c.label, sentIdx }, EMIT); }
          corefField.note(id, c.at);
          lastIns = { id, sentIdx };
        }
      }

      // Acronym ↔ expansion (§8 ORG-1). With this sentence's names admitted, look for
      // the parenthetical initialism construction — "Nashville Downtown Partnership
      // (NDP)" — where the parenthesised all-caps token's letters are the name's
      // initials. On a match we commit a SYN alias (the projection unions it, so every
      // bare "NDP" — before or after the definition — lands on the one node) with a
      // write-time EVA, SEDIMENT it as a defeasible REC in the conventions ledger (no
      // acronym table — learned from the text), and re-point admission so the
      // document's own later mentions resolve without re-deriving. A learned alias is
      // committed once: the guard skips a parenthetical the ledger already carries.
      for (const ini of scanInitialisms(sent, admission)) {
        if (admission.initialismOf(ini.acronymLabel)) continue;          // already learned this read
        if (ini.acronymId !== ini.expansionId) {
          const syn = log.append({ op: 'SYN', kind: 'merge', from: ini.acronymId, to: ini.expansionId,
                                   label: ini.expansion, sentIdx, match: 'initialism', warrant: 'initialism',
                                   evidence: 'initialism', acronym: ini.acronym }, EMIT);
          log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                       reason: 'initialism-expansion', acronym: ini.acronym, sentIdx }, EMIT);
        }
        admission.registerInitialism(ini.acronymLabel, ini.expansionId);
        conventions.learnInitialism(ini.acronym, ini.expansionId);
      }

      // Functional-attribute harvest (§7 PER-4). A birth date front-loaded by an
      // appositive ("Smith (born 1979)") or a copular "born in" is a high-functionality
      // identity key: at most one value per entity. Logged as a defeasible DEF attr and
      // remembered per id, so the surname reconciliation can veto a tail merge whose
      // endpoints carry conflicting values. Narrow by construction — no goldens carry it.
      for (const a of scanFunctionalAttributes(sent, admission)) {
        let byKey = attrsById.get(a.id); if (!byKey) attrsById.set(a.id, byKey = new Map());
        let vals = byKey.get(a.key);     if (!vals)  byKey.set(a.key, vals = new Map());
        if (!vals.has(a.value)) vals.set(a.value, sentIdx);          // keep every distinct value
        log.append({ op: 'DEF', id: a.id, key: a.key, value: a.value, kind: 'attr', defeasible: true, sentIdx }, EMIT);
      }

      // The relations parser reads coref backward through the pre-line field for the
      // strongest prior candidate; `resolve` (a possessive owner pronoun in a kinship
      // apposition, "his sister Grete") is now wired, so those pronoun-owned bonds survive.
      // Bias the backward field for a leading subject pronoun by its gender, using only
      // gender noted BEFORE this line. The rule is DEFEASIBLE (EVA): when it excludes
      // incompatible candidates AND a compatible home remains, the excluded beliefs HOLD
      // (they did useful work); when EVERY candidate is excluded — the pronoun's only
      // sensible antecedent is one the gender belief forbids — the rule has FAILED here, so
      // we strain those beliefs (and defer to the gender-free read). Enough such failures
      // defeat the belief in coref.js, toggling the cue off for that entity. With no gender
      // evidence it is exactly priorField; the gender-free reading is untouched.
      let genderAwarePrior = priorField;
      if (pg) {
        const incompatible = priorField.filter(c => { const cg = corefField.genderOf(c.id); return cg && cg !== pg; });
        const compatible = priorField.filter(c => { const cg = corefField.genderOf(c.id); return cg == null || cg === pg; });
        if (incompatible.length && compatible.length) {
          genderAwarePrior = compatible;
          incompatible.forEach(c => corefField.evaGender(c.id, true));    // EVA holds: exclusion did useful work
        } else if (incompatible.length) {
          incompatible.forEach(c => corefField.evaGender(c.id, false));   // EVA breaks: the only referent was forbidden
        }
        if (genderAwarePrior[0]) corefField.noteGender(genderAwarePrior[0].id, pg);
      }
      const coref = {
        field:   () => genderAwarePrior,
        deixis,
        resolve: () => priorField[0]?.id ?? null,
        // The last INS referent activated before this line, for a subjectless
        // clause to default to — within the activation reach, weight decayed by how
        // many lines back it was instantiated (the same γ kernel, as coupling).
        lastIns: () => {
          if (!priorLastIns) return null;
          const d = sentIdx - priorLastIns.sentIdx;
          if (d < 0 || d > INHERIT_REACH) return null;
          return { id: priorLastIns.id, w: Math.round(Math.pow(0.7, d) * 1000) / 1000 };
        },
      };
      const relOpts = { isSpeech, isCopula: conventions.isCopula, isModifier: conventions.isModifier,
                        isConjunction: conventions.isConjunction,   // ledger coordinator predicate
                        referents: true, coordSubjects,   // open the NP object slot (move 2); coord subjects (gated)
                        totalRead, sentIdx };   // §1–§9 the total read (gated; adds graded propositions)
      for (const rel of parseRelations(sent, admission, coref, relOpts)) candidates.push({ rel, sentIdx });

      // Standing descriptors — the third coref channel (extraction half). A role
      // epithet with no adjacent name ("his sister", "Gregor's sister") is a HELD
      // role: it deposits into NO name's channel here. A named owner is sticky and
      // authoritative; a pronoun owner is taken only when it is the unambiguous
      // winner of the PRIOR field (the Frame-A margin guard — a wrong-but-weak
      // owner is worse than none). Binding a name to the role is the trigger's job.
      for (const desc of scanDescriptors(sent)) {
        let ownerId = null, named = false;
        if (desc.owner.kind === 'name' && admission.isAdmitted(desc.owner.name)) {
          ownerId = admission.idOf(desc.owner.name); named = true;
        } else if (desc.owner.kind === 'pron') {
          const [top, second] = priorField;
          if (top && (!second || top.w >= DESC_OWNER_MARGIN * second.w)) ownerId = top.id;
        }
        corefField.noteDescriptor(desc.roleKey, sentIdx, ownerId, { named });
      }

      // The unify trigger (phase b): once this sentence's admissions and
      // descriptors are folded in, bind any role whose bearer is now uniquely
      // determined by elimination. Each binding becomes a derived owner→bearer
      // edge (e.g. Gregor -> Grete : sister), typed downstream as the sibling
      // primitive — the apposition-free hop the channel exists to recover.
      for (const b of corefField.bindDescriptorsByElimination([...admission.admitted.values()], sentIdx))
        derivedEdges.push({ op: 'CON', src: b.owner, tgt: b.id, via: b.role, sentIdx, w: b.w, derived: true });
    };

    // Post-loop reconciliation and document assembly. Reads only state the per-sentence
    // pass accumulated (candidates, surnameMerges, attrsById, the coref field), so it is
    // identical whichever driver fed the loop — it runs once, after every sentence is in.
    const finalize = () => {
    // ── Defeat the thin surname merges whose rebutter has gone live ─────────────
    // Each tail (surname) SYN above was committed defeasibly, carrying the rebutter
    // "a distinct agent bears this surname." The rebutter is LIVE when the surname is
    // borne by ≥2 distinct multi-word names — a family, not an individual (Gregor
    // Samsa / Mr Samsa / Mrs Samsa). Then the merge is OVERTURNED. Defeat does not
    // rewind: a SEG-retract is appended to supersede the SYN (the projection drops it
    // through the same union-find), and a write-time EVA records the contradiction.
    // A surname unique to one name is left merged — "Samsa" then does pick out the one
    // Samsa. This is the mr/mrs-samsa fix: the merge that ossified now unmerges.
    if (surnameMerges.length) {
      const bearers = new Map();   // surname → Set<label> of the multi-word names bearing it
      for (const label of admission.admitted.keys()) {
        const words = label.split(' ');
        if (words.length < 2) continue;
        const s = words[words.length - 1].toLowerCase();
        if (!bearers.has(s)) bearers.set(s, new Set());
        bearers.get(s).add(label);
      }
      for (const m of surnameMerges) {
        // "Shared by DISTINCT agents" is the rebutter, not "borne by ≥2 labels": two
        // labels that are variants of ONE person ("Elvis Presley", "Elvis Aaron
        // Presley") are the same agent, so the bare "Presley" merge must STAND. Count
        // distinct referents (variant-collapsed), not distinct surface forms — a family
        // (Gregor / Mr / Mrs Samsa, no one a subsequence of another) still counts ≥2
        // and still fires the rebutter, so the mr/mrs-samsa unmerge is unchanged.
        const surnameShared = distinctReferentCount([...(bearers.get(m.surname) || [])]) >= 2;
        // Functional-conflict veto (§6 ID-6 / §7 PER-2): the two endpoints a tail merge
        // would unite carry a CONFLICTING high-functionality key — one birth date, two
        // values. The injected oracle decides; bornOn is flagged functional (ID-1). This
        // overturns a tail merge the surname-sharing rebutter cannot see (one full name
        // bearing the surname, a bare surname with a different birth year).
        let funcKey = null;
        for (const key of FUNCTIONAL_KEYS) {
          const va = valuesOf(m.from, key), vb = valuesOf(m.to, key);
          if (va.length && vb.length
              && attributesConflict(key, va, vb, { functional: true }).conflict > 0) { funcKey = key; break; }
        }
        if (!surnameShared && !funcKey) continue;                // no rebutter live → the merge stands
        const reason    = surnameShared ? 'surname-shared-by-distinct-agents' : 'functional-key-conflict';
        const evaReason = surnameShared ? 'distinct-agent-shares-surname'     : 'functional-key-conflict';
        const seg = log.append({ op: 'SEG', kind: 'retract', refSeq: m.synSeq,
                                 reason, surname: m.surname, ...(funcKey ? { key: funcKey } : {}) }, EMIT);
        log.append({ op: 'EVA', site: 'merge', ref: m.synSeq, verdict: VERDICTS.CONTRADICTED,
                     reason: evaReason, surname: m.surname, ...(funcKey ? { key: funcKey } : {}), defeatedBy: seg.seq }, EMIT);
      }
    }

    // ── Declension fold (opt-in) — a name's cases are one referent ──────────────
    // Morphology PROPOSES, DISTRIBUTION disposes, the asterisk HOLDS IT OPEN. Identity is relational,
    // not orthographic (core/asterisk.js): so a shared stem only nominates a candidate (inflection.js,
    // no nominative anchor — it makes no nominative–accusative assumption an ergative or agglutinative
    // cast would break). The verdict is COMPLEMENTARY DISTRIBUTION: you never name one person twice in
    // a clause, so a true case-mate co-occurs with its base ~never ("Aranak"/"Arana" 0.04, "Rostóv"/
    // "Rostóva" 0.00), while a DISTINCT name sharing a stem co-occurs and is vetoed ("French"/
    // "Frenchman" 0.11, "Prussia"/"Prussian" 0.15). Each survivor is emitted as a same_as? the
    // projection's asterisk carries as `*` — held open, promoted on this evidence, still splittable by
    // a functional conflict. English induces ~no case set → no candidates → a no-op.
    if (foldInflections) {
      const COMP_VETO = 0.08;   // co-occurrence rate above which a shared-stem pair is two referents
      const forms = new Map(), sight = admission.sightSent;
      for (const [label, id] of admission.admitted)
        if (!label.includes(' ')) forms.set(label, (admission.mentions.get(id) || []).length || 1);
      const { fold } = induceInflections(forms);   // the proposer — plain same-stem union, no anchor
      // Group each cluster and name it by its BASE — the LEAST-MARKED form (an oblique only ADDS an
      // ending, so the base is the shortest; frequency breaks a fusional tie where a nominative is no
      // shorter than its cases). This is the bare stem in an agglutinative language ("Arana", not the
      // frequency-topped oblique "Aranaren") and the nominative in a fusional one ("Rostóv").
      const groups = new Map();
      for (const [form, canon] of fold) { let g = groups.get(canon); if (!g) groups.set(canon, g = new Set()); g.add(form); g.add(canon); }
      for (const members of groups.values()) {
        const base = [...members].sort((a, b) => a.length - b.length || (forms.get(b) || 0) - (forms.get(a) || 0) || (a < b ? -1 : 1))[0];
        const to = admission.idOf(base);
        if (!to) continue;
        const B = new Set(sight.get(base) || []);
        for (const form of members) {
          if (form === base) continue;
          const from = admission.idOf(form);
          if (!from || from === to) continue;
          const A = new Set(sight.get(form) || []);
          const co = [...A].filter((x) => B.has(x)).length;
          if (co / Math.max(1, Math.min(A.size, B.size)) >= COMP_VETO) continue;   // they co-occur → distinct
          log.append({ op: 'SYN', kind: 'same_as?', from, to,
                       label: base, sentIdx: 0, match: 'inflection', warrant: 'declension' });
        }
      }
    }

    // ── B6 — the indeterminate zone: disagreement, not distinctness ─────────────
    // An entity sighted under ONE name bearing CONFLICTING values of a functional key
    // (two birth dates on one "John Smith") is the Fellegi-Sunter middle: strong
    // agreement (the identical name) with a single disagreement is neither two entities
    // (the B5 veto, which needs WEAK corroboration — only a shared surname) nor a silent
    // overwrite. It is CONTESTED — both values stay in the log, and an EVA holds the key
    // INDETERMINATE (verdicts.js: "indeterminate is held — the no-commit discipline"),
    // the adjudication surface the answer layer reads. The oracle decides the conflict.
    for (const [id, byKey] of attrsById) {
      for (const key of FUNCTIONAL_KEYS) {
        const vals = byKey.get(key);
        if (!vals || vals.size < 2) continue;
        const arr = [...vals.keys()];
        if (attributesConflict(key, [arr[0]], arr.slice(1), { functional: true }).conflict > 0)
          log.append({ op: 'EVA', site: 'attr', id, key, verdict: VERDICTS.INDETERMINATE,
                       reason: 'functional-key-contested', values: arr }, EMIT);
      }
    }

    // ── B6.5 — within-document near-identity, surfaced (not merged) ──────────────
    // Two DISTINCT multi-word names sharing a surname AND a discriminator (both run
    // NDP) are corroborated past coincidence — Fellegi-Sunter agreement-weight, not
    // string-identity. The tail-alias can't see it (both are multi-word) so today they
    // sit as two unrelated entities. When such a corroborated pair ALSO conflicts on a
    // functional key, that is the genuine adjudication middle: likely one person with a
    // bad record, possibly two — so we SURFACE it as a held, contested near-identity
    // (an EVA, INDETERMINATE), never an auto-merge (guard-first: merging corroborated
    // same-surname names is the dangerous half, deferred). Detection is engine (surname
    // + shared discriminator, corpus statistics); the resolution is the witness's.
    // Construction-gated three ways (surname ∧ shared discriminator ∧ functional
    // conflict), so it stays silent on prose that carries none.
    const discrimTargets = new Map();   // id → Set(discriminator target), naming vias excluded
    for (const { rel } of candidates) {
      if ((rel.op !== 'CON' && rel.op !== 'SIG') || !rel.src || rel.tgt == null) continue;
      const via = String(rel.via || '').toLowerCase();
      if (via === 'name' || via === 'named' || via === 'called' || via === 'alias') continue;
      let s = discrimTargets.get(rel.src); if (!s) discrimTargets.set(rel.src, s = new Set());
      s.add(String(rel.tgt).toLowerCase());
    }
    const bySurname = new Map();         // surname → Set(id) over admitted MULTI-word names
    for (const [label, id] of admission.admitted) {
      const w = label.split(' ');
      if (w.length < 2) continue;
      const s = w[w.length - 1].toLowerCase();
      let set = bySurname.get(s); if (!set) bySurname.set(s, set = new Set());
      set.add(id);
    }
    for (const [surname, idset] of bySurname) {
      const ids = [...idset];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        if (a === b) continue;
        const da = discrimTargets.get(a), db = discrimTargets.get(b);
        if (!da || !db || ![...da].some((t) => db.has(t))) continue;     // need corroboration beyond the surname
        let conflictKey = null;
        for (const key of FUNCTIONAL_KEYS) {
          const va = valuesOf(a, key), vb = valuesOf(b, key);
          if (va.length && vb.length
              && attributesConflict(key, va, vb, { functional: true }).conflict > 0) { conflictKey = key; break; }
        }
        if (!conflictKey) continue;                                      // no dispute → nothing to surface here
        log.append({ op: 'EVA', site: 'identity', a, b, surname, key: conflictKey,
                     verdict: VERDICTS.INDETERMINATE, reason: 'near-identity-contested' }, EMIT);
      }
    }

    // Move 3 — the relation recurrence gate (ReVerb's lexical constraint). A real
    // relation recurs; a verb seen once is suspect. We gate relations the way the
    // referent table gates entities — by recurrence — but HOLD WEAK rather than
    // drop, because many one-off verbs are real (walked, made, told): the
    // uncertainty rides along as reduced coupling, the same physics the pronoun
    // field already uses. A recurrent verb is learned into the conventions ledger
    // (a 'relation' REC), so the document's own relation vocabulary joins what it
    // taught the reader.
    const viaCount = new Map();
    const nounCount = new Map();   // NP-referent head → document-wide occurrences
    for (const { rel } of candidates)
      if (rel.op === 'CON' || rel.op === 'SIG') {
        viaCount.set(rel.via, (viaCount.get(rel.via) || 0) + 1);
        if (rel.tgtKind === 'np') nounCount.set(rel.tgt, (nounCount.get(rel.tgt) || 0) + 1);
      }
    // The recurrence coupling: a one-off relation verb (or NP referent) is held weak, a
    // repeated one nearly full-strength, on ONE curve — n/(n+1) — not a picked "recurrent
    // enough" cutoff with a picked discount below it. n=1 gives 0.5 (a single sighting
    // compounds no more surely than a coin flip); it climbs toward 1 as sightings recur,
    // smoothly, so there is no threshold to invent and no sharp jump at it either (the old
    // rule went straight from ×0.5 to ×1 the instant a second sighting landed). The learn
    // pass below (isRelation's INHERITED-prior exemption) runs AFTER this loop, not
    // before: learning "walked" into the ledger the moment THIS document's own second
    // sighting arrives would let a same-document recurrence exempt itself through the
    // corpus-prior door, silently reintroducing the old hard cliff at n=2 that the curve
    // exists to remove. isRelation here can only ever mean a PRIOR document taught it.
    const confidenceOf = (n) => n / (n + 1);

    for (const { rel, sentIdx } of candidates) {
      const { args, coord, ...edge } = rel;   // `coord` is read by the gate below, then dropped (never logged)
      if (edge.op === 'CON' || edge.op === 'SIG') {
        // A coordinated-subject convergence edge is held FIRM on a single sighting: a
        // reveal's verb ("listed") is single by nature, and the edge's warrant is the
        // construction, not the verb's recurrence — so it is not held weak and dropped
        // from the firm graph the bridge channel reads.
        // A corpus-attested relation verb (inherited prior) is held FIRM even on a single
        // sighting: the corpus already saw it bond hundreds of times, so a new short
        // document need not re-earn it. With no corpus prior, isRelation is empty here and
        // this OR changes nothing — reading stays byte-identical.
        const exempt = coord === true || conventions.isRelation(edge.via);
        let factor = exempt ? 1 : confidenceOf(viaCount.get(edge.via) || 1);
        // An NP referent rides the SAME sighting-confidence curve as the verb, compounding
        // with it — a common noun this document has barely seen is held weak regardless of
        // how well-attested its verb is, the physics the pronoun field already uses.
        if (edge.tgtKind === 'np') factor *= confidenceOf(nounCount.get(edge.tgt) || 1);
        const base = edge.w == null ? 1 : edge.w;          // existing (pronoun) coupling
        const w = Math.round(base * factor * 1000) / 1000;
        if (w < 1) edge.w = w; else delete edge.w;         // sub-unit coupling rides along
        // Type the predicate (move 3): the raw verb stays as `via` (the citation and
        // the talker's arrow label); the closed-vocab type rides beside it as
        // `relType`, the comparable grouping key. Additive — an untyped real verb
        // keeps no relType and still projects.
        const relType = conventions.relationType(edge.via);
        if (relType) edge.relType = relType;
      }
      if (args) {
        const seg = log.append(argumentSpanSeg(args, sentIdx));
        log.append({ ...edge, sentIdx, argspan: seg.seq });
      } else {
        log.append({ ...edge, sentIdx });
      }
    }
    // Learned AFTER this document's own coupling is computed (see the comment above the
    // curve): so the ledger's 'relation' kind means "a PRIOR document taught this," never
    // "this document just saw it twice a moment ago."
    for (const [via, n] of viaCount) if (via && n >= 2) conventions.learn('relation', via, n);

    // The derived descriptor edges, after the witnessed candidates. They carry
    // `derived: true` so the projection and the edge-grounding veto treat them as
    // defeasible (e.g. they never satisfy the functional-axiom's witnessed-filler
    // requirement) — the apposition-free binding, held as a weak, citable bond.
    for (const e of derivedEdges) {
      const relType = conventions.relationType(e.via);   // a role via → 'kinship'
      log.append(relType ? { ...e, relType } : e);
    }

    // The naming-scene discovery (parse/naming.js) — coreference by direct address.
    // A role epithet is a referent; the name that answers it as a vocative ("Grete!"
    // … "his sister called") is the SAME referent. We materialise the role referent,
    // bond the owner to it (Gregor → his sister), and SYN it to the name — the
    // projection's union-find then carries the kinship edge onto Grete with no
    // cascade, the apposition-free hop the elimination trigger could not bootstrap.
    // Guarded by owner-distinctness, the injected disjointness algebra, and sticky
    // abstention; a role no scene names is left as an UNNAMED referent, not guessed.
    for (const m of discoverNamings(sentences, { admission, corefField, conventions, rolesConflict })) {
      const roleRef    = `role:${m.role}@${m.ownerId}`;
      const ownerLabel = admission.labelOf(m.ownerId) || m.ownerId;
      const relType    = conventions.relationType(m.role);
      log.append({ op: 'INS', id: roleRef, label: `${ownerLabel}’s ${m.role}`, sentIdx: 0 }, EMIT);
      log.append({ op: 'CON', src: m.ownerId, tgt: roleRef, via: m.role, sentIdx: 0, ...(relType ? { relType } : {}) }, EMIT);
      const syn = log.append({ op: 'SYN', kind: 'merge', from: roleRef, to: m.name, sentIdx: 0 }, EMIT);
      // EVA at write time: discoverNamings already ran the merge's guards (owner-
      // distinctness, disjointness, sticky abstention), so the surviving merge is
      // corroborated by the naming scene as it is committed.
      log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                   reason: 'naming-scene', role: m.role, sentIdx: 0 }, EMIT);
    }

    // ── The GRAIN of each admitted figure — which Existence terrain ─────────────
    // LAST, once the cast is fully assembled (merges, namings, edges all in): read each referent's
    // grain from its company (grain.js) and record it as a defeasible DEF — figure / kind /
    // setting. One judgment per REFERENT (aliased labels share an id; the most-sighted label
    // speaks for it), and NONE where the reader abstains: thin evidence appends nothing. Sitting
    // at the log's tail makes the pass literally ADDITIVE — every event before it is byte-
    // identical with the flag off. The DEF's own cube grain matches the grain it assigns (calling
    // a span a Kind IS a Pattern-grain judgment), so each event lies on the diagonal.
    if (grainRead) {
      // The SETTING rule needs the adposition register, and beyond the English seeds the document
      // must teach its own (parse/adpositions.js — precedes names, asymmetrically, governing
      // obliques). Each induced adposition is LEARNED into the ledger ('preposition', seed ∪
      // learned, defeasible), then the oblique sightings observe()'s seeded register couldn't see
      // are recounted over just the admitted labels' own sentences — so "в Москве" weighs on
      // Москва exactly as "in London" weighs on London.
      const names = new Set(admission.admitted.keys());
      const induced = induceAdpositions(sentences, { names, nominatives: admission.nominativeForms() })
        .filter((p) => !conventions.isPreposition(p.token));
      const oblExtraOf = new Map();
      if (induced.length) {
        for (const p of induced) conventions.learn('preposition', p.token, p.nameNext);
        const prepSet = new Set(induced.map((p) => p.token));
        for (const label of names) {
          let extra = 0;
          for (const si of admission.sightSent.get(label) || []) {
            const sent = sentences[si] || '';
            let at = sent.indexOf(label);
            while (at >= 0) {
              const prev = (sent.slice(0, at).match(/([\p{L}'’]+)\s*$/u) || [])[1];
              if (prev && prepSet.has(prev.toLowerCase())) extra++;
              at = sent.indexOf(label, at + 1);
            }
          }
          if (extra) oblExtraOf.set(label, extra);
        }
      }

      const speaker = new Map();   // id → its most-sighted label (the referent's best evidence)
      for (const [label, id] of admission.admitted) {
        const c = admission.counts.get(label) ?? 0;
        if (!speaker.has(id) || c > speaker.get(id).c) speaker.set(id, { label, c });
      }
      for (const [id, { label }] of speaker) {
        // The cased judge first (company counters, plus any recounted obliques); an uncased
        // figure has none, so its own particle-company verdict (readUncasedGrain) speaks instead.
        const g = admission.grainOf(label, { oblExtra: oblExtraOf.get(label) ?? 0 })
               ?? readUncasedGrain(uncasedByForm.get(label));
        if (!g) continue;                              // HELD — no clean signal, no event
        log.append({ op: 'DEF', id, key: 'grain', value: g.value, grain: g.grain,
                     cue: g.cue, defeasible: true, sentIdx: 0 }, EMIT);
      }
    }

    // Referents pointed at without a name are admitted INLINE in the main pass now (the centre
    // scanner in processSentence): their subject bonds land in reading order and their pronouns bind
    // through the field as they are read — no retroactive second cursor, no star-scale finalize pass.
    // The dependency order is honoured: the centre is instantiated (INS) before it is bonded (CON).
    // A defeasible figure-grain DEF marks each seated body a figure — its cue records HOW it was
    // found (by description, unnamed), not that it is a different kind of thing. And where the main
    // read minted an np-object LEMMA from a bare description in object position ("Frankenstein
    // pursued the wretch" → tgt lemma "wretch"), union that orphaned node onto the body, so the bond
    // the read DID make lands on the referent too — the object resolves to the creature, not a lemma.
    if (centreScanner.active) {
      const npEnd = new Set();
      for (const { rel } of candidates)
        if ((rel.op === 'CON' || rel.op === 'SIG') && rel.tgtKind === 'np') npEnd.add(rel.tgt);
      for (const body of centreScanner.bodies) {
        log.append({ op: 'DEF', id: body.id, key: 'grain', value: 'figure', grain: 'Figure',
                     cue: 'unnamed-referent', defeasible: true, sentIdx: 0 }, EMIT);
        // A talker-declared synonym ("the wretch" IS the creature, via nameReferent) is an auditable
        // SYN merge onto the body — the coref-as-proposal record.
        for (const alias of (body.mergedFrom || [])) {
          const from = alias.id || (alias.label && alias.label.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, ''));
          if (!from || from === body.id) continue;
          const syn = log.append({ op: 'SYN', kind: 'merge', from, to: body.id, label: body.label,
                                   sentIdx: 0, match: 'unnamed-alias', warrant: 'coreference' }, EMIT);
          log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                       reason: 'unnamed-referent-coreference', sentIdx: 0 }, EMIT);
        }
        for (const [head, b] of centreScanner.headToBody) {
          if (b.id !== body.id || head === body.id || !npEnd.has(head)) continue;
          const syn = log.append({ op: 'SYN', kind: 'merge', from: head, to: body.id, label: body.label,
                                   sentIdx: 0, match: 'unnamed-surface', warrant: 'description' }, EMIT);
          log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                       reason: 'unnamed-referent-description', head, sentIdx: 0 }, EMIT);
        }
      }
    }

    const tokensBySentence = sentences.map(s => new Set(tok(s)));

    // REFERENT-FIRST IDENTITY — built LAST, once the whole read (and its unnamed referents / merges)
    // is on the log, so the mention→referent quotient seeds from the finished label quotient. OFF
    // → skipped entirely, so the doc and log are byte-identical (acceptance 10).
    const referentApi = referentIdentity === 'mention'
      ? buildReferents({ log, sentences, admission, corefField, deixis, docId })
      : null;

    return {
      docId, text, sentences, log,
      tokensBySentence,
      ...(referentApi || {}),
      admission,
      conventions,                  // the learned-rules ledger (REC)
      metadata: metadata.byKey,     // the document's front-matter facts, by canonical key
      metaFields: metadata.fields,  // the harvested fields in reading order (label · value · sentIdx)
      mentions: admission.mentions, // id → unit indices
      // Modality-neutral contract: `units` is the reading sequence the spine
      // walks (here, sentences). An image adapter fills the same field with
      // regions; the operators, log, graph and reading levels are unchanged.
      units: sentences,
      modality: 'text',
      corefField,    // the referent field, incl. held standing descriptors (inspection)
      deixis,        // the first-person teller channel (inspection; post-hoc referentApiFor reads it)
      // The nameless bodies this read seated (creature/monster/wretch → one), already conventions-
      // filtered and past the whole-document star-scale floor — the clean, floor-passed centres,
      // NOT the raw census. Exposed so a re-parse at a SMALLER scope (nest.js segments a book into
      // chapters, and no single chapter carries enough of the epithet mass to re-clear the floor)
      // can inject them as `nameReferent`, keeping the figure the whole read already earned. Empty
      // ([]) whenever `unnamedReferents` is off, so the field is additive and never changes a
      // byte-identical parse.
      unnamedReferentBodies: centreScanner.bodies || [],
      state, // exposed for inspection; not for outside mutation
    };
    };  // end finalize

    // Driver selection. Default: one synchronous sweep, byte-identical to the forEach this
    // replaced (every test and golden parse takes this path). With a feedback sink: a
    // yielding sweep that reports progress, returning a Promise. `finalize()` runs once either way.
    if (!onProgress) {
      sentences.forEach(processSentence);
      return finalize();
    }
    const total = sentences.length;
    const chunk = Math.max(1, chunkSize | 0);
    onProgress({ phase: 'parse', done: 0, total });
    return (async () => {
      // A fixed count is a bad cost proxy — a dense passage runs past budget before the
      // count-based yield fires — so also time-box it. Never after the last sentence.
      const FRAME_BUDGET_MS = 32;
      let chunkStart = performance.now();
      for (let i = 0; i < total; i++) {
        processSentence(sentences[i], i);
        if (i + 1 < total && ((i + 1) % chunk === 0 || performance.now() - chunkStart >= FRAME_BUDGET_MS)) {
          onProgress({ phase: 'parse', done: i + 1, total });
          await new Promise(r => setTimeout(r, 0));
          chunkStart = performance.now();
        }
      }
      onProgress({ phase: 'parse', done: total, total });
      return finalize();
    })();
  };

  return { parse, state };
};

// One-shot convenience. Tests and the default ingest path use this form. Returns the
// doc synchronously; if `opts.onProgress` is supplied it returns a Promise<doc> instead
// (the chunked, yielding parse) — `await` it. Bare calls are unchanged.
export const parseText = (text, opts = {}) =>
  createParser(opts).parse(text, opts);
