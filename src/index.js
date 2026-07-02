// table-export-pdf
// -----------------
// Framework-agnostic helpers to export a simple table (columns + array-of-rows) to:
//   - CSV                  -> exportTableCSV()
//   - PDF via print dialog -> exportTablePDF()   (browser "Save as PDF")
//   - PDF direct download  -> downloadTablePDF()  (html2pdf.js, no dialog)
//
// It only touches the DOM, so it runs in any browser project (Vue, React, plain JS...).
// `downloadTablePDF` lazy-imports `html2pdf.js`, so that dependency only loads when used.
//
// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------
// columns: Array<{ title: string, align?: 'end' }>
//   - `title` is used verbatim (already-translated / final text).
//   - `align: 'end'` right-aligns that column (numbers/currency).
//
// rows: Array<Row>, where Row is an array of cells aligned 1:1 to `columns`.
//   A cell is either:
//     - a plain value (used verbatim in CSV, HTML-escaped in PDF), or
//     - { csv: <raw value for spreadsheets>, html: <pre-formatted HTML for PDF> }
//       Use the object form for currency/formatted cells so the CSV keeps the
//       raw number while the PDF shows the formatted string.
//
// Because the PDF is rendered from real DOM (not re-typeset by jsPDF), any script
// your page fonts support — Bengali, Arabic, currency symbols — renders correctly.

/**
 * @typedef {Object} Column
 * @property {string} title      Column header text (used as-is).
 * @property {'end'} [align]     'end' right-aligns the column (for numbers).
 * @property {string} [key]      (Object rows) property name read from each row.
 * @property {(row:*)=>*} [value] (Object rows) computed accessor; takes precedence over key.
 * @property {(value:*,row:*)=>(string|FormattedCell)} [format] (Object rows) formats the
 *           extracted value. A string return is used as display text and HTML-escaped;
 *           a { csv, html } return follows FormattedCell semantics (html un-escaped).
 */

/**
 * @typedef {Object} FormattedCell
 * @property {*} [csv]           Raw value written to CSV.
 * @property {string} [html]     Pre-formatted HTML shown in the PDF.
 */

/**
 * @typedef {Object} SummaryItem
 * @property {string} label      Small uppercase label on the summary card.
 * @property {string|number} value  Value (may contain pre-formatted HTML).
 */

/**
 * @typedef {'a3'|'a4'|'a5'|'letter'|'legal'|'tabloid'} PageSize
 */

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

