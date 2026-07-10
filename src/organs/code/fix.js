// EO: REC·EVA(Lens → Field, Composing,Binding) — merge issues into the preserved original
// The merge — fixes folded INTO the preserved original, then re-read to prove it.
//
// The medium was never lossy: the organ holds the SOURCE beside the reading (the same
// way an eotDoc keeps its sentences), so a fix is not "decompile the tuples" — it is a
// REC over the preserved original text, LOCATED by the reading's witnesses (line:col in
// every finding's sign), followed by the checkpoint the helix demands: re-read the
// merged text through the whole organ and require the findings gone. Change arrives as
// a new assembly, never as an edit inside an old one (EO for Coders, C.3) — the merge
// returns NEW file texts and the verification verdict; the caller decides what to keep.
//
// WHAT MERGES (the mechanically safe subset — each fix is local, witnessed, and
// verified by the re-read; everything else stays a report):
//   bare-except          `except:`               → `except Exception:` (stops swallowing
//                        KeyboardInterrupt/SystemExit; narrowing further is a human call)
//   shared-default       `def f(x=[])`           → `x=None` + an `if x is None: x = []`
//                        guard under the def (after its docstring)
//   tail-drop            `range(len(x) - 1)`     → `range(len(x))`
//   unbounded-resource   `fh = open(…)` … `fh.close()` → `with open(…) as fh:` with the
//                        block re-indented and the close dropped (skipped, reported,
//                        when the close is not found in the same block)
//   dangling-task        `ensure_future(EXPR)` at statement → `await EXPR` (correct and
//                        awaited; serialized — gather is the concurrent form, a human call)
//   void-identity        `x == float("nan")`     → `math.isnan(x)` (`!=` → `not …`),
//                        inserting `import math` if the module lacks it — and the
//                        re-read proves the new thread binds
//
// mergeIssues(files, opts) → { files, applied, skipped, verify } where verify carries
// the before/after finding counts from the organ's own re-read. Nothing is asserted
// that the re-read can't witness.

import { readCodebase } from './read.js';

const INDENT = '    ';

