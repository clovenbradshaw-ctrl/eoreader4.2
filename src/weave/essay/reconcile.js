// EO: EVA(Network → Lens, Tracing,Binding) — global reconciliation pass
// essay/reconcile.js — the global pass over the assembled draft.
//
// Each section was written with a small workspace, so cross-section drift is
// possible even when every gate passed: a contradiction no single ledger
// caught (the offending entry may have compressed out of the carry), a
// promise still open at the end, the same claim bound twice, a section that
// serves no through-line. Reconciliation folds the WHOLE assembled record —
// the projection, which never compresses — and names each finding as a
// revision task scoped to one section. This is also where corrections to
// frozen accepted sections land: the sections themselves are never reopened
// mid-run.
//
// Pure: findings out, no events in. The driver turns them into
// reconcileFinding events; a caller iterating to a clean pass re-runs the
// section it revises and folds again.

import { contradicts, repeats, termsOf, termSimilarity } from './terms.js';
import { validateSurface } from './renderers.js';

export const reconcile = (essay, { thesisFloor = 0.1 } = {}) => {
  const findings = [];
  const accepted = essay.sections.filter((s) => s.state === 'accepted');

  // The validator holds whatever the modality, at the global pass too: every
  // non-text surface (a section's chart or pull quote, a seam's) must still
  // match the payloads it bound — a mismatch here means a renderer bug or a
  // tampered log, and it is named, not smoothed over.
  const allCommitments = accepted.flatMap((s) => s.commitments);
  for (const s of accepted) {
    if (s.surface) {
      const check = validateSurface(s.surface, s.commitments);
      if (!check.ok) findings.push({ kind: 'surface-mismatch', sectionId: s.id, detail: { violations: check.violations } });
    }
    if (s.seam && s.seam.modality !== 'divider' && s.seam.modality !== 'text') {
      const check = validateSurface(s.seam, allCommitments);
      if (!check.ok) findings.push({ kind: 'surface-mismatch', sectionId: s.id, detail: { seam: true, violations: check.violations } });
    }
  }

  // Contradiction across sections — and, separately, redundancy: the same
  // claim bound in two places with nothing new under it.
  for (let i = 0; i < accepted.length; i++) {
    for (let j = i + 1; j < accepted.length; j++) {
      for (const a of accepted[i].commitments) {
        for (const b of accepted[j].commitments) {
          if (contradicts(a.claim, b.claim)) {
            findings.push({
              kind: 'contradiction', sectionId: accepted[j].id,
              detail: { a: { claim: a.claim, sectionId: a.sectionId }, b: { claim: b.claim, sectionId: b.sectionId } },
            });
          } else if (repeats(a.claim, b.claim)) {
            const known = new Set(a.spanRefs);
            if (!b.spanRefs.some((r) => !known.has(r))) {
              findings.push({
                kind: 'redundancy', sectionId: accepted[j].id,
                detail: { claim: b.claim, alsoIn: accepted[i].id },
              });
            }
          }
        }
      }
    }
  }

  // Threads still open at the end — unpaid promises.
  for (const th of essay.openThreads) {
    findings.push({
      kind: 'unpaid-thread', sectionId: th.openedAt,
      detail: { threadId: th.id, text: th.text, dueBy: th.dueBy },
    });
  }

  // Thesis coverage — a section whose commitments never touch the
  // through-line does not serve it.
  if (essay.thesis) {
    const thesisTerms = termsOf(essay.thesis);
    for (const s of accepted) {
      let best = 0;
      for (const c of s.commitments) {
        const { sim } = termSimilarity(termsOf(c.claim), thesisTerms);
        if (sim > best) best = sim;
      }
      if (s.commitments.length && best < thesisFloor) {
        findings.push({ kind: 'off-thesis', sectionId: s.id, detail: { contact: Math.round(best * 1000) / 1000 } });
      }
    }
  }

  return findings;
};
