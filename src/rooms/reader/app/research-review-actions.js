// EO — one section of the reader session controller, split from app/research-review.js (the
// god-module ratchet, ~250 lines/file): the discover/review/admit lifecycle lives there; the
// reader-JUDGMENT actions layered on top of a computed review live here — overriding a computed
// duplicate cluster (§7.4), confirming or rejecting a cross-source identity match (§7.3), running a
// narrowly-scoped gap search that lands in the SAME review topic (§9), and opening one waveform
// mark's shared evidence-modal payload (§6.1). None of this mutates the reviewed candidates
// themselves — only the judgments layered over them (independentOverrides, identityDecisions) or,
// for gap search, the same reviewFetchOne pipeline reviewStart already uses.
import { gapSearchQueries } from '../research-review-corpus.js';
import { markPayload } from '../research-review-waveform.js';
import { nowIso } from './util.js';

export const installResearchReviewActions = (appCtx) => {
  const { client, emit, logIt, state } = appCtx;

  // reviewToggleIndependent(topicId, sn) → "Mark as independent" (§7.4): overrides a computed
  // duplicate-cluster judgment for ONE source, without disputing the identity fact itself.
  const reviewToggleIndependent = (topicId, sn) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return;
    const ov = new Set(t.review.independentOverrides || []);
    const marking = !ov.has(sn);
    if (marking) ov.add(sn); else ov.delete(sn);
    t.review.independentOverrides = [...ov];
    logIt('review', marking ? 'Marked a candidate as independent' : 'Restored the computed cluster', sn);
    appCtx.persist(); emit('topics');
  };

  // reviewClusterAction(topicId, originSn, action) → the derivative-cluster batch actions (§7.4):
  // 'keep-origin' excludes every derivative in the cluster (corroboration stays honest — one voice,
  // one source); 'keep-all' un-excludes every member (the derivatives add distinct reporting angles
  // worth keeping even though they share an origin).
  const reviewClusterAction = (topicId, originSn, action) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return;
    const view = appCtx.reviewCompute(topicId); if (!view) return;
    const cluster = view.clusters.find((c) => c.origin.sn === originSn); if (!cluster) return;
    const ex = new Set(t.review.excludedSns || []);
    if (action === 'keep-origin') for (const d of cluster.derivative) ex.add(d.sn);
    else if (action === 'keep-all') for (const m of cluster.members) ex.delete(m.sn);
    else return;
    t.review.excludedSns = [...ex]; t.review.recipe = 'custom';
    logIt('review', action === 'keep-origin' ? 'Kept only the apparent origin' : 'Kept every reporting perspective', originSn);
    appCtx.persist(); emit('topics');
  };

  // reviewSetIdentity(topicId, key, decision) → confirm/reject a cross-source referent-identity
  // candidate (§7.3). decision ∈ 'aligned' | 'separate' | null (reset to 'candidate', the computed
  // default). The decision and its grounds (the key names the shared referent core) are preserved
  // with the review, never silently re-guessed on the next reviewCompute.
  const reviewSetIdentity = (topicId, key, decision) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return;
    const decisions = { ...(t.review.identityDecisions || {}) };
    if (decision === 'aligned' || decision === 'separate') decisions[key] = decision;
    else delete decisions[key];
    t.review.identityDecisions = decisions;
    logIt('review', decision === 'aligned' ? 'Identity match confirmed' : decision === 'separate' ? 'Identity match rejected' : 'Identity match reset', key);
    appCtx.persist(); emit('topics');
  };

  // reviewExpand(topicId, { template, area, queryAddendum, reviewK }) → the gap-directed search
  // actions (§9): a narrowly-scoped query (gapSearchQueries' deterministic templates, or an explicit
  // addendum) runs through the SAME discover→fetch→admit-to-review pipeline reviewStart uses, and
  // the results land in THIS review topic — never a new one (§9: "New results enter the same review
  // rather than creating another topic").
  const reviewExpand = (topicId, { template = null, area = null, queryAddendum = null, reviewK = 4 } = {}) =>
    appCtx.runCancellable({ kind: 'review', label: 'Searching for more evidence…' }, async (signal) => {
      const t = appCtx.topicById(topicId); if (!t || !t.review) return 0;
      if (state.activeTopicId !== topicId) appCtx.setTopic(topicId);
      const q = queryAddendum || (template && area ? gapSearchQueries(t.review.query, area)[template] : null);
      if (!q) return 0;
      const seenUrls = new Set([
        ...t.sourceSns.map((sn) => appCtx.sourceBySn(sn)?.url).filter(Boolean),
        ...(t.review.discovered || []).map((d) => d.url),
      ]);
      let items = [];
      try { items = await client.search(q, { kind: 'auto', k: reviewK * 3, signal }); }
      catch (e) { if (signal.aborted) throw e; return 0; }
      const fresh = items.filter((it) => it.url && !seenUrls.has(it.url)).slice(0, reviewK);
      let count = 0;
      for (const item of fresh) {
        try { if (await appCtx.reviewFetchOne(item, q, signal)) count++; } catch (e) { if (signal.aborted) throw e; }
      }
      logIt('review', `Searched for more evidence — "${q}"`, `${count} added`);
      appCtx.persist(); emit('topics'); emit('sources');
      return count;
    });

  // reviewVerifyAnswer(topicId) → the one place a model may touch this screen, and only as a
  // CLASSIFIER, never a generator. leadExcerpt's Born-rule margin test (research-review-corpus.js:
  // bornSalience ranks, deriveNull gates) already abstained — confident:false — before this is ever
  // reachable; a real semantic read is exactly what that abstention said a term-space score
  // couldn't give. Asks the warmed local model ONE bounded yes/no question against the excerpt
  // ALREADY chosen and quoted verbatim — only the verdict is kept, never any model prose, so the
  // displayed excerpt text never changes, only its confidence badge does. User-triggered (never
  // fired on render) so opening a thin result never silently downloads or warms a model.
  const reviewVerifyAnswer = (topicId) =>
    appCtx.runCancellable({ kind: 'review-verify', label: 'Checking this answer with the local model…' }, async (signal) => {
      const t = appCtx.topicById(topicId); if (!t || !t.review) return null;
      const view = appCtx.reviewCompute(topicId);
      const answer = view && view.answer;
      if (!answer || answer.confident) return answer ? answer.confident : null;
      const m = await appCtx.ensureModel();
      if (signal.aborted || !m) return null;
      const prompt = `Question: ${t.review.query}\nPassage: "${answer.text}"\n\nDoes the passage directly answer the question? Reply with exactly one word: yes or no.`;
      let reply = '';
      try { reply = await m.phrase([{ role: 'user', content: prompt }], { maxTokens: 4, temperature: 0, signal }); }
      catch (e) { if (signal.aborted) throw e; return null; }
      const verdict = /^\s*yes\b/i.test(String(reply || '').trim());
      t.review.answerCheck = { sn: answer.sn, query: t.review.query, verdict, checkedAt: nowIso() };
      logIt('review', verdict ? 'Local model confirmed this answer' : 'Local model could not confirm this answer', answer.sn);
      appCtx.persist(); emit('topics');
      return verdict;
    });

  // reviewOpenMark(topicId, sn, ordinal) → the shared evidence-modal payload for one waveform mark
  // (§6.1), computed lazily on click rather than for every bar up front. `ordinal` is the turn's
  // own `idx` (research-review-waveform.js's bars carry it).
  const reviewOpenMark = (topicId, sn, ordinal) => {
    const t = appCtx.topicById(topicId); if (!t || !t.review) return null;
    const eot = appCtx.eotFor(sn);
    const turn = (eot?.turns || []).find((x) => x.idx === ordinal);
    if (!turn) return null;
    const src = appCtx.sourceBySn(sn); if (!src) return null;
    let matrix = null; try { matrix = appCtx.comparisonMatrix(); } catch { matrix = null; }
    let docId = null; try { docId = appCtx.docFor(src)?.docId ?? null; } catch { docId = null; }
    return markPayload({ sn, title: src.title, domain: src.domain }, turn, { eot, matrix, docId });
  };

  Object.assign(appCtx, {
    reviewToggleIndependent, reviewClusterAction, reviewSetIdentity, reviewExpand, reviewOpenMark,
    reviewVerifyAnswer,
  });
};
