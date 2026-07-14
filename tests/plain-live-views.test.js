// The live explore-card projections — proving the plain surface's "Blind spots", "Map", "Timeline",
// and "Study guide" cards run over the person's REAL sources, not the worked scene. Each is an honest
// projection of the text: blind spots are real absences (named, never explained), the map is the
// things actually mentioned, the timeline is the dated documents. liveScene overlays them onto a
// scene so the surface renders live with the same code. See src/rooms/plain/live-views.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mentionsOf, candidateTerms, termStats, blindSpots, mapModel, timelineModel, studyGuideModel, liveScene,
} from '../src/rooms/plain/live-views.js';
import { parseText } from '../src/perceiver/parse/index.js';
import {
  blindSpotsOverSources, mapOverSources, timelineOverSources, studyGuideOverSources, liveModel,
} from '../src/rooms/plain/project.js';

const secText = (s) => (typeof s === 'string' ? s : s.text);

test('mentionsOf counts whole-word, case-insensitive occurrences', () => {
  assert.equal(mentionsOf('The Vendor met the vendor about vendors.', 'vendor'), 2);
  assert.equal(mentionsOf('nothing here', 'vendor'), 0);
});

test('candidateTerms surfaces recurring proper-noun phrases when no entities are given', () => {
  const terms = candidateTerms([{ text: 'Fusus is here. Fusus again. Downtown Partnership. Downtown Partnership.' }]);
  assert.ok(terms.includes('Fusus'));
  assert.ok(terms.includes('Downtown Partnership'));
});

test('blindSpots: a term named but never explained is a blind spot; an explained term is not', () => {
  const sources = [
    { id: 's1', label: 'One', text: 'The vendor delivered the hardware. The vendor invoiced the city. Fusus is a surveillance platform.' },
    { id: 's2', label: 'Two', text: 'Officials met the vendor again. Fusus is a platform the police run.' },
  ];
  const bs = blindSpots(sources, ['vendor', 'Fusus']);
  assert.equal(bs.length, 1, 'only the never-explained term');
  assert.equal(bs[0].name, '“vendor”');
  assert.match(bs[0].note, /Named 3 times across 2 sources\. Never explained\./);
});

test('mapModel: things are the most-mentioned; around holds an isolated, uncharacterized term; patterns recur', () => {
  const sources = [
    { id: 'a', date: 2024, text: 'Fusus is a camera. Fusus is a camera network. The budget is a line item.' },
    { id: 'b', date: 2025, text: 'The contract is a line item. Fusus appears here too. Zephyr showed up once.' },
  ];
  const m = mapModel(sources, ['Fusus', 'budget', 'contract', 'Zephyr'], { things: 1 });
  assert.equal(m.things[0], 'Fusus', 'the corpus leans on Fusus most');
  assert.ok(m.around.includes('Zephyr'), 'Zephyr is named in one source and never explained → around it');
  assert.ok(m.patterns.some((p) => /item/.test(p)), '"a line item" recurs across budget and contract');
  assert.equal(m.span.from, '2024');
  assert.equal(m.span.to, '2025');
});

test('timelineModel places dated documents in order and reports the undated honestly', () => {
  const tl = timelineModel([
    { id: 'a', label: 'Older', date: 2023 },
    { id: 'b', label: 'Newer', date: 2025 },
    { id: 'c', label: 'Undated' },
  ]);
  assert.equal(tl.dated, 2);
  assert.equal(tl.undated, 1);
  assert.equal(tl.marks[0].text, 'Older');
  assert.equal(tl.marks[1].text, 'Newer');
  assert.match(tl.marks[2].text, /no date/);
});

test('studyGuideModel composes three ordered movements from real signals', () => {
  const sources = [
    { id: 'a', text: 'Fusus is a camera. The vendor did work. The vendor did work again.' },
    { id: 'b', text: 'Fusus is a system.' },
  ];
  const g = studyGuideModel(sources, ['Fusus', 'vendor'], {
    disagreements: ['Fusus'], shifts: [{ term: 'Fusus', when: 'Feb 2025' }], blind: [{ name: '“vendor”' }],
  });
  assert.equal(g.groups.length, 3);
  assert.match(secText(g.groups[0].sections[0]), /2 documents/);
  assert.ok(g.groups[1].sections.some((s) => /Fusus/.test(secText(s))), 'the disagreement enters "how it fits"');
  const last = g.groups[2].sections;
  assert.ok(last.some((s) => typeof s === 'object' && s.star), 'a detected shift is a ✱ section');
  assert.ok(last.some((s) => /vendor/.test(secText(s))), 'the blind spot enters "where it breaks"');
});

