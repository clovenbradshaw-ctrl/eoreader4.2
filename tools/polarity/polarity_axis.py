#!/usr/bin/env python3
"""
polarity_axis.py — fit a yes/no (polarity) direction from the canon and, more
importantly, try hard to prove it is NOT a direction.

    pip install sentence-transformers numpy scikit-learn
    python3 polarity_axis.py --model intfloat/multilingual-e5-small

Design notes
------------
The paired structure is the whole point. Because affirmative and negative
share every content word, the difference vector

    d_i = emb(neg_i) - emb(aff_i)

cancels topic, register, and (mostly) length. Averaging d_i over the canon
gives a difference-in-means estimator of the polarity direction. This is the
same estimator used for steering/probe directions in the interpretability
literature; a paired canon is what makes it cheap and clean.

Three things must be true before you trust the axis:

  1. HOLD-OUT FRAME. Fit on 11 frames, test on the 12th. If accuracy collapses
     on F07 (nominal predicate) or F09 (prohibitive), you learned a morpheme,
     not a polarity.
  2. HOLD-OUT LANGUAGE. Fit on English+Romance, test on Japanese/Korean/Irish.
     If it collapses, you learned "the token 'not'", and the axis will not
     transfer.
  3. CONFOUND CONTROLS. The axis must NOT separate:
       - long vs short sentences (HC44/HC45)
       - positive vs negative sentiment (HC46/HC47/HC48)
       - antonyms from negations (HC01-HC04)
     Report those separately. A high headline number with a failed control is
     a length detector or a sentiment detector wearing a costume.
"""
import argparse, json, itertools
import numpy as np

def load(path):
    return [json.loads(l) for l in open(path, encoding="utf-8")]

def unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.clip(n, 1e-12, None)

def fit_direction(E_aff, E_neg, method="diffmeans"):
    """Return a unit vector pointing from AFFIRMATIVE toward NEGATIVE."""
    if method == "diffmeans":
        d = (E_neg - E_aff).mean(axis=0)
    elif method == "lda":
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
        X = np.vstack([E_aff, E_neg])
        y = np.r_[np.zeros(len(E_aff)), np.ones(len(E_neg))]
        d = LinearDiscriminantAnalysis(solver="eigen", shrinkage="auto").fit(X, y).coef_[0]
    elif method == "pca":
        # first PC of the difference vectors — robust to a few bad pairs
        D = E_neg - E_aff
        D = D - D.mean(0)
        _, _, Vt = np.linalg.svd(D, full_matrices=False)
        d = Vt[0]
        if float(np.mean((E_neg - E_aff) @ d)) < 0:
            d = -d
    else:
        raise ValueError(method)
    return unit(d)

def pair_accuracy(E_aff, E_neg, d):
    """Fraction of pairs where proj(neg) > proj(aff). Chance = 0.5."""
    return float(np.mean((E_neg @ d) > (E_aff @ d)))

