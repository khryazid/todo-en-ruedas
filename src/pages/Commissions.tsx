/**
 * @file pages/Commissions.tsx
 * @description Reporte de Comisiones de Vendedores.
 * Solo visible para ADMIN y MANAGER.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { Award, TrendingUp, DollarSign } from 'lucide-react';

export const Commissions = () => {
    const { sales, settings } = useStore();
    const [filterType, setFilterType] = useState<'today' | 'week' | 'month'>('month');

    const commissionPct = settings.sellerCommissionPct ?? 5;

    const dateRange = useMemo(() => {
        const now = new Date();
        const start = new Date();
        if (filterType === 'today') return { start: now, end: now };
        if (filterType === 'week') {
            const day = now.getDay() || 7;
            if (day !== 1) start.setDate(start.getDate() - (day - 1));
            return { start, end: now };
        }
        if (filterType === 'month') { start.setDate(1); return { start, end: now }; }
        return { start: now, end: now };
    }, [filterType]);

    const filteredSales = sales.filter(s => {
        if (s.status === 'CANCELLED') return false;
        const d = new Date(s.date).toISOString().split('T')[0];
        const startStr = dateRange.start.toISOString().split('T')[0];
        const endStr = dateRange.end.toISOString().split('T')[0];
        return d >= startStr && d <= endStr;
    });

    const sellerStats = useMemo(() => {
        const map: Record<string, { name: string; count: number; totalUSD: number; commission: number }> = {};
        filteredSales.forEach(s => {
            const name = s.sellerName || 'Admin';
            if (!map[name]) map[name] = { name, count: 0, totalUSD: 0, commission: 0 };
            map[name].count++;
            map[name].totalUSD += s.totalUSD;
            map[name].commission += s.totalUSD * (commissionPct / 100);
        });
        return Object.values(map).sort((a, b) => b.totalUSD - a.totalUSD);
    }, [filteredSales, commissionPct]);

    const totalUSD = sellerStats.reduce((acc, s) => acc + s.totalUSD, 0);
    const totalCommissions = sellerStats.reduce((acc, s) => acc + s.commission, 0);

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Comisiones de Vendedores</h2>
                    <p className="text-gray-500 font-medium">Tasa actual: <strong className="text-gray-800">{commissionPct}%</strong> sobre ventas completadas</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    {(['today', 'week', 'month'] as const).map(t => (
                        <button key={t} onClick={() => setFilterType(t)} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${filterType === t ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                            {t === 'today' ? 'Hoy' : t === 'week' ? 'Semana' : 'Mes'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80} /></div>
                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Ventas Totales (período)</p>
                    <h3 className="text-3xl font-black">{formatCurrency(totalUSD, 'USD')}</h3>
                    <p className="text-sm text-gray-400 mt-1">{filteredSales.length} operaciones</p>
                </div>
                <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-100 flex flex-col justify-between">
                    <p className="text-xs text-yellow-600 uppercase font-bold mb-1 flex items-center gap-1"><Award size={12} /> Total Comisiones</p>
                    <h3 className="text-3xl font-black text-yellow-700">{formatCurrency(totalCommissions, 'USD')}</h3>
                    <p className="text-sm text-gray-400 mt-1">a pagar este período</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1 flex items-center gap-1"><TrendingUp size={12} /> Vendedores Activos</p>
                    <h3 className="text-3xl font-black text-gray-800">{sellerStats.length}</h3>
                    <p className="text-sm text-gray-400 mt-1">con ventas en el período</p>
                </div>
            </div>

            {/* TABLA */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-50">
                    <h3 className="font-bold text-gray-800">Desglose por Vendedor</h3>
                </div>

                {sellerStats.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        <Award size={40} className="mx-auto mb-3 opacity-30" />
                        <p>No hay ventas registradas en este período.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">#</th>
                                    <th className="px-6 py-3">Vendedor</th>
                                    <th className="px-6 py-3 text-center">Operaciones</th>
                                    <th className="px-6 py-3 text-right">Total Vendido</th>
                                    <th className="px-6 py-3 text-right">Comisión ({commissionPct}%)</th>
                                    <th className="px-6 py-3 text-right">% del Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sellerStats.map((s, i) => (
                                    <tr key={s.name} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {i === 0 && <Award size={14} className="text-yellow-500" />}
                                                <span className="font-bold text-gray-800">{s.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">{s.count}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-gray-900">{formatCurrency(s.totalUSD, 'USD')}</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-bold text-green-600">{formatCurrency(s.commission, 'USD')}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalUSD > 0 ? (s.totalUSD / totalUSD) * 100 : 0}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-gray-500">
                                                    {totalUSD > 0 ? ((s.totalUSD / totalUSD) * 100).toFixed(1) : '0'}%
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold text-gray-800">
                                <tr>
                                    <td className="px-6 py-3" colSpan={3}>TOTAL</td>
                                    <td className="px-6 py-3 text-right">{formatCurrency(totalUSD, 'USD')}</td>
                                    <td className="px-6 py-3 text-right text-green-600">{formatCurrency(totalCommissions, 'USD')}</td>
                                    <td className="px-6 py-3 text-right">100%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
