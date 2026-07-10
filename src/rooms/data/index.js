// EO: NUL·SIG·EVA(Field → Lens,Void, Binding,Clearing) — barrel
// data/index.js — the tabular surface: a CSV/spreadsheet as DATA, not prose.
//
// A table imports as columns + rows (organs/in/table.js already parses it); this
// holon answers quantitative questions over it by COMPUTING through math.js
// (query.js), and renders it as a real table you can read and cite from
// (surface.js → render.js). The reader opens a table in its own tab and, when a
// chat is scoped to it, routes counting/summing/averaging asks through here.

export { answerTable, isTableQuery } from './query.js';
export { mountDataSurface } from './surface.js';
