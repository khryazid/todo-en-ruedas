/**
 * @file utils/exportCSV.ts
 * @description Utilidad reutilizable para exportar datos a CSV.
 */

/**
 * Convierte un array de objetos a CSV y lo descarga.
 * @param data - Array de objetos a exportar
 * @param filename - Nombre del archivo sin extensión
 * @param columns - Definición de columnas: { key, label }
 */
export function exportToCSV<T extends Record<string, unknown>>(
    data: T[],
    filename: string,
    columns: { key: keyof T; label: string }[]
): void {
    if (data.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }

    // Cabecera
    const headers = columns.map(c => `"${c.label}"`).join(',');

    // Filas
    const rows = data.map(row =>
        columns.map(c => {
            const val = row[c.key];
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""'); // escapar comillas
            return `"${str}"`;
        }).join(',')
    );

    const csvContent = [headers, ...rows].join('\r\n');
    const BOM = '\uFEFF'; // UTF-8 BOM para que Excel lo abra correctamente
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
