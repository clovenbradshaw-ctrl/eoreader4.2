// Tier 3 #11 — hand-labeled sentence-boundary gold set (docs/parse-conformance-spec.md).
//
// "Hand-labeled boundary set. ~250 sentences drawn from the municipal, legal,
// and OCR fixtures, boundaries labeled once by hand. Report precision/recall
// on boundaries (not accuracy — the class is wildly imbalanced). Track the
// number as a committed baseline; a PR that lowers recall needs a written
// justification in the PR body."
//
// SCOPE, HONESTLY: two fixtures (78 gold sentences), not ~250 — a starter set
// in the same spirit as the fixture corpus itself (tests/conformance/fixtures/
// manifest's own scopeNote). Composition matters more than count at this size:
// both fixtures are dense with the exact adversarial cases #12 asks for
// (case captions, "v.", roman-numeral headings, a multi-clause statute
// citation), so the starter set already exercises real failure modes rather
// than padding out easy sentences.
//
// METHOD: each fixture was run through the real segmenter once
// (src/perceiver/parse/sentences.js segmentSentences, via doc.sentences),
// then every predicted unit was independently checked against a plain human
// reading of the source text — NOT against what the algorithm "meant" to do.
// Six real segmentation bugs were found this way (documented per-fixture
// below) and are reflected as boundary corrections here, not smoothed over.
// This file is corrected TEXT, not the engine's raw output — where a gold
// unit differs from what segmentSentences currently produces, that
// difference is exactly what tests/conformance-tier3-segmentation.test.js's
// precision/recall computation is measuring.
//
// A gold entry's `units` array must whitespace-collapse-equal a re-join of
// the fixture's real segmentation at the SAME source spans it corrects —
// i.e. every gold unit is either an unmodified predicted unit, two-or-more
// adjacent predicted units joined by a single space (a missed abbreviation
// merged them), or one predicted unit split at an internal space (a
// heading/party-block line wrongly welded to its neighbor). No gold unit
// introduces or removes any content character — see the test file's
// `assertSameContent` check, which enforces this mechanically.

