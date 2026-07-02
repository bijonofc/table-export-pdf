import { currency } from '../data.js';

export default {
    id: 'dynamic-columns',
    title: 'Dynamic columns',
    blurb: 'Pass raw row objects and let columns declare which property to read (key), a computed accessor (value), and how to format it (format). A format returning a string is HTML-escaped; return { csv, html } for trusted markup.',
    api: 'dynamic',
    columns: [
        { key: 'sku', title: 'SKU' },
        { key: 'qty', title: 'Qty', align: 'end', type: 'number' },
        { key: 'price', title: 'Price', align: 'end', type: 'number', format: v => currency(v) },
        { value: r => Number(r.qty) * Number(r.price), title: 'Line total', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
    ],
    rows: [
        { sku: 'A-100', qty: 2, price: 9.5 },
        { sku: 'B-200', qty: 1, price: 19.0 },
    ],
    options: { pageBreak: true, pageNumbers: true },
    actions: ['csv', 'download'],
    previewTitle: 'Line Items',
    storeName: 'My Store',
    code: `import { downloadTablePDF } from '@bijon/table-export-pdf';

const columns = [
  { key: 'sku', title: 'SKU' },
  { key: 'qty', title: 'Qty', align: 'end' },
  { key: 'price', title: 'Price', align: 'end', format: v => currency(v) },
  // computed column via value(); format returns { csv, html } to keep the raw number in CSV:
  { value: r => r.qty * r.price, title: 'Line total', align: 'end', format: v => ({ csv: v, html: currency(v) }) },
];

// rows are your raw objects, untouched:
await downloadTablePDF('Line Items', columns, rows, { pageBreak: true, pageNumbers: true });`,
};
