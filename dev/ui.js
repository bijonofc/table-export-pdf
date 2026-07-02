// Renders one documentation section: blurb, editable data, code snippet, action
// buttons, and a live preview that updates as the data is edited.
import { exportTableCSV, exportTablePDF, downloadTablePDF } from '../src/index.js';
import { libColumns, libRows } from './maplib.js';
import { createDataTable } from './datatable.js';
import { createPreview } from './preview.js';
import { highlight } from './highlight.js';

export function renderSection(section) {
    const sec = document.createElement('section');
    sec.className = 'doc-section';
    sec.id = section.id;

    const h2 = document.createElement('h2');
    h2.textContent = section.title;
    sec.appendChild(h2);

    const blurb = document.createElement('p');
    blurb.className = 'blurb';
    blurb.textContent = section.blurb;
    sec.appendChild(blurb);

    // Editable data
    const dataWrap = document.createElement('div');
    dataWrap.className = 'data-wrap';
    sec.appendChild(dataWrap);
    const dt = createDataTable(dataWrap, section.columns, section.rows);

    // Code card (highlighted snippet + copy)
    const card = document.createElement('div');
    card.className = 'code-card';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(section.code); copy.textContent = 'Copied'; }
        catch { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    });
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-javascript';
    code.innerHTML = highlight(section.code);
    pre.appendChild(code);
    card.appendChild(copy);
    card.appendChild(pre);
    sec.appendChild(card);

    // Action buttons + status
    const actions = document.createElement('div');
    actions.className = 'actions';
    const status = document.createElement('span');
    status.className = 'status';

    const cols = () => libColumns(section);
    const rws = () => libRows(section, dt.getRows());
    const mergedOptions = () => ({ storeName: section.storeName, summary: section.summary, ...section.options });

    const addBtn = (label, handler) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'action-btn';
        b.textContent = label;
        b.addEventListener('click', handler);
        actions.appendChild(b);
    };

    if (section.actions.includes('download')) {
        addBtn('Download PDF', async () => {
            status.textContent = 'Rendering PDF…';
            try {
                await downloadTablePDF(section.previewTitle, cols(), rws(), mergedOptions());
                status.textContent = 'PDF downloaded.';
            } catch (e) {
                status.textContent = 'PDF failed: ' + e.message;
            }
        });
    }
    if (section.actions.includes('print')) {
        addBtn('Print', () => {
            exportTablePDF(section.previewTitle, cols(), rws(), { storeName: section.storeName, summary: section.summary });
            status.textContent = 'Print dialog opened.';
        });
    }
    if (section.actions.includes('csv')) {
        addBtn('Export CSV', () => {
            exportTableCSV(section.id + '.csv', cols(), rws());
            status.textContent = 'CSV downloaded.';
        });
    }
    actions.appendChild(status);
    sec.appendChild(actions);

    // Live preview
    const prev = document.createElement('div');
    prev.className = 'preview';
    sec.appendChild(prev);
    const preview = createPreview(prev, { title: section.previewTitle, storeName: section.storeName, summary: section.summary });
    const refresh = () => preview.update(cols(), rws());
    dt.onChange(refresh);
    refresh();

    return sec;
}
