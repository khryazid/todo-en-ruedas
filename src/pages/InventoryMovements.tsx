/**
 * @file pages/InventoryMovements.tsx
 * @description Historial de Movimientos de Inventario.
 * Muestra todo log de entrada/salida con filtros y exportación CSV.
 */

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
    ArrowDown, ArrowUp, RotateCcw, Wrench, Scissors,
    Download, RefreshCw, Filter, Search, Package
} from 'lucide-react';
import type { StockMovementType } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<StockMovementType, { label: string; color: string; Icon: typeof ArrowDown }> = {
    SALE: { label: 'Venta', color: 'bg-red-100 text-red-700', Icon: ArrowDown },
    RETURN: { label: 'Devolución', color: 'bg-green-100 text-green-700', Icon: ArrowUp },
    PURCHASE: { label: 'Compra', color: 'bg-blue-100 text-blue-700', Icon: ArrowUp },
    ADJUSTMENT: { label: 'Ajuste', color: 'bg-yellow-100 text-yellow-700', Icon: Wrench },
    SHRINKAGE: { label: 'Merma', color: 'bg-purple-100 text-purple-700', Icon: Scissors },
};

const ALL_TYPES: StockMovementType[] = ['SALE', 'RETURN', 'PURCHASE', 'ADJUSTMENT', 'SHRINKAGE'];

function formatDate(iso: string) {
    try {
        return new Intl.DateTimeFormat('es-VE', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso));
    } catch { return iso; }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV(rows: ReturnType<typeof useStore['getState']>['stockMovements']) {
    const header = ['Fecha', 'SKU', 'Producto', 'Tipo', 'Antes', 'Cambio', 'Después', 'Motivo', 'Vendedor'];
    const lines = rows.map(r => [
        r.createdAt,
        r.sku,
        `"${r.productName}"`,
        TYPE_META[r.type]?.label ?? r.type,
        r.qtyBefore,
        r.qtyChange > 0 ? `+${r.qtyChange}` : String(r.qtyChange),
        r.qtyAfter,
        `"${r.reason ?? ''}"`,
        `"${r.sellerName ?? ''}"`,
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InventoryMovements = () => {
    const { stockMovements, fetchStockMovements, products } = useStore();
    const [searchParams] = useSearchParams();

    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<StockMovementType | 'ALL'>('ALL');
    const [isLoading, setIsLoading] = useState(false);

    // Pre-select product from URL param (?product=id)
    const urlProductId = searchParams.get('product') ?? '';

    useEffect(() => {
        setIsLoading(true);
        fetchStockMovements(urlProductId || undefined).finally(() => setIsLoading(false));
    }, [urlProductId]); // eslint-disable-line

    const productLabel = useMemo(() => {
        if (!urlProductId) return null;
        const p = products.find(p => p.id === urlProductId);
        return p ? `${p.name} (${p.sku})` : 'Producto';
    }, [urlProductId, products]);

    const filtered = useMemo(() => {
        let rows = stockMovements;
        if (typeFilter !== 'ALL') rows = rows.filter(r => r.type === typeFilter);
        if (searchTerm.trim()) {
            const t = searchTerm.toLowerCase();
            rows = rows.filter(r =>
                r.productName.toLowerCase().includes(t) ||
                r.sku.toLowerCase().includes(t) ||
                (r.reason ?? '').toLowerCase().includes(t) ||
                (r.sellerName ?? '').toLowerCase().includes(t)
            );
        }
        return rows;
    }, [stockMovements, typeFilter, searchTerm]);

    const handleRefresh = async () => {
        setIsLoading(true);
        await fetchStockMovements(urlProductId || undefined);
        setIsLoading(false);
    };

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                        <Package size={24} className="text-indigo-600" />
                        Movimientos de Inventario
                    </h2>
                    {productLabel && (
                        <p className="text-sm text-indigo-600 font-bold mt-0.5">📌 Filtrado: {productLabel}</p>
                    )}
                    <p className="text-gray-500 text-sm font-medium mt-0.5">
                        {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Actualizar
                    </button>
                    <button
                        onClick={() => exportCSV(filtered)}
                        disabled={filtered.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
                    >
                        <Download size={16} /> Exportar CSV
                    </button>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por producto, SKU, motivo..."
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                {/* Type pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter size={14} className="text-gray-400 flex-shrink-0" />
                    <button
                        onClick={() => setTypeFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${typeFilter === 'ALL' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Todos
                    </button>
                    {ALL_TYPES.map(t => {
                        const meta = TYPE_META[t];
                        const active = typeFilter === t;
                        return (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(active ? 'ALL' : t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${active ? 'ring-2 ring-offset-1 ring-gray-400 ' + meta.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {meta.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center p-16 text-gray-400">
                        <RefreshCw size={24} className="animate-spin mr-2" /> Cargando movimientos...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 text-gray-400">
                        <Package size={40} className="mb-3 opacity-30" />
                        <p className="font-bold">Sin movimientos registrados</p>
                        <p className="text-sm">Los movimientos aparecerán aquí al procesar ventas, devoluciones o ajustes.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    {['Fecha', 'Producto', 'Tipo', 'Antes', 'Cambio', 'Después', 'Motivo', 'Vendedor'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(row => {
                                    const meta = TYPE_META[row.type];
                                    const Icon = meta?.Icon ?? ArrowDown;
                                    const isExit = row.qtyChange < 0;
                                    return (
                                        <tr key={row.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">{formatDate(row.createdAt)}</td>
                                            <td className="px-4 py-3 min-w-[140px]">
                                                <p className="font-bold text-gray-800 truncate max-w-[160px]">{row.productName}</p>
                                                <p className="text-gray-400 font-mono text-[11px]">{row.sku}</p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${meta?.color ?? 'bg-gray-100 text-gray-600'}`}>
                                                    <Icon size={10} /> {meta?.label ?? row.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono font-bold text-gray-600">{row.qtyBefore}</td>
                                            <td className="px-4 py-3 text-center font-mono font-black whitespace-nowrap">
                                                <span className={isExit ? 'text-red-600' : 'text-green-600'}>
                                                    {isExit ? '' : '+'}{row.qtyChange}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono font-bold text-gray-800">{row.qtyAfter}</td>
                                            <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{row.reason ?? '—'}</td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{row.sellerName ?? '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