test('liveScene: null / empty live returns the scene untouched', () => {
  const scene = { STUDY_GUIDE: { demo: 1 }, MAP: { demo: 1 }, BLIND_SPOTS: ['demo'], SHIFTS: { d: { marks: [] } }, SOURCES: ['x'] };
  assert.equal(liveScene(scene, null), scene);
  assert.equal(liveScene(scene, { sources: [] }), scene);
});

test('liveScene: overlays the live card models, memoizes, and falls through for the rest', () => {
  const scene = { STUDY_GUIDE: { demo: 1 }, MAP: { demo: 1 }, BLIND_SPOTS: ['demo'], SHIFTS: { d: { marks: [] } }, SOURCES: ['x'] };
  let calls = 0;
  const live = {
    sources: [{ id: 'a' }],
    studyGuide: () => { calls += 1; return { g: 1 }; },
    map: () => ({ m: 1 }), blindSpots: () => [{ b: 1 }], timeline: () => ({ marks: [1] }),
  };
  const S = liveScene(scene, live);
  assert.equal(calls, 0, 'lazy — nothing runs until a card is opened');
  assert.deepEqual(S.STUDY_GUIDE, { g: 1 });
  assert.deepEqual(S.STUDY_GUIDE, { g: 1 });
  assert.equal(calls, 1, 'memoized — the parse runs once');
  assert.deepEqual(S.MAP, { m: 1 });
  assert.deepEqual(S.BLIND_SPOTS, [{ b: 1 }]);
  assert.deepEqual(Object.values(S.SHIFTS)[0], { marks: [1] });
  assert.equal(S.SOURCES, scene.SOURCES, 'un-overlaid keys fall through to the scene');
});

test('liveScene: a throwing resolver falls back to an empty model, never to the demo', () => {
  const scene = { STUDY_GUIDE: { demo: 1 }, MAP: { demo: 1 }, BLIND_SPOTS: ['demo'], SHIFTS: { d: {} } };
  const live = {
    sources: [{ id: 'a' }], studyGuide: () => { throw new Error('boom'); },
    map: () => ({}), blindSpots: () => [], timeline: () => ({ marks: [] }),
  };
  const S = liveScene(scene, live);
  assert.deepEqual(S.STUDY_GUIDE.groups, [], 'empty, not the FUSUS demo');
});

test('project bridge: the card projections run over sources end-to-end', () => {
  const sources = [
    { id: 'budget', label: 'the budget', text: 'Surveillance is a line item. Surveillance is a line item.' },
    { id: 'court', label: 'the court', text: 'Surveillance is a thing done to people. Surveillance is a thing done to residents.' },
  ];
  assert.deepEqual(blindSpotsOverSources(sources, ['surveillance']), [], 'surveillance is explained everywhere');
  assert.ok(mapOverSources(sources, ['surveillance']).things.includes('surveillance'));
  assert.equal(timelineOverSources(sources).undated, 2);

  const g = studyGuideOverSources(sources, ['surveillance'], { parse: parseText });
  assert.ok(g.groups.length >= 1);
  assert.ok(
    g.groups.some((gr) => gr.sections.some((s) => /surveillance/i.test(secText(s)))),
    'the guide picks up the contested term via the real parser',
  );
});

test('the exact chain the surface uses: liveModel(app) → liveScene renders every card live', () => {
  // a minimal stand-in for window.EO.app — topicSources + entities, the shape rooms/reader/app.js exposes
  const app = {
    topicSources: () => [
      { sn: 1, title: 'Budget hearing', recordedAt: Date.UTC(2024, 0, 1),
        text: 'Surveillance is a line item. The vendor did the work. The vendor did the work again.' },
      { sn: 2, title: 'Court filing', recordedAt: Date.UTC(2025, 0, 1),
        text: 'Surveillance is a thing done to people. Surveillance is a thing done to residents.' },
    ],
    entities: () => [{ label: 'surveillance' }, { label: 'vendor' }],
  };
  const model = liveModel(app, { parse: parseText });
  const base = { STUDY_GUIDE: { demo: 1 }, MAP: { demo: 1 }, BLIND_SPOTS: ['demo'], SHIFTS: { d: {} }, SOURCES: [] };
  const S = liveScene(base, model);

  assert.ok(S.BLIND_SPOTS.some((b) => /vendor/.test(b.name)), 'the vendor is named but never explained');
  assert.ok(S.MAP.things.includes('surveillance'), 'the map leans on the real term');
  assert.equal(Object.values(S.SHIFTS)[0].dated, 2, 'the timeline places both dated documents');
  assert.ok(S.STUDY_GUIDE.groups.length >= 1, 'the study guide is built from the real sources');
  assert.match(S.STUDY_GUIDE.built, /2 sources/);
});
