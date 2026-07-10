import { test } from 'node:test';
import assert from 'node:assert/strict';

import { significanceReflectMessages, reflectionInput, cleanReflection } from '../src/surfer/fold/index.js';

// The reflect prompt carries the DEF→EVA decomposition the surfer already computed (the frame
// the reading held vs the arrival that strained/confirmed it), branches on the verdict, and
// asks for a COMPLETION of the reading's note — no meta-vocabulary to parrot. cleanReflection
// is the backstop, not the heavy lifting.

test('reflectionInput builds the frame/arrival/verdict decomposition from the deep-reader ctx', () => {
  const doc = { sentences: ['Bees dance to point at food.', 'The whole hive runs on that shared signal.', 'A lone bee starves.'] };
  const strain = reflectionInput(null, { doc, cursor: 1, focus: 'the hive', surprise: 0.6, band: 0.3 });
  assert.equal(strain.frame, 'Bees dance to point at food.');       // back=1 — what was held
  assert.equal(strain.arrival, 'The whole hive runs on that shared signal.');
  assert.equal(strain.verdict, 'strain');                            // surprise 0.6 >= band 0.3
  assert.equal(strain.highStrain, true);                            // 0.6 > 0.3*1.6
  assert.equal(strain.focus, 'the hive');
  const confirm = reflectionInput(null, { doc, cursor: 1, surprise: 0.1, band: 0.3 });
  assert.equal(confirm.verdict, 'confirm');                          // surprise 0.1 < band 0.3
});

test('the prompt carries the decomposition, branches on verdict, and echoes no meta-vocabulary', () => {
  const strain = significanceReflectMessages({ frame: 'Bees dance to point at food.', arrival: 'The whole hive runs on that shared signal.', verdict: 'strain', focus: 'the hive' });
  assert.match(strain[1].content, /Held: Bees dance to point at food\./);
  assert.match(strain[1].content, /Then: The whole hive runs on that shared signal\./);
  assert.match(strain[1].content, /Note on the hive: $/);
  assert.match(strain[0].content, /cut against it/);                 // the strain voice
  assert.ok(!/surprising|interesting|connection/i.test(strain[1].content), 'no echoable meta-vocabulary in the ask');

  const confirm = significanceReflectMessages({ frame: 'a', arrival: 'b', verdict: 'confirm' });
  assert.match(confirm[0].content, /landed where the reader was already heading/);

  const recast = significanceReflectMessages({ frame: 'a', arrival: 'b', verdict: 'strain', highStrain: true });
  assert.match(recast[0].content, /read differently/);               // the gated REC invitation
});

test('cleanReflection strips a leaked preamble and keeps one plain sentence', () => {
  assert.equal(
    cleanReflection('Certainly! The most surprising thing is that eruptions are driven by gas, not heat. Also, lava cools fast.'),
    'The most surprising thing is that eruptions are driven by gas, not heat.',
  );
  assert.equal(
    cleanReflection("Here's the point: dolphins name each other with signature whistles."),
    'Dolphins name each other with signature whistles.',   // stripped lead ⇒ capitalized tail
  );
});

test('cleanReflection strips a list lead and unwraps a quote', () => {
  assert.equal(cleanReflection('- The reef is an animal, not a rock.'), 'The reef is an animal, not a rock.');
  assert.equal(cleanReflection('“Bees vote on where to nest.”'), 'Bees vote on where to nest.');
});

test('cleanReflection rejects a pure-scaffold or empty residue', () => {
  assert.equal(cleanReflection('Certainly!'), '');
  assert.equal(cleanReflection(''), '');
  assert.equal(cleanReflection('   '), '');
});

test('cleanReflection rejects a restatement of the source but keeps a genuine reaction', () => {
  const frame = 'Dolphins communicate with signature whistles that function like names.';
  const arrival = 'Bottlenose dolphins live in social pods that cooperate when hunting.';
  // an echo of the arrival is a non-judgment
  assert.equal(cleanReflection('Bottlenose dolphins live in social pods that cooperate when hunting.', { against: [frame, arrival] }), '');
  // a reaction that connects the two survives
  assert.equal(
    cleanReflection('Their whistles are what let the pod hunt as one.', { against: [frame, arrival] }),
    'Their whistles are what let the pod hunt as one.',
  );
});

test('cleanReflection passes a clean single sentence through unchanged', () => {
  const s = 'The press did not just copy books faster; it made a fixed, shareable text possible.';
  assert.equal(cleanReflection(s), s);
});

test('cleanReflection strips the parroted evaluation frame, leaving the observation', () => {
  // the exact frames the 0.5B model echoed from a "most surprising/interesting" prompt
  assert.equal(
    cleanReflection('The most surprising and interesting aspect of stratovolcanoes is their ability to create long-lasting eruptions.'),
    'Their ability to create long-lasting eruptions.',
  );
  assert.equal(
    cleanReflection("The most surprising and interesting aspect of dolphin behavior I've observed is how they utilize echolocation to navigate and hunt."),
    'How they utilize echolocation to navigate and hunt.',
  );
  assert.equal(
    cleanReflection('The most surprising thing about the reef is that it is built by living animals.'),
    'It is built by living animals.',
  );
  // two pieces that parroted the SAME frame now differ in their surviving tails (de-churned)
  const a = cleanReflection('The most surprising and interesting aspect of dolphins is how they name each other.');
  const b = cleanReflection('The most surprising and interesting aspect of dolphins is how they sleep with half a brain.');
  assert.notEqual(a, b);
  assert.ok(!/most surprising/i.test(a) && !/most surprising/i.test(b));
});

test('cleanReflection strips the parroted CONNECTION frame, leaving the link', () => {
  assert.equal(
    cleanReflection('The connection between echolocation and whistles is that both rely on sound to organise social life.'),
    'Both rely on sound to organise social life.',
  );
  assert.equal(
    cleanReflection('These statements imply that magma composition governs how violently a volcano erupts.'),
    'Magma composition governs how violently a volcano erupts.',
  );
  assert.equal(
    cleanReflection('Together they suggest that the reef and the algae are one organism, not two.'),
    'The reef and the algae are one organism, not two.',
  );
});