export const GOLD_SETS = [
  {
    fixtureId: 'muni-council-minutes-01',
    // Corrections vs. the engine's raw 43-unit output, found by inspection:
    //   - "REGULAR MEETING OF THE CITY COUNCIL MINUTES — MARCH 11, 2025" is
    //     two title lines welded into one unit. Root cause: the heading/
    //     soft-wrap heuristic in segmentSentences (HEADING_MAX_WORDS = 4)
    //     only treats a same-paragraph line as its own heading unit when it
    //     has 4 words or fewer; both of these lines run longer (6 and 5
    //     tokens respectively, counting the em dash as a token), so neither
    //     qualifies and they soft-wrap together instead. A missed boundary.
    //   - "...at 6:30 p.m." | "in the Council Chambers..." and
    //     "...at 6:42 p.m." | "and was recorded..." are each one sentence
    //     wrongly split in two. Root cause: "p.m." (and "a.m.") is not in
    //     conventions/ledger.js's SEED_ABBREVIATIONS, so the period reads as
    //     a sentence-final mark. Two extra boundaries.
    units: [
      'CITY OF FAIRVIEW HEIGHTS',
      'REGULAR MEETING OF THE CITY COUNCIL',
      'MINUTES — MARCH 11, 2025',
      'The Fairview Heights City Council convened in regular session at 6:30 p.m. in the Council Chambers at City Hall.',
      'Mayor Patricia Owusu presided.',
      'Present were Council Members Daniel Reyes, Marion Vance, Harold Kim, and Beatrice Solano.',
      'Council Member Kim arrived at 6:42 p.m. and was recorded present for all subsequent votes.',
      'City Clerk Wendell Ashby recorded the minutes.',
      'City Attorney Renata Blackwood was also present.',
      'Mayor Owusu called the meeting to order and led the Pledge of Allegiance.',
      'She asked whether any member of the public wished to speak on items not on the agenda.',
      'Ms. Vance moved to approve the minutes of the February 25, 2025 meeting; Mr. Reyes seconded.',
      'The motion carried 4-0, with Kim not yet present.',
      'ITEM 3 — PUBLIC WORKS DEPARTMENT REPORT',
      'Director of Public Works Carla Fenwick presented the quarterly report on the Elm Street resurfacing project.',
      'Fenwick told the Council that the project remained on schedule and roughly eleven percent under the budget the Council had approved in October.',
      'She said her department expected to complete the final paving lift by the end of April, weather permitting.',
      'Reyes asked Fenwick whether the contractor, Ridgeline Paving, had met its minority-hiring commitments.',
      "Fenwick said her staff had reviewed Ridgeline's payroll records and found the contractor in compliance.",
      "Kim arrived during Fenwick's presentation and apologized for his lateness, explaining that he had been delayed at his employer.",
      'ITEM 4 — RESOLUTION 2025-14, ELM STREET CHANGE ORDER',
      'City Attorney Blackwood summarized Resolution 2025-14, which would authorize a change order of $84,200 for additional drainage work on Elm Street.',
      'Fenwick said the change order had been requested by Ridgeline Paving after a site survey found undocumented utility conflicts near the intersection with Birch Avenue.',
      "Solano asked whether the change order would affect the project's completion date.",
      'Fenwick said it would not.',
      'Vance moved to adopt Resolution 2025-14.',
      'Reyes seconded the motion.',
      "Kim asked to be recorded as abstaining, citing his employer's business relationship with a subcontractor on the project.",
      'The motion carried 3-0-1, with Kim abstaining.',
      'ITEM 5 — APPOINTMENT TO THE PLANNING COMMISSION',
      'Mayor Owusu recommended the appointment of Louis Marchetti to the vacant seat on the Planning Commission.',
      'Marchetti had submitted a letter of interest describing his twenty years of experience as a civil engineer.',
      'Solano moved to confirm the appointment; Kim seconded.',
      'The motion carried 4-0.',
      'ITEM 6 — CITIZEN COMMENTS',
      'A resident, Priya Nair, addressed the Council regarding noise complaints near the Elm Street construction site.',
      "Nair said the work crews had begun arriving before the hour permitted by the city's noise ordinance.",
      'Fenwick said she would investigate the complaint and report back to the Council at the next regular meeting.',
      'With no further business, Mayor Owusu adjourned the meeting at 7:58 p.m.',
      'Respectfully submitted,',
      'Wendell Ashby',
      'City Clerk',
    ],
  },
  {
    fixtureId: 'legal-order-01',
    // Corrections vs. the engine's raw 43-unit output, found by inspection:
    //   - "v." | "No. 25-CH-0417" (one case-caption line) wrongly split.
    //     Root cause: "v" (unlike the seeded "vs") is not in
    //     SEED_ABBREVIATIONS. One extra boundary.
    //   - "THE BOARD OF ZONING APPEALS OF THE CITY OF FAIRVIEW HEIGHTS, /
    //     Respondent," is the respondent's party-name-then-role block,
    //     structurally identical to "MERIDIAN HOLDINGS, LLC, / Petitioner,"
    //     above it (which DOES correctly split in two) — but this party name
    //     runs long enough (11-12 tokens across its two source lines) that
    //     HEADING_MAX_WORDS=4 never lets either line qualify as its own
    //     heading unit, so the whole three-line block welds into one. A
    //     missed boundary, and an inconsistency purely driven by name length.
    //   - "II." | "STANDARD OF REVIEW", "III." | "ANALYSIS", and
    //     "IV." | "CONCLUSION" each wrongly split a roman-numeral heading
    //     from its title. Root cause: the initial-vs-abbreviation check in
    //     sentences.js only exempts a SINGLE capital letter ("I." survives,
    //     immediately above, matching "J." for J. Austen); "II"/"III"/"IV"
    //     are two-to-three characters and fail that regex, and none of them
    //     is in SEED_ABBREVIATIONS either. Three extra boundaries.
    //   - The whole statute-and-case citation sentence ("See Tenn. Code Ann.
    //     § 27-9-101 et seq.; Watts v. Civil Serv. Bd., 606 S.W.2d 274, 276
    //     (Tenn. 1980).") is one sentence shredded into six units. Root
    //     cause: "Tenn" (twice), "Ann", "Serv", and "v" are all unseeded
    //     abbreviations — exactly the spec's own predicted case #12
    //     ("Tenn. Code Ann. § 39-13-101", "citation strings"). Five extra
    //     boundaries in one sentence.
    units: [
      'IN THE CHANCERY COURT FOR DAVIDSON COUNTY, TENNESSEE',
      'MERIDIAN HOLDINGS, LLC,',
      'Petitioner,',
      'v. No. 25-CH-0417',
      'THE BOARD OF ZONING APPEALS OF THE CITY OF FAIRVIEW HEIGHTS,',
      'Respondent,',
      'and',
      'PRIYA NAIR,',
      'Intervenor.',
      'ORDER DENYING MOTION FOR SUMMARY JUDGMENT',
      'This matter came before the Court on the Motion for Summary Judgment filed by Petitioner Meridian Holdings, LLC.',
      'Attorney Cyrus Feld appeared for Petitioner.',
      'Attorney Renata Blackwood appeared for Respondent the Board of Zoning Appeals of the City of Fairview Heights.',
      'Intervenor Priya Nair appeared pro se.',
      'Having considered the record, the briefs, and the arguments of counsel, the Court finds as follows.',
      'I. BACKGROUND',
      "Petitioner Meridian Holdings, LLC seeks judicial review of a decision by the Board of Zoning Appeals denying a variance requested for property located at 118 Birch Avenue.",
      "The Board's decision followed a public hearing at which Intervenor Nair, a neighboring property owner, testified in opposition to the variance.",
      'II. STANDARD OF REVIEW',
      'A decision of a board of zoning appeals is reviewed under the common law writ of certiorari standard.',
      'See Tenn. Code Ann. § 27-9-101 et seq.; Watts v. Civil Serv. Bd., 606 S.W.2d 274, 276 (Tenn. 1980).',
      'Under that standard, the Court does not reweigh the evidence but asks only whether the Board acted illegally, arbitrarily, or in excess of its jurisdiction.',
      'III. ANALYSIS',
      "Meridian Holdings, LLC argues that the Board's decision was arbitrary because the Board did not make written findings.",
      'The Board, through Blackwood, responds that the record — including the transcript of the hearing at which Nair testified — supports the denial notwithstanding the absence of separate written findings.',
      'The Court cannot resolve this dispute as a matter of law on the present record.',
      "Whether the Board's stated reasons, given orally at the hearing, are sufficient to sustain its decision presents a genuine issue that cannot be decided on summary judgment.",
      'IV. CONCLUSION',
      'For the foregoing reasons, the Motion for Summary Judgment filed by Meridian Holdings, LLC is DENIED.',
      'This matter shall proceed to trial on the merits.',
      'A pretrial conference is set for May 30, 2025.',
      'IT IS SO ORDERED.',
      '________________________________',
      'Hon. Delphine Ostrander',
      'Chancellor, Davidson County Chancery Court',
    ],
  },
];
