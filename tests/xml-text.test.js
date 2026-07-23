import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stripProlog, rootTagOf, isTeiRoot, splitTeiHeader, teiHeaderMeta,
  xmlBodyToBlocks, unresolvedXmlEntities, stripTags, parseXmlDocument,
} from '../src/organs/ingest/xml-text.js';

// Grounded in a REAL Perseus/TEI file — the opensource "euc.elem_gk.xml" (Euclid's Elements,
// Greek, via github.com/LukeMurphey/perseus-greek-and-roman-texts) — trimmed to its header and
// its first two Book-I definitions, verbatim down to the DOCTYPE's internal-subset entity
// declarations and the custom &responsibility;/&fund.NSF;/&Perseus.publish; header shorthand
// this exact P4-era corpus uses. This is the file that, read through an HTML parser instead of
// as XML, produces the run-on "Euclid J. L. Heiberg Perseus Project, Tufts University Gregory
// Crane Prepared under the supervision of…" wall of text the bug report showed — its own
// <div1>/<div2>/<div3> divisions carry NO <head> anywhere (23 definitions, numbered postulates,
// common notions, propositions — a book's worth of structure), read entirely off their own
// @n/@type attributes.
const REAL_TEI = `<?xml version="1.0"?>
<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd" [
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd" >
%PersProse;
]>
<TEI.2>
  <teiHeader type="text" status="new">
    <fileDesc>
      <titleStmt>
	<title>Elements</title>
	<title type="sub">Machine readable text</title>
	<author n="Euc.">Euclid</author>
	<editor role="editor" n="Heiberg">J. L. Heiberg</editor>
      &responsibility;
      &fund.NSF;
      </titleStmt>
	&Perseus.publish;
      <sourceDesc>
	<biblStruct>
	  <monogr>
	    <author>Euclid</author>
	    <title>Euclidis Elementa</title>
	    <editor role="editor">J. L. Heiberg</editor>
	    <imprint>
	      <pubPlace>Leipzig</pubPlace>
	      <publisher>Teubner</publisher>
	      <date>1883-1888</date>
	    </imprint>
	  </monogr>
	</biblStruct>
      </sourceDesc>
    </fileDesc>
    <encodingDesc>
      <refsDecl doctype="TEI.2">
        <state unit="book"/>
        <state unit="type"/>
        <state unit="number"/>
      </refsDecl>
    </encodingDesc>
    <profileDesc>
      <langUsage><language id="greek">Greek</language></langUsage>
    </profileDesc>
    <revisionDesc>
      <change><date>12/1/97</date>
	<respStmt><name>DAS</name><resp>ed.</resp></respStmt>
	<item>base sdl file</item></change>
    </revisionDesc>
  </teiHeader>
<text>
<body>
<div1 type="book" n="1">
<div2 type="type" n="Def">
  <div3 type="number" n="1"><p>*shmei=o/n e)stin, ou(= me/ros ou)qe/n.</p></div3>
<div3 type="number" n="2"><p>*grammh\\ de\\ mh=kos a)plate/s.</p></div3>
</div2>
</div1>
</body></text></TEI.2>
`;

test('stripProlog removes the XML declaration and a DOCTYPE with an internal subset in one piece', () => {
  const cleaned = stripProlog(REAL_TEI);
  assert.ok(!cleaned.includes('<?xml'), 'the declaration is gone');
  assert.ok(!cleaned.includes('<!DOCTYPE'), 'the doctype is gone');
  assert.ok(!cleaned.includes('%PersProse;'), 'the internal subset (and its PE reference) went with it, not left as stray content');
  assert.ok(cleaned.startsWith('<TEI.2>'), 'the real root element survives, untouched');
});

test('rootTagOf / isTeiRoot recognise TEI.2 (P3/P4) and TEI (P5, xmlns) roots, and reject a non-TEI one', () => {
  const root = rootTagOf(stripProlog(REAL_TEI));
  assert.equal(root.name, 'TEI.2');
  assert.equal(isTeiRoot(root), true);
  assert.equal(isTeiRoot(rootTagOf('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text/></TEI>')), true);
  assert.equal(isTeiRoot(rootTagOf('<rss version="2.0"><channel/></rss>')), false);
  assert.equal(isTeiRoot(null), false);
});

test('splitTeiHeader separates the header from the body it introduces', () => {
  const { headerXml, bodyXml } = splitTeiHeader(stripProlog(REAL_TEI));
  assert.ok(headerXml.includes('<title>Elements</title>'));
  assert.ok(!bodyXml.includes('<teiHeader'), 'the header is gone from what remains');
  assert.ok(bodyXml.includes('<div1 type="book" n="1">'), 'the body is intact');
});

test('teiHeaderMeta scopes title/author/editor/sponsor/funder to titleStmt, not the whole header', () => {
  const { headerXml } = splitTeiHeader(stripProlog(REAL_TEI));
  const meta = teiHeaderMeta(headerXml);
  assert.equal(meta.title, 'Elements');
  assert.equal(meta.subtitle, 'Machine readable text');
  // author/editor appear a SECOND time inside sourceDesc's citation of the print source — scoped
  // extraction (+ dedup) means the front-matter fields read once, not "by Euclid, Euclid".
  assert.deepEqual(meta.authors, ['Euclid']);
  assert.deepEqual(meta.editors, ['J. L. Heiberg']);
  assert.equal(meta.publisher, 'Teubner');
  assert.equal(meta.pubPlace, 'Leipzig');
  assert.equal(meta.sourceDesc, 'Euclid Euclidis Elementa J. L. Heiberg Leipzig Teubner 1883-1888');
  // the change-log's OWN respStmt (who made THAT revision) must not leak into the document's
  // own responsibility statement — it sits in revisionDesc, outside titleStmt.
  assert.deepEqual(meta.respStmts, []);
  assert.deepEqual(meta.revisions, ['12/1/97 DAS ed. base sdl file']);
});

