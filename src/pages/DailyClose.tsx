import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { printTicket } from '../utils/ticketGenerator';
import {
    Archive, DollarSign, Banknote, Smartphone,
    CheckCircle, Calendar, Printer, FileText
} from 'lucide-react';

export const DailyClosePage = () => {
    const { sales, registerDailyClose, dailyCloses, settings, paymentMethods } = useStore();
    const [notes, setNotes] = useState('');

    const todayStr = new Date().toLocaleDateString('es-ES');
    const todaysSales = sales.filter(s =>
        new Date(s.date).toLocaleDateString('es-ES') === todayStr &&
        s.status !== 'CANCELLED'
    );

    const totalUSD = todaysSales.reduce((acc, s) => acc + s.totalUSD, 0);

    const breakdown = todaysSales.reduce((acc, s) => {
        const method = s.paymentMethod || 'Efectivo';
        acc[method] = (acc[method] || 0) + s.totalUSD;
        return acc;
    }, {} as Record<string, number>);

    const handlePrint = (type: 'X' | 'Z') => {
        printTicket({
            type,
            date: todayStr,
            totalUSD,
            totalBs: totalUSD * settings.tasaBCV,
            itemsCount: todaysSales.length,
            breakdown,
            reportNumber: type === 'Z' ? new Date().getTime().toString().slice(-6) : undefined,
            paymentMethods
        });
    };

    const handleCloseDay = () => {
        if (window.confirm(`¿Confirmas el CIERRE DEFINITIVO por ${formatCurrency(totalUSD, 'USD')}?`)) {
            handlePrint('Z');
            registerDailyClose(notes);
            setNotes('');
        }
    };

    const isClosedToday = dailyCloses.some(c => new Date(c.date).toLocaleDateString('es-ES') === todayStr);

    return (
        // RESPONSIVE FIX
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 bg-gray-50 min-h-screen w-full">

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div><h2 className="text-2xl font-bold text-gray-800">Cierre de Caja</h2><p className="text-gray-500">Gestión de cortes y cierres</p></div>
                <div className="flex gap-2 md:gap-3 w-full md:w-auto">
                    <button onClick={() => handlePrint('X')} className="flex-1 md:flex-none bg-white text-blue-600 border border-blue-100 px-4 py-2 rounded-xl flex justify-center items-center gap-2 font-bold shadow-sm"><FileText size={20} /> X</button>
                    <button onClick={() => handlePrint('Z')} className="flex-1 md:flex-none bg-gray-900 text-white px-4 py-2 rounded-xl flex justify-center items-center gap-2 shadow-xl font-bold"><Printer size={20} /> Z</button>
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-2"><Calendar className="text-blue-600" size={20} /><span className="font-bold text-gray-700">{todayStr}</span></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><DollarSign className="text-green-600" /> Arqueo Actual</h3>
                    {todaysSales.length === 0 ? (<div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-10"><Archive size={48} className="mb-2 opacity-20" /><p>No hay ventas registradas hoy.</p></div>) : (
                        <div className="space-y-6 flex-1">
                            <div className="space-y-3">
                                {Object.entries(breakdown).map(([method, amount]) => (
                                    <div key={method} className="flex justify-between items-center p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            {method === 'Efectivo' && <Banknote className="text-green-600" />}
                                            {method === 'Pago Móvil' && <Smartphone className="text-blue-600" />}
                                            <span className="font-bold text-gray-700 text-sm md:text-base">{method}</span>
                                        </div>
                                        <span className="font-bold text-base md:text-lg text-gray-900">{formatCurrency(amount, 'USD')}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t pt-4 mt-4 flex justify-between items-end"><span className="text-gray-500 font-bold">TOTAL</span><span className="text-3xl md:text-4xl font-black text-gray-900">{formatCurrency(totalUSD, 'USD')}</span></div>
                            {!isClosedToday ? (
                                <div className="mt-6 space-y-4">
                                    <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-blue-300 transition" rows={2} placeholder="Notas..." value={notes} onChange={e => setNotes(e.target.value)}></textarea>
                                    <button onClick={handleCloseDay} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 transition flex items-center justify-center gap-2"><CheckCircle size={20} /> CERRAR DÍA (Z)</button>
                                </div>
                            ) : (<div className="bg-green-50 border border-green-200 p-4 rounded-xl text-center text-green-700 font-bold flex items-center justify-center gap-2 mt-6"><CheckCircle /> Día Cerrado</div>)}
                        </div>
                    )}
                </div>
                {/* Historial (Omitido por brevedad, es una lista simple) */}
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Archive className="text-blue-600" /> Historial</h3>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[400px]">
                        {dailyCloses.length === 0 ? (<p className="text-gray-400 text-center py-10">Vacío</p>) : dailyCloses.map(c => <div key={c.id} className="p-4 border rounded-xl flex justify-between"><span>{new Date(c.date).toLocaleDateString()}</span><span className="font-bold text-green-700">{formatCurrency(c.totalUSD, 'USD')}</span></div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};