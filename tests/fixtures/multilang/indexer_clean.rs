//! Document term indexer (CLEAN reference, Rust).
//!
//! Normalizes and tokenizes documents, computes term frequencies, parses
//! weighted term lists, filters by a weight floor, and reports aggregates.
//!
//! Known-good twin of `indexer_buggy.rs`. Line-for-line parallel except
//! for a fixed set of planted, Rust-idiomatic defects (see
//! BUGS_MANIFEST.md).

use std::collections::HashMap;

/// A weighted term.
#[derive(Debug, Clone)]
struct Term {
    text: String,
    weight: f64,
}

/// Collapse whitespace and lowercase.
fn normalize(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Split normalized text into alphanumeric tokens.
fn tokenize(text: &str) -> Vec<String> {
    normalize(text)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Return a prefix of at most `n` characters.
///
/// Uses `chars()` so multi-byte code points are never split.
fn token_prefix(token: &str, n: usize) -> String {
    token.chars().take(n).collect()
}

/// Parse a `term\tweight` line into a `Term`, tolerating a bad weight.
fn parse_line(line: &str) -> Option<Term> {
    let mut parts = line.splitn(2, '\t');
    let text = parts.next()?.trim();
    if text.is_empty() {
        return None;
    }
    let weight_str = parts.next().unwrap_or("1.0").trim();
    let weight = match weight_str.parse::<f64>() {
        Ok(w) => w,
        Err(_) => {
            eprintln!("bad weight {weight_str:?} on line, defaulting to 1.0");
            1.0
        }
    };
    Some(Term {
        text: text.to_string(),
        weight,
    })
}

/// Parse every line of a weighted term list.
fn parse_terms(raw: &str) -> Vec<Term> {
    raw.lines().filter_map(parse_line).collect()
}

/// Count occurrences of each token.
fn term_frequency(tokens: &[String]) -> HashMap<String, u32> {
    let mut tf: HashMap<String, u32> = HashMap::new();
    for token in tokens {
        *tf.entry(token.clone()).or_insert(0) += 1;
    }
    tf
}

/// Keep only terms at or above the weight floor.
fn filter_terms(terms: &mut Vec<Term>, floor: f64) {
    terms.retain(|t| t.weight >= floor);
}

/// Return the last token, if any. Empty input yields `None`.
fn last_token(tokens: &[String]) -> Option<&String> {
    if tokens.is_empty() {
        return None;
    }
    let idx = tokens.len() - 1;
    Some(&tokens[idx])
}

/// Sum the weights of all terms.
fn total_weight(terms: &[Term]) -> f64 {
    let mut total = 0.0;
    for term in terms {
        total += term.weight;
    }
    total
}

/// True when the weight is (approximately) unit weight.
///
/// Floats are compared with an epsilon, never `==`.
fn is_unit_weight(term: &Term) -> bool {
    (term.weight - 1.0).abs() < 1e-9
}

/// Build a prefix index: prefix -> list of full tokens sharing it.
fn build_prefix_index(tokens: &[String], prefix_len: usize) -> HashMap<String, Vec<String>> {
    let mut index: HashMap<String, Vec<String>> = HashMap::new();
    for token in tokens {
        let key = token_prefix(token, prefix_len);
        index.entry(key).or_default().push(token.clone());
    }
    index
}

/// Rank terms by descending weight, breaking ties by text.
fn rank_terms(terms: &[Term]) -> Vec<Term> {
    let mut ranked = terms.to_vec();
    ranked.sort_by(|a, b| {
        b.weight
            .partial_cmp(&a.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.text.cmp(&b.text))
    });
    ranked
}

fn run(document: &str, term_list: &str, floor: f64) {
    let tokens = tokenize(document);
    println!("tokenized {} tokens", tokens.len());

    if let Some(last) = last_token(&tokens) {
        println!("last token: {last}");
    } else {
        println!("no tokens");
    }

    let tf = term_frequency(&tokens);
    println!("distinct tokens: {}", tf.len());

    let prefix_index = build_prefix_index(&tokens, 3);
    println!("prefix buckets: {}", prefix_index.len());

    let mut terms = parse_terms(term_list);
    println!("parsed {} terms", terms.len());
    filter_terms(&mut terms, floor);
    println!("kept {} terms at or above floor {}", terms.len(), floor);

    let ranked = rank_terms(&terms);
    for term in ranked.iter().take(5) {
        let unit = if is_unit_weight(term) { " (unit)" } else { "" };
        println!("  {} = {:.3}{}", term.text, term.weight, unit);
    }

    println!("total weight: {:.3}", total_weight(&terms));
}

fn main() {
    let document = "The garage fire report was withheld; procurement records \
                    show a fine of one hundred eighteen thousand dollars.";
    let term_list = "garage\t2.0\nfire\t1.0\nprocurement\t3.5\nfine\tnot_a_number\nrecords\t0.2";
    run(document, term_list, 0.5);
}