test('unresolvedXmlEntities names the custom header entities this P4 corpus leaves for its external DTD', () => {
  assert.deepEqual(unresolvedXmlEntities(REAL_TEI), ['responsibility', 'fund.NSF', 'Perseus.publish']);
  assert.deepEqual(unresolvedXmlEntities('<a>x &amp; y &lt;z&gt;</a>'), [], 'the five standard entities are never reported as unresolved');
  assert.deepEqual(unresolvedXmlEntities('<a>&#233; &#x2019;</a>'), [], 'numeric character references are not entity names at all');
});

test('xmlBodyToBlocks: a division with no <head> anywhere reads by its own @n/@type, coalesced into one breadcrumb', () => {
  const { bodyXml } = splitTeiHeader(stripProlog(REAL_TEI));
  const blocks = xmlBodyToBlocks(bodyXml);
  // depth counts <text> and <body> too (both are structural DIV_TAGS), so a div1>div2>div3
  // nest sits at depth 5, not 3 — the number only matters for heading-size styling, never for
  // the (correctly depth-independent) text/kind the reader actually shows.
  assert.deepEqual(blocks, [
    { text: '1 · Def · 1', kind: 'label', level: 5 },
    { text: '*shmei=o/n e)stin, ou(= me/ros ou)qe/n.', kind: 'paragraph', level: null },
    { text: '2', kind: 'label', level: 5 },
    { text: '*grammh\\ de\\ mh=kos a)plate/s.', kind: 'paragraph', level: null },
  ]);
});

test('xmlBodyToBlocks: a self-closing line-break milestone never glues two words together', () => {
  // an un-numbered <div> (no @n/@type) contributes no label block, so the paragraph is blocks[0].
  const blocks = xmlBodyToBlocks('<div><p>one word<lb n="5"/>two words</p></div>');
  assert.equal(blocks[0].text, 'one word two words');
});

test('xmlBodyToBlocks: an inline point-label element keeps its text without leaking its tag', () => {
  const blocks = xmlBodyToBlocks('<div><p>the segment <num>*a*b</num> is drawn.</p></div>');
  assert.equal(blocks[0].text, 'the segment *a*b is drawn.');
});

test('xmlBodyToBlocks: an empty element (a figure placeholder with no digitised diagram) contributes nothing', () => {
  const blocks = xmlBodyToBlocks('<div><p>before<figure></figure>after</p></div>');
  assert.equal(blocks[0].text, 'beforeafter');
  assert.equal(blocks.length, 1);
});

test('xmlBodyToBlocks: a real <head> is used as a heading, and division labels only fire when there is no head', () => {
  const blocks = xmlBodyToBlocks('<div1 n="2"><head>Book Two</head><p>Some prose.</p></div1>');
  assert.deepEqual(blocks[0], { text: '2', kind: 'label', level: 1 });
  assert.deepEqual(blocks[1], { text: 'Book Two', kind: 'heading', level: 1 });
  assert.deepEqual(blocks[2], { text: 'Some prose.', kind: 'paragraph', level: null });
});

test('xmlBodyToBlocks: list items are their own blocks — the availability rights statement stays a real list', () => {
  const blocks = xmlBodyToBlocks('<p>This text may be freely distributed, subject to the following restrictions:</p><list><item>You credit Perseus.</item><item>You leave this intact.</item></list>');
  assert.deepEqual(blocks.map((b) => [b.kind, b.text]), [
    ['paragraph', 'This text may be freely distributed, subject to the following restrictions:'],
    ['item', 'You credit Perseus.'],
    ['item', 'You leave this intact.'],
  ]);
});

test('stripTags decodes entities and CDATA while dropping markup, for short leaf fields', () => {
  assert.equal(stripTags('<a>Smith &amp; Sons</a>'), 'Smith & Sons');
  assert.equal(stripTags('<x><![CDATA[plain cdata text]]></x>'), 'plain cdata text');
  assert.equal(stripTags('  spread   across\nlines  '), 'spread across lines');
});

test('parseXmlDocument: the whole real fixture, header apart from body, nothing swallowed', () => {
  const r = parseXmlDocument(REAL_TEI);
  assert.equal(r.isTei, true);
  assert.equal(r.rootTag, 'TEI.2');
  assert.equal(r.meta.title, 'Elements');
  assert.deepEqual(r.unresolvedEntities, ['responsibility', 'fund.NSF', 'Perseus.publish']);
  assert.equal(r.blocks.length, 4);
  assert.equal(r.blocks[1].text, '*shmei=o/n e)stin, ou(= me/ros ou)qe/n.');
});

test('parseXmlDocument: a non-TEI XML document still reads correctly, just with no separate header', () => {
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>A Feed</title><item><title>Post One</title><description>First post.</description></item></rss>';
  const r = parseXmlDocument(rss);
  assert.equal(r.isTei, false);
  assert.equal(r.meta, null);
  assert.ok(r.blocks.some((b) => b.kind === 'heading' && b.text === 'A Feed'));
  assert.ok(r.blocks.some((b) => b.kind === 'heading' && b.text === 'Post One'));
  assert.ok(r.blocks.some((b) => b.text === 'First post.'));
});

test('parseXmlDocument never throws on malformed input', () => {
  assert.doesNotThrow(() => parseXmlDocument('<a><b>unclosed'));
  assert.doesNotThrow(() => parseXmlDocument('not xml at all'));
  assert.doesNotThrow(() => parseXmlDocument(''));
  assert.doesNotThrow(() => parseXmlDocument(null));
});
