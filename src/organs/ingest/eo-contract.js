// EO contracts for the ingest holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/organs/ingest/eot-emit.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'inverse renderer: log -> EOT surface' }),
  'src/organs/ingest/eot.js': contract({ ops: ['INS', 'SIG', 'DEF', 'NUL', 'CON', 'SYN', 'SEG', 'EVA', 'REC'], targets: ['Field'], products: ['Entity', 'Network'], stances: ['Making', 'Binding', 'Dissecting'], note: 'EOT ingester: surface -> tuples/log' }),
  'src/organs/ingest/arxiv.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'arXiv library — whole papers via ar5iv' }),
  'src/organs/ingest/bytes.js': contract({ ops: ['SIG', 'SEG', 'INS', 'CON', 'SYN'], targets: ['Void'], products: ['Field', 'Network'], stances: ['Clearing', 'Binding', 'Composing'], note: 'universal byte ingestion — structure from any input via slot induction' }),
  'src/organs/ingest/feed.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'RSS/Atom feeds read whole — items as sources/table/doc' }),
  'src/organs/ingest/api.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'generic JSON/REST APIs — navigate to records, admit as source + table' }),
  'src/organs/ingest/civic.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'civic/government APIs — catalog find + CKAN/Socrata dataset discovery' }),
  'src/organs/ingest/direct-cors.js': contract({ ops: ['SEG'], targets: ['Network'], products: ['Network'], stances: ['Dissecting'], note: 'CORS-direct fetch targets — route the common search hosts around the proxy' }),
  'src/organs/ingest/gutenberg.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'Project Gutenberg library — whole books' }),
  'src/organs/ingest/github.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'GitHub library — repos, files, whole codebases (via the code organ)' }),
  'src/organs/ingest/libraries.js': contract({ ops: ['DEF', 'SIG'], targets: ['Field'], products: ['Lens', 'Paradigm'], stances: ['Dissecting', 'Binding'], note: 'library shelf — the customized surface per source kind' }),
  'src/organs/ingest/openalex.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'OpenAlex catalog — scholarly discovery + citation prior' }),
  'src/organs/ingest/index.js': contract({ ops: ['SIG', 'INS', 'SEG', 'NUL'], targets: ['Void', 'Field', 'Network'], products: ['Entity', 'Field', 'Network', 'Void'], stances: ['Binding', 'Making', 'Clearing'], note: 'barrel' }),
  'src/organs/ingest/opfs-store.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Void'], stances: ['Tending'], note: 'raw web-content store (OPFS binary)' }),
  'src/organs/ingest/read.js': contract({ ops: ['EVA', 'SYN'], targets: ['Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Composing'], note: 'read a doc into layered EoT' }),
  'src/organs/ingest/webfetch.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void', 'Field'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'live fetch/search client over CORS proxy' }),
  'src/organs/ingest/websource.js': contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Atmosphere'], stances: ['Binding', 'Making'], note: 'admit web pages as groundable sources' }),
  'src/organs/ingest/wikimedia.js': contract({ ops: ['SIG', 'SEG'], targets: ['Void'], products: ['Field'], stances: ['Binding', 'Dissecting'], note: 'Wikimedia reference shelf + Wikidata' }),
});
