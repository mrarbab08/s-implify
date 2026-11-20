export interface TableExportColumn {
    field: string;
    title: string;
    hide?: boolean;
}

function visibleColumns(columns: TableExportColumn[]): TableExportColumn[] {
    return columns.filter((c) => !c.hide);
}

function cellText(row: object, field: string): string {
    const v = (row as Record<string, unknown>)[field];
    if (v == null) {
        return '';
    }
    return String(v);
}

function escapeCsvCell(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** CSV with UTF-8 BOM so Excel opens special characters correctly. */
export function downloadCsv(filename: string, columns: TableExportColumn[], rows: object[]): void {
    const cols = visibleColumns(columns);
    if (!cols.length) {
        return;
    }
    const lines = [
        cols.map((c) => escapeCsvCell(c.title)).join(','),
        ...rows.map((row) => cols.map((c) => escapeCsvCell(cellText(row, c.field))).join(',')),
    ];
    const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export function printTable(title: string, columns: TableExportColumn[], rows: object[]): void {
    const cols = visibleColumns(columns);
    if (!cols.length) {
        return;
    }
    let html = `<p>${escapeHtml(title)}</p><table style="width:100%;border-collapse:collapse"><thead><tr>`;
    for (const col of cols) {
        html += `<th style="padding:8px 4px;text-align:left;background:#eff5ff">${escapeHtml(col.title)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of rows) {
        html += '<tr>';
        for (const col of cols) {
            html += `<td style="padding:4px;border-top:1px solid #eee">${escapeHtml(cellText(row, col.field))}</td>`;
        }
        html += '</tr>';
    }
    html +=
        '</tbody></table><style>body{font-family:Arial,sans-serif;color:#495057}p{text-align:center;font-size:18px;font-weight:bold;margin:15px}</style>';

    const win = window.open('', '_blank', 'left=0,top=0,width=1100,height=700');
    if (!win) {
        return;
    }
    win.document.write(`<title>${escapeHtml(title)}</title>${html}`);
    win.document.close();
    win.focus();
    win.onafterprint = () => win.close();
    win.print();
}
