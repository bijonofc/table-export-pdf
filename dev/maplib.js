// Pure mapping from a playground section's {key,...} columns + object rows to the
// library's column/row shapes. 'classic' => array-of-cells; 'dynamic' => objects as-is.

export function libColumns(section) {
    if (section.api === 'classic') {
        return section.columns.map(c => ({ title: c.title, align: c.align }));
    }
    return section.columns.map(c => ({
        key: c.key, title: c.title, align: c.align, value: c.value, format: c.format,
    }));
}

export function libRows(section, rows) {
    if (section.api === 'classic') {
        return rows.map(row => section.columns.map(c => (
            typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key]
        )));
    }
    return rows;
}
