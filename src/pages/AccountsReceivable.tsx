/**
 * @file AccountsReceivable.tsx
 * @description Gestión de Cuentas por Cobrar (Fiados).
 * Permite visualizar deudas de clientes y registrar abonos.
 */

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    Users, Search, DollarSign, Calendar, CheckCircle,
    TrendingUp, Wallet, X, AlertCircle, History
} from 'lucide-react';
import type { Payment } from '../types';

export const AccountsReceivable = () => {
    const { sales, clients, paymentMethods, registerSalePayment } = useStore();

    // Estados UI
    const [searchTerm, setSearchTerm] = useState('');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

    // Estados Formulario Pago
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]?.name || 'Efectivo');
    const [paymentNote, setPaymentNote] = useState('');

    // 1. FILTRAR VENTAS CON DEUDA (PENDING o PARTIAL)
    const pendingSales = sales.filter(s =>
        (s.status === 'PENDING' || s.status === 'PARTIAL') && s.status !== 'CANCELLED'
    ).filter(s => {
        const client = clients.find(c => c.id === s.clientId);
        const name = client?.name.toLowerCase() || 'anónimo';
        return name.includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 2. CALCULAR TOTAL POR COBRAR
    const totalReceivable = pendingSales.reduce((acc, s) => acc + (s.totalUSD - s.paidAmountUSD), 0);

    // Handlers
    const openPaymentModal = (saleId: string) => {
        setSelectedSaleId(saleId);
        setPaymentAmount('');
        setIsPaymentModalOpen(true);
    };

    const handleRegisterPayment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSaleId) return;

        const sale = sales.find(s => s.id === selectedSaleId);
        if (!sale) return;

        const debt = sale.totalUSD - sale.paidAmountUSD;
        const amount = parseFloat(paymentAmount);

        if (amount <= 0 || amount > debt + 0.01) return alert("Monto inválido");

        const newPayment: Payment = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            amountUSD: amount,
            method: paymentMethod,
            note: paymentNote
        };

        registerSalePayment(selectedSaleId, newPayment);
        alert("✅ Abono registrado exitosamente");
        setIsPaymentModalOpen(false);
    };

    const getClientName = (id?: string) => {
        return clients.find(c => c.id === id)?.name || 'Cliente Anónimo';
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cuentas por Cobrar</h2>
                    <p className="text-gray-500 font-medium">Gestión de créditos y fiados</p>
                </div>
                <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="bg-orange-50 p-2 rounded-lg text-orange-600"><TrendingUp size={20} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Total en Calle</p>
                        <p className="text-xl font-black text-orange-600">{formatCurrency(totalReceivable, 'USD')}</p>
                    </div>
                </div>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar Cliente o Nº Ticket..."
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-orange-100 font-medium"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* GRID DE DEUDAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pendingSales.map(sale => {
                    const debt = sale.totalUSD - sale.paidAmountUSD;
                    const progress = (sale.paidAmountUSD / sale.totalUSD) * 100;

                    return (
                        <div key={sale.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-lg truncate w-48" title={getClientName(sale.clientId)}>
                                            {getClientName(sale.clientId)}
                                        </h3>
                                        <p className="text-xs text-gray-400 font-mono mt-1">Ticket #{sale.id.slice(-6)}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide">PENDIENTE</span>
                                        <p className="text-[10px] text-gray-400 mt-1">{new Date(sale.date).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                {/* Barra de Progreso */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-xs mb-1 font-bold">
                                        <span className="text-green-600">Pagado: {formatCurrency(sale.paidAmountUSD, 'USD')}</span>
                                        <span className="text-gray-400">{Math.round(progress)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>

                                {/* Detalles Financieros */}
                                <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-200 mb-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-500 uppercase font-bold">Deuda Restante</span>
                                        <span className="text-xl font-black text-orange-600">{formatCurrency(debt, 'USD')}</span>
                                    </div>
                                    <p className="text-right text-[10px] text-gray-400 mt-1">Total Venta: {formatCurrency(sale.totalUSD, 'USD')}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => openPaymentModal(sale.id)}
                                className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
                            >
                                <Wallet size={18} /> REGISTRAR ABONO
                            </button>
                        </div>
                    );
                })}
                {pendingSales.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">
                        <CheckCircle size={48} className="mx-auto mb-3 opacity-20 text-green-500" />
                        <p>¡Todo al día! No hay cuentas por cobrar pendientes.</p>
                    </div>
                )}
            </div>

            {/* MODAL DE ABONO */}
            {isPaymentModalOpen && selectedSaleId && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-800">Registrar Cobro</h3>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
                        </div>

                        {/* Info Deuda */}
                        <div className="bg-orange-50 p-4 rounded-xl text-center border border-orange-100 mb-4">
                            <p className="text-xs text-orange-400 uppercase font-bold mb-1">Monto Pendiente</p>
                            <p className="text-3xl font-black text-orange-600">
                                {(() => {
                                    const s = sales.find(x => x.id === selectedSaleId);
                                    return s ? formatCurrency(s.totalUSD - s.paidAmountUSD, 'USD') : '$0.00';
                                })()}
                            </p>
                        </div>

                        <form onSubmit={handleRegisterPayment} className="space-y-4">
                            <div>
                                <div className="flex justify-between">
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Monto a Abonar ($)</label>
                                    <button type="button" onClick={() => {
                                        const s = sales.find(x => x.id === selectedSaleId);
                                        if (s) setPaymentAmount((s.totalUSD - s.paidAmountUSD).toFixed(2));
                                    }} className="text-[10px] text-blue-600 font-bold hover:underline">COBRAR TODO</button>
                                </div>
                                <input type="number" step="0.01" required autoFocus className="w-full border-2 border-gray-200 rounded-xl p-3 text-lg font-bold focus:border-green-500 outline-none" placeholder="0.00" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Método de Pago</label>
                                <select className="w-full border-2 border-gray-200 rounded-xl p-3 bg-white font-medium" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                    {paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nota (Opcional)</label>
                                <input className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm" placeholder="Recibido por..." value={paymentNote} onChange={e => setPaymentNote(e.target.value)} />
                            </div>

                            <button type="submit" className="w-full py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg mt-2 flex items-center justify-center gap-2">
                                <CheckCircle size={20} /> CONFIRMAR PAGO
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};