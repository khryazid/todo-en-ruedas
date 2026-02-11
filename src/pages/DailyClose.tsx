/**
 * @file DailyClose.tsx
 * @description Módulo de Cierre de Caja (Reporte Z) REAL.
 * Calcula ventas desde el último cierre hasta el momento actual.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { printTicket } from '../utils/ticketGenerator';
import { DollarSign, Printer, Lock, Clock, AlertTriangle } from 'lucide-react';

export const DailyClose = () => {
    const { sales, paymentMethods, settings, performDailyClose } = useStore();
    const [reportType, setReportType] = useState<'X' | 'Z'>('X');

    // --- LÓGICA DE CORTE DE TURNO ---
    // Obtenemos la fecha del último cierre guardado
    const lastClose = useMemo(() => new Date(settings.lastCloseDate || 0), [settings.lastCloseDate]);

    // Filtramos: Ventas que NO están anuladas Y que ocurrieron DESPUÉS del último cierre
    const currentShiftSales = sales.filter(sale => {
        const saleDate = new Date(sale.date);
        return sale.status !== 'CANCELLED' && saleDate > lastClose;
    });

    // --- CÁLCULOS DEL TURNO ACTUAL ---
    const totalUSD = currentShiftSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const totalBs = currentShiftSales.reduce((acc, s) => acc + s.totalVED, 0);

    // Desglose por Método de Pago
    const breakdown = useMemo(() => {
        const map: Record<string, number> = {};
        paymentMethods.forEach(pm => map[pm.name] = 0);

        currentShiftSales.forEach(sale => {
            // Si hubo abono inicial (crédito) o pago total
            const paid = sale.paidAmountUSD;
            if (paid > 0) {
                const method = sale.paymentMethod;
                map[method] = (map[method] || 0) + paid;
            }
        });
        return map;
    }, [currentShiftSales, paymentMethods]);

    const handlePrint = () => {
        if (currentShiftSales.length === 0) return alert("No hay movimientos para cerrar.");

        const confirmMessage = reportType === 'Z'
            ? "¿Estás seguro de realizar el CIERRE Z? Esto reiniciará los contadores a cero."
            : "Imprimir Corte Parcial (X) no reinicia los contadores.";

        if (window.confirm(confirmMessage)) {
            // 1. Imprimir
            printTicket({
                type: reportType,
                date: new Date().toLocaleString('es-VE'),
                totalUSD,
                totalBs,
                itemsCount: currentShiftSales.length,
                breakdown,
                reportNumber: Date.now().toString().slice(-6),
                paymentMethods
            });

            // 2. Si es Z, ejecutar el corte (resetear contadores)
            if (reportType === 'Z') {
                performDailyClose();
            }
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cierre de Caja</h2>
                    <p className="text-gray-500 font-medium">Arqueo y reportes de turno</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <Clock className="text-blue-500" size={20} />
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Apertura del Turno</p>
                        <p className="text-sm font-bold text-gray-800">
                            {lastClose.getFullYear() === 1970 ? 'Inicio del Sistema' : lastClose.toLocaleString('es-VE')}
                        </p>
                    </div>
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
                            <p className="text-xs text-orange-500 mt-2 font-medium bg-orange-50 inline-block px-2 py-1 rounded">
                                *Acumulado del turno actual
                            </p>
                        </div>
                    </div>

                    {/* DESGLOSE */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 text-sm">Desglose por Método de Pago</h3>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {Object.entries(breakdown).map(([method, amount]) => (
                                <div key={method} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50/30">
                                    <span className="font-bold text-gray-600 text-sm">{method}</span>
                                    <span className="font-mono font-bold text-gray-800">{formatCurrency(amount, 'USD')}</span>
                                </div>
                            ))}
                            {Object.keys(breakdown).length === 0 && <p className="text-gray-400 text-sm p-2">Sin movimientos.</p>}
                        </div>
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
                                    {reportType === 'Z'
                                        ? <strong>Advertencia:</strong>
                                        : <strong>Información:</strong>
                                    }
                                    <br />
                                    {reportType === 'Z'
                                        ? "Al imprimir el Reporte Z, el sistema reiniciará los contadores a $0.00 para el próximo turno."
                                        : "El Reporte X es solo informativo. No afecta los totales acumulados del día."
                                    }
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handlePrint}
                            disabled={currentShiftSales.length === 0}
                            className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${reportType === 'Z' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {reportType === 'Z' ? <Lock size={20} /> : <Printer size={20} />}
                            {reportType === 'Z' ? 'CERRAR CAJA Y REINICIAR' : 'IMPRIMIR CORTE PARCIAL'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};