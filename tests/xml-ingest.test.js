import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestXml } from '../src/organs/in/xml.js';

// ingestXml — the adapter onto the universal contract (mirrors organs/in/webpage.js): a TEI
// document's front matter lands FIRST in doc.text (searchable, same as everything else) while
// staying distinguishable by kind, and the structured header rides separately on doc.tei for a
// proper metadata card (rooms/reader/xml-render.js) rather than flattened prose.

const REAL_TEI = `<?xml version="1.0"?>
<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd" [
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd" >
%PersProse;
]>
<TEI.2>
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Elements</title>
        <author>Euclid</author>
        <editor role="editor">J. L. Heiberg</editor>
        &responsibility;
        &fund.NSF;
      </titleStmt>
      &Perseus.publish;
      <sourceDesc><bibl><author>Euclid</author><title>Euclidis Elementa</title>
        <imprint><pubPlace>Leipzig</pubPlace><publisher>Teubner</publisher><date>1883-1888</date></imprint>
      </bibl></sourceDesc>
    </fileDesc>
    <revisionDesc><change><date>12/1/97</date><item>base sdl file</item></change></revisionDesc>
  </teiHeader>
<text><body>
<div1 type="book" n="1">
<div2 type="type" n="Def">
<div3 type="number" n="1"><p>*shmei=o/n e)stin, ou(= me/ros ou)qe/n.</p></div3>
<div3 type="number" n="2"><p>*grammh\\ de\\ mh=kos a)plate/s.</p></div3>
</div2>
</div1>
</body></text></TEI.2>
`;

test('ingestXml: modality xml, front matter apart from body, both landing on doc.text', () => {
  const doc = ingestXml({ name: 'euc.elem_gk.xml', xml: REAL_TEI });
  assert.equal(doc.modality, 'xml');
  assert.equal(doc.isTei, true);
  assert.equal(doc.rootTag, 'TEI.2');
  assert.equal(doc.metadata.title, 'Elements');
  assert.equal(doc.metadata.author, 'Euclid');
  assert.ok(doc.text.startsWith('Elements'), 'the title leads the reading');
  assert.match(doc.text, /shmei=o\/n e\)stin/, 'the body text is present, verbatim');
  assert.deepEqual(doc.unresolvedEntities, ['responsibility', 'fund.NSF', 'Perseus.publish']);
});

test('ingestXml: doc.tei carries the structured header for a metadata card, apart from doc.spans’ prose', () => {
  const doc = ingestXml({ name: 'x', xml: REAL_TEI });
  assert.equal(doc.tei.title, 'Elements');
  assert.deepEqual(doc.tei.authors, ['Euclid']);
  assert.equal(doc.tei.publisher, 'Teubner');
  assert.equal(doc.tei.revisions.length, 1);
});

test('ingestXml: doc.spans keeps the title/frontmatter blocks distinguishable by kind, filterable from the body', () => {
  const doc = ingestXml({ name: 'x', xml: REAL_TEI });
  const kinds = new Set(doc.spans.map((s) => s.kind));
  assert.ok(kinds.has('title'));
  assert.ok(kinds.has('frontmatter'));
  const body = doc.spans.filter((s) => s.kind !== 'title' && s.kind !== 'frontmatter');
  assert.equal(body.length, 4);   // 2 division labels + 2 definitions
  assert.equal(body[0].kind, 'label');
  assert.equal(body[1].kind, 'paragraph');
});

test('ingestXml: the doc reads through the same universal machinery every other modality gets', () => {
  const doc = ingestXml({ name: 'x', xml: REAL_TEI });
  assert.equal(typeof doc.reading, 'function');
  assert.equal(typeof doc.spanAt, 'function');
  assert.ok(doc.sentences.length > 0);
  assert.equal(doc.sentences.length, doc.spans.length);
});

test('ingestXml: a generic (non-TEI) XML source still ingests, with no separate front matter', () => {
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>A Feed</title><item><title>Post One</title><description>First post.</description></item></channel></rss>';
  const doc = ingestXml({ name: 'feed.xml', xml: rss, metadata: { title: 'fallback title' } });
  assert.equal(doc.modality, 'xml');
  assert.equal(doc.isTei, false);
  assert.equal(doc.tei, null);
  // no <teiHeader> title was found, so the caller-supplied fallback title is kept.
  assert.equal(doc.metadata.title, 'fallback title');
  assert.match(doc.text, /A Feed/);
  assert.match(doc.text, /First post\./);
});

test('ingestXml: never throws on malformed or empty input', () => {
  assert.doesNotThrow(() => ingestXml({ name: 'x', xml: '<a><b>unclosed' }));
  assert.doesNotThrow(() => ingestXml({ name: 'x', xml: '' }));
  assert.doesNotThrow(() => ingestXml({}));
});
