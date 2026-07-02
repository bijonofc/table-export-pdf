# Dynamic columns for table-export-pdf

**Date:** 2026-07-02
**Status:** Approved (design)

## Problem

Today every caller of `exportTableCSV` / `exportTablePDF` / `downloadTablePDF` must
pre-build `rows` as an array of cells aligned 1:1 to `columns`, wrapping formatted
values in `{ csv, html }` objects by hand. That mapping is repetitive boilerplate at
every call site (see `examples/OutletLedgerExample.vue`: `exportRow`).

We want a more dynamic contract: pass the **raw row objects** plus a column spec that
names **which property** each column reads (and how to format it), and let the library
do the extraction and formatting.

## Goals

- Let callers pass `rows` as an array of **plain objects** and `columns` that carry a
  `key` (property name) and optional `format` callback.
- Reuse the app's own currency/date helpers via a per-column callback — the library
  stays framework-agnostic and does **no** locale formatting itself (keeps decision #7
  from `pdf-memory.md`).
- **Do not break** existing callers (the two in-plugin `TableExport.js` copies and the
  Vitepos modals) that pass the array-of-cells shape.

## Non-goals

- Built-in named format types (`'currency'`, `'date'`). Formatting stays in the caller.
- Dot-path key resolution (`'customer.name'`). Use a `value` accessor for nested/computed
  values instead.
- Any change to pagination, page numbers, print-dialog, or page-size behavior.

## Design

### Extended column shape (all new fields optional)

```ts
type Column = {
  title: string;                                    // header text, used as-is (unchanged)
  align?: 'end';                                    // right-align a column (unchanged)
  key?: string;                                     // NEW: reads row[key]
  value?: (row: any) => any;                        // NEW: computed accessor; takes precedence over key
  format?: (value: any, row: any) => string | { csv?: any; html?: string }; // NEW: formats the extracted value
};
```

Classic columns (`{ title, align }` only) are unchanged and keep working.

### Cell resolution (dynamic mode)

For a column `col` and object row `row`:

1. **Extract raw value**
   - `raw = col.value ? col.value(row) : (col.key != null ? row[col.key] : undefined)`
2. **Format**
   - If `col.format` is a function, call `col.format(raw, row)`:
     - returns a **string** → that string is the display text; **CSV keeps `raw`**; the
       string is **HTML-escaped** (safe default).
     - returns an **object** `{ csv?, html? }` → same semantics as the existing formatted
       cell: `html` is inserted **un-escaped** (trusted markup), `csv` is the raw
       spreadsheet value. Missing `html` falls back to escaped `csv`; missing `csv`
       falls back to `''`.
   - If `col.format` is absent → `csv = raw`, PDF cell = **escaped** `raw` (identical to a
     plain string cell today).

### Auto-detect (both APIs coexist)

A single internal adapter converts the public `(columns, rows)` into the internal
normalized form `Array<Array<{ csv, html }>>` at the top of each public function.
Downstream code (`buildTableHtml`, `paginateRows`, CSV builder) then operates on
pre-normalized cells and is agnostic to which API produced them.

Detection is **per row**:

- `Array.isArray(row)` → **classic** array-of-cells path (each cell passes through the
  existing `normalizeCell`).
- otherwise (object row) → **dynamic** path (resolve each column against the object as
  above).

Documented guidance: use one shape per call. Mixing is technically tolerated (decided
per row) but not a supported pattern.

### Internal refactor

- Add `resolveCell(column, row, colIndex)` → `{ csv, html }` implementing the rules above
  (classic branch delegates to existing `normalizeCell`).
- Add `normalizeTable(columns, rows)` → `Array<Array<{ csv, html }>>` that maps every row
  through `resolveCell`.
- `exportTableCSV`, and the HTML builders used by `exportTablePDF` / `downloadTablePDF`,
  consume the normalized cells instead of calling `normalizeCell` inline. `buildTableHtml`
  still takes `columns` for per-column `align` (`class="num"`), but reads the pre-resolved
  `html` for each cell rather than re-normalizing.
- No change to `paginateRows` logic beyond receiving pre-normalized rows.

## Testing

Value resolution, formatting, CSV building, and `buildTableHtml` are all **pure string
functions** with no DOM dependency, so they are unit-testable under plain `node`. TDD
covers:

- classic array-of-cells passthrough (unchanged output),
- `key` read from an object row,
- `value` accessor takes precedence over `key`,
- `format` returning a string → escaped HTML, raw kept in CSV,
- `format` returning `{ csv, html }` → un-escaped HTML, raw csv,
- missing `key`/`value`/`format` → empty/escaped raw,
- CSV output for object rows matches expectations (raw values, BOM, quoting).

`paginateRows`, the print-dialog iframe, and the html2pdf download require a browser and
remain verified via `node --check src/index.js` plus manual smoke test, unchanged.

## Docs

Update `README.md` (data model + a "dynamic columns" example), `examples/OutletLedgerExample.vue`
(show the keyed-column form), and `pdf-memory.md` (new decision: dynamic columns via
`key`/`value`/`format`, auto-detected per row).
