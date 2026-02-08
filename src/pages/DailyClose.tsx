/**
 * @file DailyClose.tsx
 * @description Cierre de Caja (Reportes X y Z).
 * Calcula los totales del día actual y permite la impresión de reportes financieros.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { printTicket } from '../utils/ticketGenerator';
import {
    Printer, Calendar, DollarSign, CreditCard,
    TrendingUp, FileText, AlertTriangle
} from 'lucide-react';

export const DailyClose = () => {
    const { sales, paymentMethods } = useStore();
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

    // 1. FILTRAR VENTAS DE LA FECHA SELECCIONADA
    const todaysSales = useMemo(() => {
        return sales.filter(s =>
            s.status !== 'CANCELLED' &&
            new Date(s.date).toISOString().split('T')[0] === reportDate
        );
    }, [sales, reportDate]);

    // 2. CÁLCULOS FINANCIEROS
    const totalUSD = todaysSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const totalBs = todaysSales.reduce((acc, s) => acc + s.totalVED, 0);
    const ticketCount = todaysSales.length;

    // Desglose por Método de Pago
    const breakdown = useMemo(() => {
        const map: Record<string, number> = {};
        todaysSales.forEach(sale => {
            const method = sale.paymentMethod || 'Otros';
            map[method] = (map[method] || 0) + sale.totalUSD;
        });
        return map;
    }, [todaysSales]);

    // 3. IMPRESIÓN
    const handlePrint = (type: 'X' | 'Z') => {
        if (todaysSales.length === 0) return alert("No hay movimientos para generar reporte.");

        printTicket({
            type,
            date: reportDate,
            totalUSD,
            totalBs,
            itemsCount: ticketCount,
            breakdown,
            reportNumber: Date.now().toString().slice(-6), // Simulación de correlativo
            paymentMethods
        });
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cierre de Caja</h2>
                    <p className="text-gray-500 font-medium">Arqueo y reportes diarios</p>
                </div>

                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                    <Calendar size={18} className="text-gray-400 ml-2" />
                    <input
                        type="date"
                        className="font-bold text-gray-700 bg-transparent outline-none"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                    />
                </div>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-green-50 text-green-600 rounded-xl"><DollarSign size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Ventas Totales ($)</p>
                        <p className="text-2xl font-black text-gray-900">{formatCurrency(totalUSD, 'USD')}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Referencia (Bs)</p>
                        <p className="text-2xl font-black text-gray-900">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><FileText size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Transacciones</p>
                        <p className="text-2xl font-black text-gray-900">{ticketCount}</p>
                    </div>
                </div>
            </div>

            {/* DETALLE Y ACCIONES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Columna Izquierda: Desglose */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><CreditCard size={18} /> Desglose por Método</h3>
                    </div>
                    <div className="p-5">
                        {Object.keys(breakdown).length === 0 ? (
                            <div className="text-center py-10 text-gray-400">Sin movimientos registrados.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-bold">
                                    <tr>
                                        <th className="p-3 text-left">Método de Pago</th>
                                        <th className="p-3 text-right">Total ($)</th>
                                        <th className="p-3 text-right">% del Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {Object.entries(breakdown).map(([method, amount]) => (
                                        <tr key={method}>
                                            <td className="p-3 font-bold text-gray-700">{method}</td>
                                            <td className="p-3 text-right font-medium">{formatCurrency(amount, 'USD')}</td>
                                            <td className="p-3 text-right text-gray-400 text-xs">
                                                {((amount / totalUSD) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Columna Derecha: Acciones de Caja */}
                <div className="space-y-4">
                    <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><Printer size={80} /></div>
                        <h3 className="text-lg font-bold mb-1">Corte Parcial (X)</h3>
                        <p className="text-sm text-gray-400 mb-6">Resumen de ventas hasta el momento. No cierra el turno.</p>
                        <button
                            onClick={() => handlePrint('X')}
                            className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition flex items-center justify-center gap-2"
                        >
                            <Printer size={18} /> IMPRIMIR REPORTE X
                        </button>
                    </div>

                    <div className="bg-red-600 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><AlertTriangle size={80} /></div>
                        <h3 className="text-lg font-bold mb-1">Cierre Diario (Z)</h3>
                        <p className="text-sm text-red-100 mb-6">Finaliza las operaciones del día. Imprime totales definitivos.</p>
                        <button
                            onClick={() => handlePrint('Z')}
                            className="w-full py-3 bg-white text-red-600 hover:bg-gray-50 rounded-xl font-bold transition flex items-center justify-center gap-2"
                        >
                            <Printer size={18} /> IMPRIMIR REPORTE Z
                        </button>
                    </div>
                </div>

            </div>

        </div>
    );
};