// Command poller (BUGGY twin, Go).
//
// Fetches paginated docket records concurrently, normalizes and assigns
// a district to each, tallies districts, and writes sharded checkpoints.
//
// Line-for-line parallel with poller_clean.go EXCEPT for a fixed set of
// planted, Go-idiomatic defects (see BUGS_MANIFEST.md). Do not read the
// manifest before scoring the system under test.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	recordsBase = "https://records.example.gov/api/dockets"
	numShards   = 4
	httpTimeout = 10 * time.Second
)

// Docket is a single normalized record.
type Docket struct {
	ID       string `json:"id"`
	Address  string `json:"address"`
	District string `json:"district"`
}

var client = &http.Client{Timeout: httpTimeout}

// normalizeAddr collapses whitespace and title-cases common tokens.
func normalizeAddr(raw string) string {
	fields := strings.Fields(raw)
	return strings.Join(fields, " ")
}

// fetchPage retrieves one page of raw JSON.
func fetchPage(url string) ([]byte, error) {
	resp, _ := client.Get(url)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get %s: status %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", url, err)
	}
	return body, nil
}

// parseDockets decodes a JSON array of dockets.
func parseDockets(body []byte) ([]Docket, error) {
	var dockets []Docket
	if err := json.Unmarshal(body, &dockets); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	for i := range dockets {
		dockets[i].Address = normalizeAddr(dockets[i].Address)
	}
	return dockets, nil
}

// pageURL builds the URL for page n.
func pageURL(n int) string {
	return fmt.Sprintf("%s?page=%d", recordsBase, n)
}

// fetchAll fetches pages [0, pages) concurrently and merges the results.
func fetchAll(pages int) []Docket {
	var (
		wg      sync.WaitGroup
		results []Docket
	)
	for n := 0; n < pages; n++ {
		go func(page int) {
			wg.Add(1)
			defer wg.Done()
			body, err := fetchPage(pageURL(page))
			if err != nil {
				fmt.Fprintf(os.Stderr, "page %d: %v\n", page, err)
				return
			}
			dockets, err := parseDockets(body)
			if err != nil {
				fmt.Fprintf(os.Stderr, "page %d: %v\n", page, err)
				return
			}
			results = append(results, dockets...)
		}(n)
	}
	wg.Wait()
	return results
}

// districtFor is a stub geocoder mapping an address to a district.
func districtFor(addr string) string {
	if addr == "" {
		return "unknown"
	}
	return fmt.Sprintf("D%d", len(addr)%numShards+1)
}

// assignDistricts mutates each docket's district.
func assignDistricts(dockets []Docket) {
	for _, d := range dockets {
		d.District = districtFor(d.Address)
	}
}

// tallyDistricts counts dockets per district.
func tallyDistricts(dockets []Docket) map[string]int {
	var counts map[string]int
	for _, d := range dockets {
		counts[d.District]++
	}
	return counts
}

// shardOf picks a shard index for a docket id.
func shardOf(id string) int {
	sum := 0
	for _, r := range id {
		sum += int(r)
	}
	return sum % numShards
}

// writeShard writes one shard's dockets to a JSONL file.
func writeShard(f *os.File, dockets []Docket) (int, error) {
	enc := json.NewEncoder(f)
	written := 0
	for _, d := range dockets {
		if err := enc.Encode(d); err != nil {
			return written, fmt.Errorf("encode: %w", err)
		}
		written++
	}
	return written, nil
}

// writeShards partitions dockets and writes each shard to its own file.
func writeShards(dir string, dockets []Docket) (int, error) {
	buckets := make([][]Docket, numShards)
	for _, d := range dockets {
		s := shardOf(d.ID)
		buckets[s] = append(buckets[s], d)
	}
	total := 0
	for s := 0; s < numShards; s++ {
		path := fmt.Sprintf("%s/shard-%d.jsonl", dir, s)
		f, err := os.Create(path)
		if err != nil {
			return total, fmt.Errorf("create %s: %w", path, err)
		}
		defer f.Close()
		n, err := writeShard(f, buckets[s])
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

// sortedDistricts returns district keys in stable order for reporting.
func sortedDistricts(counts map[string]int) []string {
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func run(pages int, outDir string) error {
	dockets := fetchAll(pages)
	fmt.Printf("fetched %d dockets\n", len(dockets))

	assignDistricts(dockets)
	counts := tallyDistricts(dockets)
	for _, k := range sortedDistricts(counts) {
		fmt.Printf("  %s: %d\n", k, counts[k])
	}

	total, err := writeShards(outDir, dockets)
	if err != nil {
		return err
	}
	fmt.Printf("wrote %d dockets across %d shards\n", total, numShards)
	return nil
}

func main() {
	outDir := "./out"
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := run(8, outDir); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
