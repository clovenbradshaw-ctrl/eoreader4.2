import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestTable } from '../src/organs/in/table.js';
import { answerTable, answerOverTables, isTableQuery } from '../src/rooms/data/query.js';
import { parseAmount, parseDate, classifyColumn, formatMoney } from '../src/rooms/data/values.js';
import { answerMathSync, isMathQuery, nlToExpression } from '../src/enactor/answer/math.js';

// The fluent NL→math.js bridge over a table (rooms/data). The dataset mirrors a real CRM
// export: a NOTE LOG (several notes per account, ARR repeated and spelled inconsistently —
// "$410k", "410000", "USD 98,000", "£180k", "EUR 85,000", "$275k (down from $310k…)") and a
// support-ticket table. The point of the tests is that a quantitative question is COMPUTED
// (currency-aware, de-duplicated to distinct accounts, cell-cited), and a SUBTEXT question
// is declined so the turn falls through to the grounded reading.

const ACCOUNTS = ingestTable({
  name: 'account_notes',
  columns: ['note_id', 'account', 'rep', 'logged_at', 'tier', 'arr', 'health_flag', 'notes'],
  rows: [
    ['N-001', 'Ridgeline Health', 'D. Okafor', '2025-04-12', 'Enterprise', '$410k', 'green', 'QBR went fine.'],
    ['N-002', 'Ridgeline Health', 'M. Chen', '2025-09-30', 'Tier 1', '410000', 'red', 'They are running an RFP.'],
    ['N-003', 'Northwind Logistics', 'S. Ibarra', '2025-03-03', 'Mid-Market', 'USD 98,000', 'green', 'Third outage this quarter.'],
    ['N-004', 'Northwind Logistics', 'S. Ibarra', '2025-08-02', 'MM', '98000', 'yellow', 'Gustavo has left.'],
    ['N-005', 'Calderon & Voss', 'R. Mbeki', '2025-05-05', 'Enterprise', '$275k (down from $310k, they de-scoped)', 'yellow', 'Enablement gap, not a feature gap.'],
    ['N-006', 'Bluepeak Fintech', 'M. Chen', '2025-04-02', 'Enterprise', 'GBP 180,000', 'green', 'Data residency by November.'],
    ['N-007', 'Vantage Retail Group', 'R. Mbeki', '2025-05-19', 'Enterprise', '$520k', 'green', 'Our biggest and quietest account.'],
    ['N-008', 'Vantage Retail Group', 'R. Mbeki', '2025-10-06', 'ENT', '$520k', 'yellow', 'Always evaluating.'],
    ['N-009', 'Meridian Foods', 'J. Larkin', '2025-01-22', 'SMB', '$24k', 'green', 'Best kind of account.'],
    ['N-010', 'Halcyon Robotics', 'S. Ibarra', '2025-03-18', 'Mid-Market', '$140k', 'green', 'Reference customer.'],
    ['N-011', 'Stelvio Energy', 'J. Larkin', '2025-02-28', 'Enterprise', 'EUR 85,000', 'green', 'German docs are a blocker.'],
  ],
});
const TICKETS = ingestTable({
  name: 'support_tickets',
  columns: ['ticket_id', 'opened_at', 'submitted_by', 'priority', 'subject'],
  rows: [
    ['T-1001', '2025-04-18', 'p.raman@ridgelinehealth.org', 'normal', 'export slow'],
    ['T-1002', '2025-05-02', 'ops@northwind-log.com', '1 - Urgent', 'sync failed AGAIN'],
    ['T-1003', '2025-05-14', 'j.hollis@cascademed.com', 'high', 'Access for merged entity'],
    ['T-1006', '2025-07-15', 'k.oyelaran@bluepeak.co.uk', 'P2', 'data residency'],
    ['T-1008', '2025-08-11', 'w.duran@ridgelinehealth.org', 'high', 'Security questionnaire - Q31'],
    ['T-1009', '2025-08-21', 'm.santos@northwind-log.com', 'normal', 'batch window question'],
  ],
});
const DOCS = [ACCOUNTS, TICKETS];

// ── the value parser (values.js) ─────────────────────────────────────────────
test('parseAmount reads money honestly across currencies, suffixes and separators', () => {
  assert.equal(parseAmount('$410k').value, 410000);
  assert.equal(parseAmount('$410k').currency, 'USD');
  assert.equal(parseAmount('410000').value, 410000);
  assert.equal(parseAmount('USD 98,000').value, 98000);
  assert.equal(parseAmount('£180k').value, 180000);
  assert.equal(parseAmount('£180k').currency, 'GBP');
  assert.equal(parseAmount('EUR 85,000').value, 85000);
  assert.equal(parseAmount('85000 EUR').currency, 'EUR');
});

