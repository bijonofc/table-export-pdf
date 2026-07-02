// Shared sample data + column defs for the playground sections.

export const currency = (n) => (Number(n) < 0 ? '-$' : '$') + Math.abs(Number(n)).toFixed(2);

// Playground columns: { key, title, align?, type?, format? }
export const ledgerColumns = [
    { key: 'date', title: 'Date' },
    { key: 'desc', title: 'Description' },
    { key: 'amount', title: 'Amount', align: 'end', type: 'number', format: v => ({ csv: v, html: currency(v) }) },
    { key: 'balance', title: 'Balance', align: 'end', type: 'number', format: v => ({ csv: v, html: currency(v) }) },
];

export const ledgerRows = [
    { date: '2026-07-01', desc: 'Opening balance', amount: 0, balance: 0 },
    { date: '2026-07-02', desc: 'Sale #1201', amount: -50, balance: -50 },
    { date: '2026-07-03', desc: 'Payment', amount: 50, balance: 0 },
];

export const ledgerSummary = [
    { label: 'Total Debit', value: currency(50) },
    { label: 'Total Credit', value: currency(50) },
    { label: 'Net Balance', value: currency(0) },
];
