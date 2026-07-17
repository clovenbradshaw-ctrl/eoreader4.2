# Binary fixtures

`IBM.dat` — a small, real, third-party binary sample file used to validate the
generic binary perceiver (`src/perceiver/binary/`) against a genuinely
unfamiliar structured format, not a synthetic fixture.

Source: https://github.com/tk3369/sample-binary-data (`IBM.dat`), a public
sample-data repository of historical IBM stock prices (factual data: dates,
prices, trade volumes over a year of trading days), published for exactly this
purpose — testing binary-format readers against a real file.

Documented layout (per that repo's README), for reference only — the
perceiver under test is never told this and reads none of it:

- an 8-byte little-endian int64 header: the record count (251)
- then 251 fixed 24-byte records: int64 days-since-epoch, float64 price,
  int64 trade volume, little-endian throughout

See `tests/waveform-binary-perceiver.test.js` for the validation itself.