// ── the per-law menders — each takes the file's lines and one finding ────────────
// A mender edits lines in place and returns a short description, or null to skip.
const MENDERS = {
  'bare-except': (lines, f) => {
    const i = f.line - 1;
    const next = lines[i].replace(/^(\s*)except\s*:/, '$1except Exception:');
    if (next === lines[i]) return null;
    lines[i] = next;
    return 'except: → except Exception: (no longer swallows the interrupts)';
  },

  'shared-default': (lines, f) => {
    const i = f.line - 1;
    const m = /([A-Za-z_][A-Za-z0-9_]*)(\s*:\s*[A-Za-z_][\w[\].]*)?\s*=\s*(\[\s*\]|\{\s*\}|list\(\s*\)|dict\(\s*\)|set\(\s*\))/.exec(lines[i]);
    if (!m) return null;
    const name = m[1];
    const literal = m[3].replace(/\s+/g, '');
    lines[i] = lines[i].replace(m[0], `${m[1]}${m[2] ?? ''} = None`);
    // the guard goes at the top of the body, after a docstring if one opens there
    const defIndent = /^(\s*)/.exec(lines[i])[1];
    let at = i + 1;
    const dq = /^\s*(?:[rbfuRBFU]{0,2})("""|''')/.exec(lines[at] ?? '');
    if (dq) {
      const q = dq[1];
      if (!(lines[at].indexOf(q, lines[at].indexOf(q) + 3) >= 0)) {       // multi-line docstring
        at++;
        while (at < lines.length && !lines[at].includes(q)) at++;
      }
      at++;
    }
    const bodyIndent = defIndent + INDENT;
    lines.splice(at, 0, `${bodyIndent}if ${name} is None:`, `${bodyIndent}${INDENT}${name} = ${literal}`);
    return `${name}=${literal} → ${name}=None + is-None guard (one INS per call, not one per def)`;
  },

  'tail-drop': (lines, f) => {
    const i = f.line - 1;
    const next = lines[i].replace(/range\s*\(\s*len\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*-\s*1\s*\)/, 'range(len($1))');
    if (next === lines[i]) return null;
    lines[i] = next;
    return 'range(len(x) - 1) → range(len(x)) (the partition covers its tail)';
  },

  'unbounded-resource': (lines, f) => {
    const i = f.line - 1;
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*open\s*\((.*)\)\s*$/.exec(lines[i]);
    if (!m) return null;
    const [, indent, name, args] = m;
    // the block to bind: forward to `name.close()` at the same indent, nothing shallower between
    let close = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 80); j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const li = /^(\s*)/.exec(line)[1];
      if (li.length < indent.length) break;                               // left the block — no close here
      if (li.length === indent.length && new RegExp(`^\\s*${name}\\s*\\.\\s*close\\s*\\(\\s*\\)`).test(line)) { close = j; break; }
    }
    if (close < 0) return null;                                           // not the simple shape — a human call
    lines[i] = `${indent}with open(${args}) as ${name}:`;
    for (let j = i + 1; j < close; j++) if (lines[j].trim()) lines[j] = INDENT + lines[j];
    lines.splice(close, 1);
    return `${name} = open(…) → with open(…) as ${name}: (the clearing is bound to the boundary)`;
  },

  'dangling-task': (lines, f) => {
    const i = f.line - 1;
    const m = /^(\s*)(?:asyncio\s*\.\s*)?(?:ensure_future|create_task)\s*\((.*)\)\s*$/.exec(lines[i]);
    if (!m) return null;
    lines[i] = `${m[1]}await ${m[2]}`;
    return 'ensure_future(…) → await … (witnessed; serialized — asyncio.gather is the concurrent form)';
  },

  'void-identity': (lines, f) => {
    const i = f.line - 1;
    let next = lines[i]
      .replace(/([A-Za-z_][\w.\][]*)\s*==\s*float\s*\(\s*['"]nan['"]\s*\)/i, 'math.isnan($1)')
      .replace(/([A-Za-z_][\w.\][]*)\s*!=\s*float\s*\(\s*['"]nan['"]\s*\)/i, 'not math.isnan($1)')
      .replace(/float\s*\(\s*['"]nan['"]\s*\)\s*==\s*([A-Za-z_][\w.\][]*)/i, 'math.isnan($1)')
      .replace(/float\s*\(\s*['"]nan['"]\s*\)\s*!=\s*([A-Za-z_][\w.\][]*)/i, 'not math.isnan($1)');
    if (next === lines[i]) return null;
    lines[i] = next;
    // the fix draws a new thread — make sure it binds
    if (!lines.some((l) => /^\s*import\s+math\b|^\s*from\s+math\s+import\b/.test(l))) {
      let at = 0;
      for (let j = 0; j < lines.length; j++) if (/^(import|from)\s/.test(lines[j])) at = j + 1;
      lines.splice(at, 0, 'import math');
      return '== float("nan") → math.isnan(…) + import math (the thread binds)';
    }
    return '== float("nan") → math.isnan(…) (NaN equals nothing; ask the frame, not identity)';
  },
};

export const FIXABLE_LAWS = Object.freeze(Object.keys(MENDERS));

// ── the merge ─────────────────────────────────────────────────────────────────────
// mergeIssues(files, opts) — reads the corpus, merges every fixable finding into the
// PRESERVED originals (bottom-up per file, so line numbers stay true while editing),
// then re-reads the merged corpus: the checkpoint. opts pass through to readCodebase.
export const mergeIssues = (files, opts = {}) => {
  const before = readCodebase(files, { ...opts, doc: false });
  const byPath = new Map(files.map((f) => [f.path, { path: f.path, lines: String(f.text).split('\n'), changed: false }]));
  const applied = [];
  const skipped = [];

  // bottom-up: later lines first, so earlier fixes never shift a later finding's site
  const fixable = before.issues
    .filter((f) => MENDERS[f.law] && f.path && byPath.has(f.path) && f.line != null)
    .sort((a, b) => (a.path === b.path ? b.line - a.line : String(a.path).localeCompare(String(b.path))));

  for (const f of fixable) {
    const file = byPath.get(f.path);
    const did = MENDERS[f.law](file.lines, f);
    if (did) {
      file.changed = true;
      applied.push({ law: f.law, path: f.path, line: f.line, did });
    } else {
      skipped.push({ law: f.law, path: f.path, line: f.line, why: 'not the mendable shape — a human call' });
    }
  }

  const merged = files.map((f) => {
    const file = byPath.get(f.path);
    return { path: f.path, text: file ? file.lines.join('\n') : f.text, changed: file?.changed ?? false };
  });

  // the checkpoint: re-read the merged corpus; the fix must witness its own success
  const after = readCodebase(merged, { ...opts, doc: false });
  const count = (r) => r.issues.reduce((a, x) => ((a[x.severity] = (a[x.severity] ?? 0) + 1), a), {});
  return Object.freeze({
    files: merged,
    applied, skipped,
    verify: Object.freeze({
      before: Object.freeze({ counts: count(before), issues: before.issues }),
      after: Object.freeze({ counts: count(after), issues: after.issues }),
      mendedLawsRemaining: after.issues.filter((x) => MENDERS[x.law]).length,
    }),
  });
};