test('parseAmount takes the FIRST figure, never concatenating an aside', () => {
  // the old strip-non-digits turned this into 275310; the value is 275000.
  assert.equal(parseAmount('$275k (down from $310k, they de-scoped)').value, 275000);
});

test('a date cell is not read as an amount, and parseDate reads ISO', () => {
  assert.equal(parseAmount('2025-04-12'), null);
  assert.equal(parseDate('2025-04-12').value, 20250412);
  assert.equal(parseDate('not a date'), null);
});

test('classifyColumn types the columns of the ARR log', () => {
  assert.equal(classifyColumn(ACCOUNTS.column('arr')).kind, 'money');
  assert.equal(classifyColumn(ACCOUNTS.column('arr')).mixed, true);          // USD + GBP + EUR
  assert.equal(classifyColumn(ACCOUNTS.column('logged_at')).kind, 'date');
  assert.equal(classifyColumn(ACCOUNTS.column('health_flag')).kind, 'categorical');
});

// ── counts ────────────────────────────────────────────────────────────────────
test('counts distinguish the ENTITY (accounts) from the raw ROW (notes)', () => {
  assert.match(answerTable('how many accounts are there', ACCOUNTS).text, /8 accounts/);
  assert.match(answerTable('how many notes are there', ACCOUNTS).text, /11 notes/);
  assert.match(answerTable('how many tickets are there', TICKETS).text, /6 tickets/);
});

test('a filtered count resolves fluent synonyms and counts distinct accounts', () => {
  assert.match(answerTable('how many accounts are at risk', ACCOUNTS).text, /4 of 8 accounts/);      // red|yellow
  assert.match(answerTable('how many enterprise accounts are there', ACCOUNTS).text, /5 of 8 accounts/); // Enterprise/ENT/Tier 1
  assert.match(answerTable('how many mid-market accounts', ACCOUNTS).text, /2 of 8 accounts/);       // Mid-Market/MM
});

test('a filtered count over the ticket table maps priority words', () => {
  assert.match(answerTable('how many tickets are high priority', TICKETS).text, /3 of 6 tickets/);   // high|P2
  assert.match(answerTable('how many urgent tickets are there', TICKETS).text, /1 of 6 tickets/);    // 1 - Urgent
});

// ── sums / averages (currency-aware, de-duplicated) ─────────────────────────────
test('total ARR keeps currencies apart and de-duplicates to distinct accounts', () => {
  const a = answerTable('what is the total ARR', ACCOUNTS);
  assert.match(a.text, /\$1,467,000/);           // USD distinct total
  assert.match(a.text, /£180,000/);
  assert.match(a.text, /€85,000/);
  assert.match(a.text, /8 distinct accounts/);
  assert.equal(a.kind, 'sum');
});

test('a filtered sum computes on distinct accounts, not repeated notes', () => {
  // red|yellow accounts: Ridgeline 410k, Northwind 98k, Calderon 275k, Vantage 520k (all USD)
  const a = answerTable('combined ARR of the at-risk accounts', ACCOUNTS);
  assert.match(a.text, /\$1,303,000/);
  assert.equal(a.record.engine, 'math.js');
  assert.ok(a.record.cells.length >= 4, 'the answer cites the cells it added');
});

test('total by a single tier of ONE currency gives a single figure', () => {
  const a = answerTable('total ARR of SMB accounts', ACCOUNTS);
  assert.match(a.text, /\$24,000/);
  assert.doesNotMatch(a.text, /currencies/);     // one account, one currency
});

test('average ARR is currency-aware', () => {
  const a = answerTable('average ARR', ACCOUNTS);
  assert.equal(a.kind, 'mean');
  assert.match(a.text, /averages/);
});

// ── min / max / rank / sort / top-N ─────────────────────────────────────────────
test('highest / lowest resolve to distinct accounts', () => {
  assert.match(answerTable('which account has the highest ARR', ACCOUNTS).text, /Vantage Retail Group — \$520,000/);
  assert.match(answerTable('which account has the lowest ARR', ACCOUNTS).text, /Meridian Foods — \$24,000/);
});

test('rank / top-N returns distinct accounts in order (no repeated notes)', () => {
  const r = answerTable('rank accounts by ARR', ACCOUNTS);
  assert.equal(r.kind, 'rank');
  const lines = r.text.split('\n').filter((l) => /^\s+\d+\./.test(l));
  assert.equal(lines.length, 8, 'eight distinct accounts, not eleven notes');
  assert.match(lines[0], /Vantage Retail Group/);
  assert.match(lines[7], /Meridian Foods/);
  const top2 = answerTable('top 2 accounts by ARR', ACCOUNTS).text.split('\n').filter((l) => /^\s+\d+\./.test(l));
  assert.equal(top2.length, 2);
});

