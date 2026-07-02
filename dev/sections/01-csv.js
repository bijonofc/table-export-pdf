import { ledgerColumns, ledgerRows } from '../data.js';

export default {
    id: 'csv',
    title: 'CSV export',
    blurb: 'Build a UTF-8 CSV (with BOM, so Excel reads it correctly) from columns + rows and download it. This section uses the classic array-of-cells API.',
    api: 'classic',
    columns: ledgerColumns,
    rows: ledgerRows,
    options: {},
    actions: ['csv'],
    previewTitle: 'Outlet Ledger',
    storeName: 'My Store',
    code: `import { exportTableCSV } from '@bijon059/table-export-pdf';

const columns = [
  { title: 'Date' },
  { title: 'Description' },
  { title: 'Amount', align: 'end' },
  { title: 'Balance', align: 'end' },
];
// Classic rows: arrays of cells; use { csv, html } to keep raw numbers in CSV.
const rows = [
  ['2026-07-02', 'Sale #1201', { csv: -50, html: '-$50.00' }, { csv: -50, html: '-$50.00' }],
];

exportTableCSV('outlet-ledger.csv', columns, rows);`,
};