function csvEscape(value) {
    let s = (value === null || value === undefined) ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// Escapes only `& < >` — sufficient for TEXT-content contexts (all current call sites
// insert this into element text, e.g. <td>...</td>), but NOT safe for HTML attribute
// contexts, which would also need to escape quotes.
function htmlEscape(value) {
    return (value === null || value === undefined ? '' : String(value))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function normalizeCell(cell) {
    if (cell !== null && typeof cell === 'object' && ('csv' in cell || 'html' in cell)) {
        const raw = ('csv' in cell) ? cell.csv : '';
        return { csv: raw, html: ('html' in cell) ? cell.html : htmlEscape(raw) };
    }
    return { csv: cell, html: htmlEscape(cell) };
}

/**
 * Resolve one column + one row into a normalized { csv, html } cell.
 * Classic rows (arrays) index by position; object rows read column.key /
 * column.value and run column.format.
 * @param {Column} column
 * @param {*} row              Array (classic) or plain object (dynamic).
 * @param {number} colIndex    Position of the column (used for array rows).
 * @returns {{csv:*, html:string}}
 */
export function resolveCell(column, row, colIndex) {
    if (Array.isArray(row)) {
        return normalizeCell(row[colIndex]);
    }
    const raw = (column && typeof column.value === 'function')
        ? column.value(row)
        : (column && column.key != null ? row[column.key] : undefined);
    if (column && typeof column.format === 'function') {
        const out = column.format(raw, row);
        if (out !== null && typeof out === 'object' && ('csv' in out || 'html' in out)) {
            return normalizeCell(out);
        }
        // A plain string (or number) return value is display text: keep raw for CSV,
        // escape for the PDF (return { html } from format if you want trusted markup).
        return { csv: raw, html: htmlEscape(out) };
    }
    return normalizeCell(raw);
}

/**
 * Normalize a whole table (columns + rows, either API shape) into rows of
 * { csv, html } cells. Rows may be arrays (classic) or plain objects (dynamic);
 * detection is per row inside resolveCell.
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @returns {Array<Array<{csv:*, html:string}>>}
 */
export function normalizeTable(columns, rows) {
    return rows.map(row => columns.map((col, i) => resolveCell(col, row, i)));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Build the exact CSV text for columns + rows (UTF-8 BOM + CRLF line endings).
 * Same output the library downloads; useful headless (preview, tests, SSR).
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @returns {string}
 */
export function buildCSVString(columns, rows) {
    const lines = [columns.map(c => csvEscape(c.title)).join(',')];
    for (const cells of normalizeTable(columns, rows)) {
        lines.push(cells.map(cell => csvEscape(cell.csv)).join(','));
    }
    // Prepend a BOM so Excel reads UTF-8 correctly.
    return '﻿' + lines.join('\r\n');
}

/**
 * Build a CSV from columns + rows and trigger a download.
 * @param {string} filename   Download name (include the `.csv` extension).
 * @param {Column[]} columns
 * @param {Array<Array<*|FormattedCell>>} rows
 */
export function exportTableCSV(filename, columns, rows) {
    downloadBlob(new Blob([buildCSVString(columns, rows)], { type: 'text/csv;charset=utf-8;' }), filename);
}

/* -------------------------------------------------------------------------- */
/* Shared report markup                                                        */
/* -------------------------------------------------------------------------- */

// Scoped report styles. Everything lives under .pdf-export-root so it can render
// inside the host page without leaking styles.
function reportStyleTag() {
    return '<style>'
        + '.pdf-export-root{color:#222;background:#fff;padding:6px 4px;box-sizing:border-box;}'
        + '.pdf-export-root *{box-sizing:border-box;}'
        + '.pdf-export-root .doc-head{text-align:center;margin:0 0 16px;}'
        + '.pdf-export-root .doc-head .store{font-size:20px;font-weight:bold;}'
        + '.pdf-export-root .doc-head .report-title{font-size:14px;margin-top:4px;color:#555;}'
        + '.pdf-export-root .summary{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:0 0 16px;}'
        + '.pdf-export-root .summary .item{border:1px solid #ddd;border-radius:6px;padding:8px 14px;text-align:center;min-width:120px;}'
        + '.pdf-export-root .summary .lbl{display:block;font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;}'
        + '.pdf-export-root .summary .val{font-weight:bold;font-size:13px;}'
        // table-layout:fixed makes columns honor the render width so the last column is never
        // clipped; long cell text wraps instead of pushing the table past the page edge.
        + '.pdf-export-root table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}'
        + '.pdf-export-root th,.pdf-export-root td{border:1px solid #ccc;padding:6px 8px;text-align:left;word-break:break-word;overflow-wrap:anywhere;}'
        + '.pdf-export-root th{background:#f2f2f2;}'
        + '.pdf-export-root td.num,.pdf-export-root th.num{text-align:right;}'
        // Keep each row intact when html2pdf slices the canvas into pages.
        + '.pdf-export-root tr,.pdf-export-root th,.pdf-export-root td{page-break-inside:avoid;}'
        + '</style>';
}

// The centered store name + report title, optionally followed by the bordered summary cards.
function buildHeaderBlock(title, storeName, summary) {
    const summaryHtml = (summary && summary.length)
        ? '<div class="summary">'
            + summary.map(s => '<div class="item">'
                + '<span class="lbl">' + htmlEscape(s.label) + '</span>'
                + '<span class="val">' + (s.value === null || s.value === undefined ? '' : s.value) + '</span>'
                + '</div>').join('')
            + '</div>'
        : '';
    return '<div class="doc-head">'
        + (storeName ? '<div class="store">' + htmlEscape(storeName) + '</div>' : '')
        + '<div class="report-title">' + htmlEscape(title) + '</div>'
        + '</div>'
        + summaryHtml;
}

// A single <table> with its header row plus the given data rows.
export function buildTableHtml(columns, rows) {
    const thead = columns
        .map(c => '<th' + (c.align === 'end' ? ' class="num"' : '') + '>' + htmlEscape(c.title) + '</th>')
        .join('');
    const normalized = normalizeTable(columns, rows);
    let tbody = '';
    for (const cells of normalized) {
        tbody += '<tr>';
        for (let i = 0; i < columns.length; i++) {
            const isNum = columns[i] && columns[i].align === 'end';
            const cell = cells[i] || { html: '' };
            tbody += '<td' + (isNum ? ' class="num"' : '') + '>' + cell.html + '</td>';
        }
        tbody += '</tr>';
    }
    return '<table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>';
}

// Report markup (header + optional summary + one table with every row). Used by the
// print-dialog export, which relies on the browser's own pagination.
function buildReportHtml(title, columns, rows, storeName, summary) {
    return reportStyleTag() + buildHeaderBlock(title, storeName, summary) + buildTableHtml(columns, rows);
}

/**
 * Return the report markup used by the PDF export path (style + header + summary +
 * one table with every row). Pure/headless — useful for previews, tests, SSR.
 * @param {string} title
 * @param {Column[]} columns
 * @param {Array<Array<*>|Object>} rows
 * @param {Object} [options]
 * @param {string} [options.storeName]
 * @param {SummaryItem[]} [options.summary]
 * @returns {string}
 */
export function renderReportHTML(title, columns, rows, options = {}) {
    const storeName = options.storeName || '';
    const summary = Array.isArray(options.summary) ? options.summary : [];
    return buildReportHtml(title, columns, rows, storeName, summary);
}

/* -------------------------------------------------------------------------- */
/* PDF via browser print dialog                                                */
/* -------------------------------------------------------------------------- */

/**
 * Open the report in a hidden iframe and trigger the browser's print dialog
 * (choose "Save as PDF"). Renders real text with the page's fonts, so non-Latin
 * scripts and currency symbols come out correct. `@page margin:0` suppresses the
 * browser-injected header/footer (date, url, page numbers).
 *
 * @param {string} title
 * @param {Column[]} columns
 * @param {Array<Array<*|FormattedCell>>} rows
 * @param {Object} [options]
 * @param {string} [options.storeName]        Shown centered at the top.
 * @param {SummaryItem[]} [options.summary]   Bordered summary cards under the title.
 */
export function exportTablePDF(title, columns, rows, options = {}) {
    const storeName = options.storeName || '';
    const summary = Array.isArray(options.summary) ? options.summary : [];
    const content = renderReportHTML(title, columns, rows, { storeName, summary });
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + htmlEscape(title) + '</title>'
        + '<style>@page{size:auto;margin:0;}html,body{margin:0;}body{padding:16mm 12mm;}</style>'
        + '</head><body><div class="pdf-export-root">' + content + '</div></body></html>';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const remove = () => {
        if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Clean up after the print dialog closes; fall back to a timer for browsers
    // that don't fire onafterprint.
    iframe.contentWindow.onafterprint = remove;
    setTimeout(() => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            // ignore
        }
        setTimeout(remove, 60000);
    }, 350);
}

/* -------------------------------------------------------------------------- */
/* PDF direct download (html2pdf.js)                                           */
/* -------------------------------------------------------------------------- */

// Page dimensions in mm (portrait: [width, height]). jsPDF is given the same [w, h]
// so the render and our pagination always agree.
const PDF_PAGE_SIZES_MM = {
    a3: [297, 420], a4: [210, 297], a5: [148, 210],
    letter: [215.9, 279.4], legal: [215.9, 355.6], tabloid: [279.4, 431.8],
};
const PDF_MARGIN_MM = [14, 10, 14, 10];       // top, right, bottom, left
// 0.94 safety factor + a per-page buffer absorb margin collapsing / rounding so a row never
// overflows the printable area and gets pushed (splitting the group across pages).
const PDF_PAGE_SAFETY = 0.94;
const PDF_PAGE_BUFFER_PX = 20;

function resolvePageSizeMM(pageSize) {
    return PDF_PAGE_SIZES_MM[String(pageSize || 'a4').toLowerCase()] || PDF_PAGE_SIZES_MM.a4;
}

function pdfFilename(name) {
    const base = String(name || 'report').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
    return (base || 'report') + '.pdf';
}

// Measures the header and each row off-screen, then groups rows into pages. printableW/H are the
// page's printable area in mm. Returns an array of row-arrays, one per page (always at least one
// page, at least one row per page).
function paginateRows(columns, rows, headerWithSummary, headerNoSummary, printableW, printableH) {
    if (!rows.length) {
        return [[]];
    }
    const host = document.createElement('div');
    host.className = 'pdf-export-root';
    // Match html2pdf's own container width (mm) so measured heights map 1:1 to the rendered page.
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;background:#fff;width:' + printableW + 'mm;';
    host.innerHTML = reportStyleTag()
        + '<div id="__h1">' + headerWithSummary + '</div>'
        + '<div id="__h2">' + headerNoSummary + '</div>'
        + '<div id="__tbl">' + buildTableHtml(columns, rows) + '</div>';
    document.body.appendChild(host);

    // Derive px-per-mm from the actual rendered width, then the usable height per page in px.
    const pxPerMm = host.offsetWidth / printableW;
    const pageHeightPx = printableH * pxPerMm * PDF_PAGE_SAFETY;
    const h1 = host.querySelector('#__h1').offsetHeight;   // header incl. summary (page 1)
    const h2 = host.querySelector('#__h2').offsetHeight;   // header without summary (later pages)
    const theadH = host.querySelector('#__tbl thead').offsetHeight;
    const rowHeights = Array.prototype.map.call(
        host.querySelectorAll('#__tbl tbody tr'), el => el.offsetHeight);
    document.body.removeChild(host);

    const pages = [];
    let current = [];
    let used = 0;
    let budget = pageHeightPx - h1 - theadH - PDF_PAGE_BUFFER_PX;
    for (let i = 0; i < rows.length; i++) {
        const rh = rowHeights[i] || 0;
        if (current.length && used + rh > budget) {
            pages.push(current);
            current = [];
            used = 0;
            budget = pageHeightPx - h2 - theadH - PDF_PAGE_BUFFER_PX;   // later pages repeat the compact header
        }
        current.push(rows[i]);
        used += rh;
    }
    pages.push(current);
    return pages;
}

/**
 * Render the report straight to a downloaded PDF file (no print dialog) using
 * html2pdf.js (html2canvas + jsPDF), which is lazy-imported on first use.
 *
 * All enhancement flags are opt-in (default off = classic single continuous table).
 *
 * @param {string} title
 * @param {Column[]} columns
 * @param {Array<Array<*|FormattedCell>>} rows
 * @param {Object} [options]
 * @param {string} [options.storeName]      Shown centered at the top of page 1.
 * @param {SummaryItem[]} [options.summary] Bordered summary cards under the title (page 1).
 * @param {string} [options.filename]       Download name (extension optional; defaults to title).
 * @param {boolean} [options.pageBreak]     Paginate rows so no row is split across a page break;
 *                                          the column header (thead) then repeats on every page.
 * @param {boolean} [options.repeatHeader]  Also repeat the store name + report title on every
 *                                          page (implies pageBreak).
 * @param {boolean} [options.pageNumbers]   Stamp "N / total" (top-right) and "Page N of total"
 *                                          (bottom-center) on each page. Latin numerals only.
 * @param {PageSize} [options.pageSize]     Paper size: 'a4' (default) | 'letter' | 'legal' |
 *                                          'a3' | 'a5' | 'tabloid'.
 * @returns {Promise<void>}
 */
export async function downloadTablePDF(title, columns, rows, options = {}) {
    const html2pdf = (await import('html2pdf.js')).default;
    const storeName = options.storeName || '';
    const summary = Array.isArray(options.summary) ? options.summary : [];
    const repeatHeader = !!options.repeatHeader;
    const pageBreak = !!options.pageBreak || repeatHeader;   // repeating the header requires pagination
    const pageNumbers = !!options.pageNumbers;

    // Resolve paper size and its printable area (page minus margins).
    const [pageW, pageH] = resolvePageSizeMM(options.pageSize);
    const printableW = pageW - PDF_MARGIN_MM[1] - PDF_MARGIN_MM[3];
    const printableH = pageH - PDF_MARGIN_MM[0] - PDF_MARGIN_MM[2];

    let content;
    if (pageBreak) {
        const headerWithSummary = buildHeaderBlock(title, storeName, summary);
        // Later pages repeat the store/title block only when repeatHeader is set; the column
        // header repeats regardless because each page is rendered as its own <table>.
        const laterHeader = repeatHeader ? buildHeaderBlock(title, storeName, []) : '';
        const pages = paginateRows(columns, rows, headerWithSummary, laterHeader, printableW, printableH);
        content = reportStyleTag();
        pages.forEach((pageRows, idx) => {
            // html2pdf natively forces a new page at any .html2pdf__page-break element.
            if (idx > 0) {
                content += '<div class="html2pdf__page-break"></div>';
            }
            content += (idx === 0 ? headerWithSummary : laterHeader) + buildTableHtml(columns, pageRows);
        });
    } else {
        // Classic mode: one continuous table sliced by html2pdf (rows still kept intact via
        // page-break-inside:avoid), header only at the top, no page numbers.
        content = renderReportHTML(title, columns, rows, { storeName, summary });
    }

    // No explicit width: html2pdf sizes its clone container to the printable width, and
    // table-layout:fixed keeps the table within it so the last column is never clipped.
    const container = document.createElement('div');
    container.className = 'pdf-export-root';
    container.style.background = '#fff';
    container.innerHTML = content;

    // Top/bottom margins leave room for the optional page-number header and footer.
    const worker = html2pdf().set({
        margin: PDF_MARGIN_MM,
        filename: pdfFilename(options.filename || title),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: [pageW, pageH], orientation: 'p' },
        // 'legacy' honors our explicit .html2pdf__page-break dividers between pre-fitted pages;
        // 'css' keeps page-break-inside:avoid on rows as a safety net against mid-row slicing.
        pagebreak: { mode: ['css', 'legacy'] },
    }).from(container).toPdf();

    // Stamp a page number in the header (top-right) and footer (bottom-center) of every page.
    // Drawn with jsPDF's default Latin font, so only Latin numerals are used here.
    if (pageNumbers) {
        await worker.get('pdf').then((pdf) => {
            const total = pdf.internal.getNumberOfPages();
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            for (let i = 1; i <= total; i++) {
                pdf.setPage(i);
                pdf.setFontSize(9);
                pdf.setTextColor(120);
                pdf.text(i + ' / ' + total, pw - 10, 8, { align: 'right' });
                pdf.text('Page ' + i + ' of ' + total, pw / 2, ph - 6, { align: 'center' });
            }
        });
    }

    await worker.save();
}