test('sort ascending flips the order', () => {
  const r = answerTable('sort accounts by arr ascending', ACCOUNTS);
  const lines = r.text.split('\n').filter((l) => /^\s+\d+\./.test(l));
  assert.match(lines[0], /Meridian Foods/);
});

// ── group-by ────────────────────────────────────────────────────────────────────
test('group-by count of accounts folds the tier spellings and counts distinct accounts', () => {
  const r = answerTable('how many accounts per tier', ACCOUNTS);
  assert.equal(r.kind, 'group');
  assert.match(r.text, /enterprise: 5/);         // Enterprise + ENT + Tier 1 folded
  assert.match(r.text, /mid-market: 2/);
  assert.match(r.text, /SMB: 1/);
});

test('group-by total ARR by tier is currency-aware per group', () => {
  const r = answerTable('total ARR by tier', ACCOUNTS);
  assert.match(r.text, /enterprise:/);
  assert.match(r.text, /\$1,205,000/);           // USD enterprise subtotal
});

// ── share / percent (fluent NL + math.js) ───────────────────────────────────────
test('percent of a total computes through math.js', () => {
  const a = answerTable('what is 15% of the total ARR', ACCOUNTS);
  assert.match(a.text, /\$220,050/);             // 15% of 1,467,000
  assert.equal(a.record.op, 'multiply');
  assert.match(a.record.expr, /15 \/ 100/);
});

test('a share question divides a subset by the total', () => {
  const a = answerTable('what percent of total ARR is Vantage', ACCOUNTS);
  assert.match(a.text, /\$520,000/);
  assert.match(a.text, /%/);
  assert.equal(a.record.op, 'divide');
});

// ── numeric filter ──────────────────────────────────────────────────────────────
test('a numeric threshold filters the money column', () => {
  // accounts with ARR > 200k: Ridgeline 410, Calderon 275, Vantage 520 → 3
  assert.match(answerTable('how many accounts have arr over 200k', ACCOUNTS).text, /3 of 8 accounts/);
});

// ── table selection across two tables ───────────────────────────────────────────
test('answerOverTables routes each question to the table it is about', () => {
  assert.equal(answerOverTables('how many accounts are at risk', DOCS).table, 'account_notes');
  assert.equal(answerOverTables('how many tickets are high priority', DOCS).table, 'support_tickets');
});

test('answerOverTables returns the mechanical terminate shape', () => {
  const a = answerOverTables('how many accounts are there', DOCS);
  assert.equal(a.route, 'table');
  assert.equal(a.answer, a.text);
  assert.deepEqual(a.sources, []);
});

// ── the strict gate: subtext questions DEFER (return null → grounded reading) ────
test('a subtext / reasoning question is NOT answered by the table computer', () => {
  const deferred = [
    'what is this about',
    "what's the tell",
    'who is acme-partners working for',
    'what has a rep promised a customer that we have not shipped',
    'rank the accounts by unspoken frustration',            // "by <non-column>" must not fall back to ARR
    'sort renewals by the deadline that actually matters',
    'which ticket is a symptom of an enablement problem',
    'is the Northwind failure and the Ridgeline 2am job the same bug',
  ];
  for (const q of deferred) {
    assert.equal(answerOverTables(q, DOCS), null, `should defer: ${q}`);
    assert.equal(isTableQuery(q, ACCOUNTS), false, `should defer: ${q}`);
  }
});

test('a filter with no aggregation verb does not fire (no bare-filter answers)', () => {
  // names a value (acme-partners in submitted_by) but asks no computation
  assert.equal(answerTable('tell me about acme-partners', TICKETS), null);
});

// ── the loose NL arithmetic surface (answer/math.js) ────────────────────────────
test('nlToExpression makes number-only natural phrasings computable', () => {
  assert.match(answerMathSync('what is 20% of 410k').text, /82000/);
  assert.match(answerMathSync('410k plus 98k').text, /508000/);
  assert.match(answerMathSync('half of 500').text, /250/);
  assert.match(answerMathSync('1.5m divided by 3').text, /500000/);
  assert.ok(isMathQuery('15% of 2000'));
});

test('the NL math gate stays strict — document words never become math', () => {
  for (const q of ['how many accounts are green', 'rank accounts by ARR', 'what is this about', 'the 2am job']) {
    assert.equal(answerMathSync(q), null, `should not be math: ${q}`);
    assert.equal(isMathQuery(q), false, `should not be math: ${q}`);
  }
});

test('formatMoney renders the currency symbol', () => {
  assert.equal(formatMoney(275000, 'USD'), '$275,000');
  assert.equal(formatMoney(180000, 'GBP'), '£180,000');
  assert.equal(formatMoney(85000, 'EUR'), '€85,000');
});