def cohens_d(a, b):
    s = np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2) + 1e-12
    return float((b.mean() - a.mean()) / s)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="intfloat/multilingual-e5-small")
    ap.add_argument("--pairs", default="canon_pairs.jsonl")
    ap.add_argument("--hard",  default="hard_cases.jsonl")
    ap.add_argument("--method", default="diffmeans", choices=["diffmeans","lda","pca"])
    ap.add_argument("--prefix", default="", help="e5 models want 'query: '")
    ap.add_argument("--min-conf", default="C", choices=["A","B","C"])
    args = ap.parse_args()

    from sentence_transformers import SentenceTransformer
    m = SentenceTransformer(args.model)
    enc = lambda xs: unit(np.asarray(
        m.encode([args.prefix + x for x in xs], normalize_embeddings=True,
                 batch_size=64, show_progress_bar=False), dtype=np.float64))

    order = {"A": 0, "B": 1, "C": 2}
    P = [p for p in load(args.pairs) if order[p["confidence"]] <= order[args.min_conf]]
    A = enc([p["affirmative"] for p in P])
    N = enc([p["negative"]    for p in P])
    langs  = np.array([p["lang"]     for p in P])
    frames = np.array([p["frame_id"] for p in P])

    # -- 0. the problem, quantified -------------------------------------------
    cos = np.sum(A * N, axis=1)
    print(f"model: {args.model}")
    print(f"pairs: {len(P)}  langs: {len(set(langs))}  frames: {len(set(frames))}")
    print(f"\n[0] cos(affirmative, negative) — how invisible is negation?")
    print(f"    mean {cos.mean():.4f}   median {np.median(cos):.4f}   "
          f"min {cos.min():.4f}   frac>0.90: {np.mean(cos>0.90):.2%}")
    print("    (a proposition and its denial should NOT be near-identical)")

    # -- 1. in-sample -----------------------------------------------------------
    d = fit_direction(A, N, args.method)
    print(f"\n[1] in-sample pair accuracy ({args.method}): {pair_accuracy(A,N,d):.3f}")
    print(f"    effect size (Cohen's d): {cohens_d(A@d, N@d):.2f}")

    # -- 2. hold-one-frame-out --------------------------------------------------
    print("\n[2] hold-one-FRAME-out  (does the axis survive an unseen negation type?)")
    for f in sorted(set(frames)):
        tr, te = frames != f, frames == f
        dd = fit_direction(A[tr], N[tr], args.method)
        acc = pair_accuracy(A[te], N[te], dd)
        flag = "  <-- FAILS" if acc < 0.75 else ""
        print(f"    {f}: {acc:.3f}{flag}")

    # -- 3. hold-one-language-out ------------------------------------------------
    print("\n[3] hold-one-LANGUAGE-out  (does the axis transfer, or is it 'not'?)")
    rows = []
    for l in sorted(set(langs)):
        tr, te = langs != l, langs == l
        dd = fit_direction(A[tr], N[tr], args.method)
        rows.append((pair_accuracy(A[te], N[te], dd), l))
    for acc, l in sorted(rows):
        flag = "  <-- FAILS" if acc < 0.75 else ""
        print(f"    {l}: {acc:.3f}{flag}")

    # -- 4. the harsh one: fit on English only ------------------------------------
    tr = langs == "en"
    d_en = fit_direction(A[tr], N[tr], args.method)
    print(f"\n[4] fit on ENGLISH ONLY -> all other languages: "
          f"{pair_accuracy(A[~tr], N[~tr], d_en):.3f}")
    print(f"    cos(d_english, d_multilingual) = {float(d_en @ d):.3f}")
    print("    A high number here is the whole reason to build a multilingual canon.")

    # -- 5. confound controls ------------------------------------------------------
    H = load(args.hard)
    by = lambda cat: [h for h in H if h["category"] == cat]

    def control(name, cat, expect):
        items = by(cat)
        if not items: return
        E = enc([h["text"] for h in items])
        s = E @ d
        print(f"\n    {name}")
        for h, v in zip(items, s):
            print(f"      {v:+.3f}  [{h['label']}] {h['text'][:64]}")
        print(f"      -> {expect}")

    print("\n[5] CONFOUND CONTROLS — projection onto the polarity axis")
    control("length (a length-detector will separate these)", "length_confound",
            "the SHORT negative must still score negative; long affirmative positive")
    control("sentiment (a sentiment-detector will separate these)", "valence_confound",
            "HC47 (neg polarity, positive sentiment) must score NEGATIVE. If it doesn't, "
            "your axis is valence.")
    control("antonym vs negation", "antonym_not_negation",
            "HC01/HC03 are AFFIRMATIVE. If they score negative, the axis is 'badness', not 'not'.")
    control("negative concord (2+ markers, ONE negation)", "negative_concord",
            "these must not score MORE negative than a single-marker negation")
    control("downward-entailing but not negated", "downward_entailing",
            "should sit near zero, not deep negative")
    control("answer particles — the cross-lingual inversion", "answer_particle",
            "ja/ko 'hai/ne' answering a negative question must land NEGATIVE; "
            "fr/de/ar 'si/doch/bala' must land POSITIVE. Almost nothing gets this right.")

    np.save("polarity_direction.npy", d)
    print("\nwrote polarity_direction.npy")

if __name__ == "__main__":
    main()
