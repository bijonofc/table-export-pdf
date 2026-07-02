// Live preview: renders the exact report markup and the CSV as a small table.
import { renderReportHTML, buildCSVString } from '../src/index.js';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
            } else { cur += ch; }
        } else if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { q = true; }
        else { cur += ch; }
    }
    out.push(cur);
    return out;
}

/**
 * Render a CSV string (with BOM) into an HTML table for preview. Pure.
 * @param {string} csv
 * @returns {string}
 */
export function csvToTable(csv) {
    const text = csv.replace(/^﻿/, '');
    const rows = text.split('\r\n').map(parseCsvLine);
    if (!rows.length) return '<table class="csv-table"></table>';
    const head = rows[0].map(h => '<th>' + escapeHtml(h) + '</th>').join('');
    let body = '';
    for (let i = 1; i < rows.length; i++) {
        body += '<tr>' + rows[i].map(c => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>';
    }
    return '<table class="csv-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
}

/**
 * Create a live preview panel. `meta` = { title, storeName, summary }.
 */
export function createPreview(container, meta) {
    const cap = document.createElement('p');
    cap.className = 'preview-cap';
    cap.textContent = 'Preview shows the source report markup. Pagination, repeating headers and page numbers appear only in the downloaded PDF.';

    const reportWrap = document.createElement('div');
    reportWrap.className = 'preview-report pdf-export-root';

    const csvHead = document.createElement('h4');
    csvHead.className = 'preview-sub';
    csvHead.textContent = 'CSV';
    const csvWrap = document.createElement('div');
    csvWrap.className = 'preview-csv';

    container.appendChild(cap);
    container.appendChild(reportWrap);
    container.appendChild(csvHead);
    container.appendChild(csvWrap);

    function update(libColumns, libRows) {
        reportWrap.innerHTML = renderReportHTML(meta.title, libColumns, libRows, {
            storeName: meta.storeName, summary: meta.summary,
        });
        csvWrap.innerHTML = csvToTable(buildCSVString(libColumns, libRows));
    }

    return { update };
}
