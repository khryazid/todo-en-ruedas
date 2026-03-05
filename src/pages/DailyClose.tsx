/**
 * @file DailyClose.tsx
 * @description Módulo de Cierre de Caja (Reporte Z) REAL.
 * Calcula ventas desde el último cierre hasta el momento actual.
 * ✅ FEAT: Historial de cierres Z desde tabla cash_closes.
 * ✅ FEAT: performDailyClose recibe totales del turno.
 */

import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { printTicket, printDailyCloseReport } from '../utils/ticketGenerator';
import { supabase } from '../supabase/client';
import { generateId } from '../utils/id';
import { DollarSign, Printer, Lock, Clock, AlertTriangle, History, User, FileText, TrendingDown } from 'lucide-react';
import type { CashClose } from '../types';

export const DailyClose = () => {
    const { sales, paymentMethods, settings, performDailyClose, expenses, fetchExpenses } = useStore();
    const [reportType, setReportType] = useState<'X' | 'Z'>('X');
    const [closeHistory, setCloseHistory] = useState<CashClose[]>([]);

    // --- FETCH HISTORIAL DE CIERRES ---
    useEffect(() => {
        const fetchHistory = async () => {
            const { data } = await supabase
                .from('cash_closes')
                .select('*')
                .order('closed_at', { ascending: false })
                .limit(10);

            if (data) {
                setCloseHistory(data.map(r => ({
                    id: r.id,
                    sequenceNumber: r.sequence_number,
                    closedAt: r.closed_at,
                    closedBy: r.closed_by,
                    sellerName: r.seller_name,
                    totalUSD: r.total_usd,
                    totalBs: r.total_bs,
                    txCount: r.tx_count,
                })));
            }
        };
        fetchHistory();
    }, [settings.lastCloseDate]);

    useEffect(() => { fetchExpenses(); }, [fetchExpenses]); // Re-fetch cuando se hace un nuevo cierre

    // --- LÓGICA DE CORTE DE TURNO ---
    const lastClose = useMemo(() =>
        settings.lastCloseDate ? new Date(settings.lastCloseDate) : null,
        [settings.lastCloseDate]
    );

    const shiftOpenTime = useMemo(() => {
        if (!lastClose) return null;
        const [hours, minutes] = (settings.shiftStart || '08:00').split(':').map(Number);
        const openDate = new Date(lastClose);
        openDate.setHours(hours, minutes, 0, 0);
        return openDate;
    }, [lastClose, settings.shiftStart]);

    const currentShiftSales = sales.filter(sale => {
        if (sale.status === 'CANCELLED') return false;
        if (!lastClose) return true;
        return new Date(sale.date) > lastClose;
    });

    // --- CÁLCULOS DEL TURNO ACTUAL ---
    const totalUSD = currentShiftSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const totalBs = currentShiftSales.reduce((acc, s) => acc + s.totalVED, 0);
    const totalBsByRate = totalUSD * settings.tasaBCV;

    // Gastos del turno actual
    const shiftExpenses = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const sinceStr = lastClose ? lastClose.toISOString().split('T')[0] : null;
        return expenses.filter(e => e.date === todayStr || (sinceStr && e.date >= sinceStr));
    }, [expenses, lastClose]);
    const totalExpensesUSD = shiftExpenses.reduce((acc, e) => acc + e.amountUSD, 0);
    const netProfitUSD = totalUSD - totalExpensesUSD;

    const breakdown = (() => {
        const map: Record<string, { amountUSD: number; currency: 'USD' | 'BS' }> = {};
        paymentMethods.forEach(pm => {
            map[pm.name] = { amountUSD: 0, currency: pm.currency };
        });
        currentShiftSales.forEach(sale => {
            const paid = sale.paidAmountUSD;
            if (paid > 0) {
                const method = sale.paymentMethod;
                if (!map[method]) {
                    map[method] = { amountUSD: 0, currency: 'USD' };
                }
                map[method].amountUSD += paid;
            }
        });
        return map;
    })();

    const handlePrint = async () => {
        if (reportType === 'X' && currentShiftSales.length === 0) {
            return alert('No hay movimientos para imprimir.');
        }

        const confirmMessage = reportType === 'Z'
            ? `¿Estás seguro de realizar el CIERRE Z?${currentShiftSales.length === 0 ? ' (Turno en $0.00)' : ''} Esto reiniciará los contadores a cero.`
            : 'Imprimir Corte Parcial (X) no reinicia los contadores.';

        if (window.confirm(confirmMessage)) {
            let nextSequenceNumber: number | null = null;
            let reportIdentifier = generateId().slice(-6);

            if (reportType === 'Z') {
                const newCloseResult = await performDailyClose({
                    totalUSD,
                    totalBs,
                    txCount: currentShiftSales.length,
                });

                if (newCloseResult && newCloseResult.sequenceNumber) {
                    nextSequenceNumber = newCloseResult.sequenceNumber;
                } else {
                    nextSequenceNumber = closeHistory.length > 0 ? (closeHistory[0].sequenceNumber || 0) + 1 : 1;
                }
                reportIdentifier = `Z #${nextSequenceNumber}`;
            } else {
                reportIdentifier = `X PARCIAL`;
            }

            printTicket({
                type: reportType,
                date: new Date().toLocaleString('es-VE'),
                totalUSD,
                totalBs,
                itemsCount: currentShiftSales.length,
                breakdown: Object.fromEntries(
                    Object.entries(breakdown).map(([method, info]) => [method, info.amountUSD])
                ),
                reportNumber: reportIdentifier,
                paymentMethods
            });

            if (reportType === 'Z') {
                // Refrescar historial después del cierre
                supabase
                    .from('cash_closes')
                    .select('*')
                    .order('closed_at', { ascending: false })
                    .limit(10)
                    .then(({ data }) => {
                        if (data) setCloseHistory(data.map(r => ({
                            id: r.id,
                            sequenceNumber: r.sequence_number,
                            closedAt: r.closed_at,
                            closedBy: r.closed_by,
                            sellerName: r.seller_name,
                            totalUSD: r.total_usd,
                            totalBs: r.total_bs,
                            txCount: r.tx_count,
                        })));
                    });
            }
        }
    };

    // Reimprimir un cierre histórico del historial
    const handleReprintClose = (c: CashClose) => {
        printTicket({
            type: 'Z',
            date: new Date(c.closedAt).toLocaleString('es-VE'),
            totalUSD: c.totalUSD,
            totalBs: c.totalBs,
            itemsCount: c.txCount,
            breakdown: { 'TOTAL (sin desglose)': c.totalUSD },
            reportNumber: c.sequenceNumber ? `Z #${c.sequenceNumber}` : `REIMP-${c.id.slice(-6)}`,
            paymentMethods,
        });
    };

    // Reporte PDF del turno actual
    const handlePrintPDF = () => {
        // Desglose por vendedor
        const sellerBreakdown: Record<string, { count: number; totalUSD: number }> = {};
        currentShiftSales.forEach(s => {
            const name = s.sellerName || 'Admin';
            if (!sellerBreakdown[name]) sellerBreakdown[name] = { count: 0, totalUSD: 0 };
            sellerBreakdown[name].count++;
            sellerBreakdown[name].totalUSD += s.totalUSD;
        });

        const currentReportId = generateId().slice(-6);
        printDailyCloseReport({
            type: reportType,
            date: new Date().toLocaleString('es-VE'),
            totalUSD,
            totalBs,
            txCount: currentShiftSales.length,
            breakdown: Object.fromEntries(
                Object.entries(breakdown).map(([method, info]) => [method, info.amountUSD])
            ),
            sellerBreakdown,
            companyName: settings.companyName || 'Glyph Core',
            reportNumber: currentReportId,
            shiftOpenTime: shiftOpenTime?.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) || undefined,
        });
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cierre de Caja</h2>
                    <p className="text-gray-500 font-medium">Arqueo y reportes de turno</p>
                </div>
                {/* Chips de tiempo del turno */}
                <div className="flex flex-col sm:flex-row gap-2">
                    {/* Apertura - hora configurada */}
                    <div className="bg-white px-4 py-2 rounded-xl border border-green-100 shadow-sm flex items-center gap-3">
                        <Clock className="text-green-500" size={18} />
                        <div>
                            <p className="text-[10px] text-gray-400 uppercase font-bold">Apertura del Turno</p>
                            <p className="text-sm font-bold text-gray-800">
                                {shiftOpenTime
                                    ? shiftOpenTime.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
                                    : 'Inicio del Sistema'
                                }
                            </p>
                        </div>
                    </div>
                    {/* Último Cierre Z - timestamp exacto */}
                    {lastClose && (
                        <div className="bg-white px-4 py-2 rounded-xl border border-red-100 shadow-sm flex items-center gap-3">
                            <Lock className="text-red-400" size={18} />
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Último Cierre Z</p>
                                <p className="text-sm font-bold text-gray-800">
                                    {lastClose.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* PANEL IZQUIERDO: TOTALES */}
                <div className="lg:col-span-2 space-y-6">

                    {/* TARJETAS KPI */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80} /></div>
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Ventas del Turno</p>
                            <h3 className="text-4xl font-black">{formatCurrency(totalUSD, 'USD')}</h3>
                            <p className="text-sm text-gray-400 mt-2">{currentShiftSales.length} transacciones</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center">
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Ref. en Bolívares</p>
                            <h3 className="text-3xl font-black text-gray-800">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-gray-600 mt-2 font-medium">{formatCurrency(totalUSD, 'USD')} × Bs. {settings.tasaBCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-xs text-orange-500 mt-1 font-medium bg-orange-50 inline-block px-2 py-1 rounded">
                                = Bs. {totalBsByRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (referencia por tasa)
                            </p>
                        </div>
                    </div>

                    {/* GASTOS Y UTILIDAD NETA */}
                    {(shiftExpenses.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-red-50 border border-red-100 p-5 rounded-2xl flex items-center gap-4">
                                <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <TrendingDown size={20} className="text-red-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-red-400 uppercase font-bold mb-0.5">Gastos del Turno</p>
                                    <p className="text-2xl font-black text-red-600">{formatCurrency(totalExpensesUSD, 'USD')}</p>
                                    <p className="text-xs text-red-400">{shiftExpenses.length} gasto{shiftExpenses.length !== 1 ? 's' : ''} registrado{shiftExpenses.length !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                            <div className={`p-5 rounded-2xl border flex items-center gap-4 ${netProfitUSD >= 0 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${netProfitUSD >= 0 ? 'bg-green-100' : 'bg-orange-100'}`}>
                                    <DollarSign size={20} className={netProfitUSD >= 0 ? 'text-green-500' : 'text-orange-500'} />
                                </div>
                                <div>
                                    <p className={`text-xs uppercase font-bold mb-0.5 ${netProfitUSD >= 0 ? 'text-green-400' : 'text-orange-400'}`}>Utilidad Neta</p>
                                    <p className={`text-2xl font-black ${netProfitUSD >= 0 ? 'text-green-600' : 'text-orange-600'}`}>{formatCurrency(netProfitUSD, 'USD')}</p>
                                    <p className={`text-xs ${netProfitUSD >= 0 ? 'text-green-400' : 'text-orange-400'}`}>Ventas - Gastos</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DESGLOSE */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 text-sm">Desglose por Método de Pago</h3>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {Object.entries(breakdown).map(([method, info]) => (
                                <div key={method} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50/30">
                                    <div>
                                        <span className="font-bold text-gray-600 text-sm block">{method}</span>
                                        <span className="text-[11px] text-gray-500">
                                            {info.currency === 'BS'
                                                ? `${formatCurrency(info.amountUSD, 'USD')} × Bs. ${settings.tasaBCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : formatCurrency(info.amountUSD, 'USD')}
                                        </span>
                                    </div>
                                    <span className="font-mono font-bold text-gray-800">
                                        {info.currency === 'BS'
                                            ? `Bs. ${(info.amountUSD * settings.tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                            : formatCurrency(info.amountUSD, 'USD')}
                                    </span>
                                </div>
                            ))}
                            {Object.keys(breakdown).length === 0 && <p className="text-gray-400 text-sm p-2">Sin movimientos.</p>}
                        </div>
                    </div>

                    {/* HISTORIAL DE CIERRES Z */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center gap-2">
                            <History size={16} className="text-gray-500" />
                            <h3 className="font-bold text-gray-800 text-sm">Historial de Cierres Z</h3>
                            <span className="ml-auto text-[10px] text-gray-400 font-medium">Últimos 10</span>
                        </div>
                        {closeHistory.length === 0 ? (
                            <p className="text-center text-gray-400 text-xs py-8">No hay cierres registrados aún.</p>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {closeHistory.map((c, i) => (
                                    <div key={c.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${i === 0 ? 'bg-green-50/40' : ''}`}>
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${i === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            Z
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-gray-700">
                                                {new Date(c.closedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                                                {i === 0 && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">Último</span>}
                                            </p>
                                            {c.sellerName && (
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                    <User size={10} /> {c.sellerName}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0 mr-2">
                                            <p className="font-bold text-gray-800">Cierre Z - {formatCurrency(c.totalUSD, 'USD')}</p>
                                            <p className="text-xs text-gray-400 font-mono">#{c.sequenceNumber || c.id.slice(-6)} ({c.txCount} tx)</p>
                                            <p className="text-[10px] text-gray-500">
                                                Tasa implícita:{' '}
                                                {c.totalUSD > 0
                                                    ? `Bs. ${(c.totalBs / c.totalUSD).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $1`
                                                    : 'N/A'}
                                            </p>
                                        </div>
                                        {/* Botón reimprimir */}
                                        <button
                                            onClick={() => handleReprintClose(c)}
                                            title="Reimprimir este cierre Z"
                                            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                        >
                                            <Printer size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* PANEL DERECHO: ACCIONES */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Printer size={20} /> Operaciones</h3>

                    <div className="space-y-4">
                        {/* SELECCIÓN DE REPORTE */}
                        <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                            <button
                                onClick={() => setReportType('X')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${reportType === 'X' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Corte X (Ver)
                            </button>
                            <button
                                onClick={() => setReportType('Z')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${reportType === 'Z' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Cierre Z (Cerrar)
                            </button>
                        </div>

                        {/* INFO DE LA ACCIÓN */}
                        <div className={`p-4 rounded-xl text-sm mb-4 ${reportType === 'Z' ? 'bg-red-50 text-red-800 border border-red-100' : 'bg-blue-50 text-blue-800 border border-blue-100'}`}>
                            <div className="flex gap-2">
                                <AlertTriangle size={18} className="flex-shrink-0" />
                                <p>
                                    {reportType === 'Z' ? <strong>Advertencia:</strong> : <strong>Información:</strong>}
                                    <br />
                                    {reportType === 'Z'
                                        ? 'Al imprimir el Reporte Z, el sistema reiniciará los contadores a $0.00 para el próximo turno.'
                                        : 'El Reporte X es solo informativo. No afecta los totales acumulados del día.'
                                    }
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handlePrint}
                            disabled={reportType === 'X' && currentShiftSales.length === 0}
                            className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${reportType === 'Z' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {reportType === 'Z' ? <Lock size={20} /> : <Printer size={20} />}
                            {reportType === 'Z' ? 'CERRAR CAJA Y REINICIAR' : 'IMPRIMIR CORTE PARCIAL'}
                        </button>

                        <button
                            onClick={handlePrintPDF}
                            disabled={currentShiftSales.length === 0}
                            className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <FileText size={18} /> Exportar Reporte PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};