/**
 * @file Invoices.tsx
 * @description Gestión de Cuentas por Pagar.
 * Permite visualizar deudas, registrar abonos y liquidar facturas.
 */

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    FileText, Calendar, DollarSign, CheckCircle,
    AlertTriangle, Plus, X, Wallet
} from 'lucide-react';
import type { Invoice, Payment } from '../types';

export const Invoices = () => {
    const { invoices, registerPayment, paymentMethods } = useStore();
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]?.name || 'Efectivo');

    // Ordenar: Pendientes primero, luego por fecha vencimiento
    const sortedInvoices = [...invoices].sort((a, b) => {
        if (a.status === 'PENDING' && b.status === 'PAID') return -1;
        if (a.status === 'PAID' && b.status === 'PENDING') return 1;
        return new Date(a.dateDue).getTime() - new Date(b.dateDue).getTime();
    });

    const handleRegisterPayment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice) return;
        const amount = parseFloat(paymentAmount);
        if (amount <= 0) return alert("Monto inválido");

        // Validar que no pague de más
        const debt = selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD;
        if (amount > debt + 0.01) return alert(`El monto excede la deuda (${formatCurrency(debt, 'USD')})`);

        const newPayment: Payment = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            amountUSD: amount,
            method: paymentMethod,
            note: 'Abono manual'
        };

        registerPayment(selectedInvoice.id, newPayment);
        alert("✅ Pago registrado");
        setPaymentAmount('');
        setSelectedInvoice(null); // Cerrar modal
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cuentas por Pagar</h2>
                    <p className="text-gray-500 font-medium">Gestión de deudas a proveedores</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase">Deuda Total:</span>
                    <span className="text-xl font-black text-red-600">
                        {formatCurrency(invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0), 'USD')}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedInvoices.map(invoice => {
                    const debt = invoice.totalUSD - invoice.paidAmountUSD;
                    const isPaid = invoice.status === 'PAID';
                    const isOverdue = new Date(invoice.dateDue) < new Date() && !isPaid;

                    return (
                        <div
                            key={invoice.id}
                            className={`bg-white p-5 rounded-2xl border shadow-sm transition hover:shadow-md relative group ${isPaid ? 'border-gray-100 opacity-70' : isOverdue ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200'}`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="font-bold text-gray-800 text-lg truncate">{invoice.supplier}</p>
                                    <p className="text-xs text-gray-400 font-mono flex items-center gap-1"><FileText size={10} /> #{invoice.number}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {isPaid ? 'PAGADA' : 'PENDIENTE'}
                                </span>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Total Factura:</span>
                                    <span className="font-bold">{formatCurrency(invoice.totalUSD, 'USD')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Abonado:</span>
                                    <span className="font-medium text-green-600">{formatCurrency(invoice.paidAmountUSD, 'USD')}</span>
                                </div>
                                <div className="pt-2 border-t border-dashed flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase">Resta por Pagar</span>
                                    <span className={`text-lg font-black ${isPaid ? 'text-gray-300' : 'text-red-600'}`}>{formatCurrency(debt, 'USD')}</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center mt-4">
                                <p className={`text-[10px] font-bold flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>
                                    {isOverdue ? <AlertTriangle size={12} /> : <Calendar size={12} />}
                                    {isOverdue ? 'VENCIDA: ' : 'Vence: '} {new Date(invoice.dateDue).toLocaleDateString()}
                                </p>
                                {!isPaid && (
                                    <button
                                        onClick={() => setSelectedInvoice(invoice)}
                                        className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition flex items-center gap-1"
                                    >
                                        <Wallet size={14} /> ABONAR
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {invoices.length === 0 && <p className="col-span-full text-center py-10 text-gray-400">No hay facturas registradas.</p>}
            </div>

            {/* MODAL DE PAGO */}
            {selectedInvoice && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Registrar Abono</h3>
                            <button onClick={() => setSelectedInvoice(null)}><X size={20} className="text-gray-400 hover:text-red-500" /></button>
                        </div>

                        <form onSubmit={handleRegisterPayment} className="space-y-4">
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                                <p className="text-xs text-gray-500 uppercase font-bold">Deuda Actual</p>
                                <p className="text-2xl font-black text-red-600">{formatCurrency(selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD, 'USD')}</p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Monto a Pagar ($)</label>
                                <input
                                    type="number"
                                    autoFocus
                                    step="0.01"
                                    className="w-full text-lg font-bold border rounded-xl p-3 focus:ring-2 focus:ring-green-100 outline-none"
                                    placeholder="0.00"
                                    value={paymentAmount}
                                    onChange={e => setPaymentAmount(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Método de Pago</label>
                                <select
                                    className="w-full border rounded-xl p-3 bg-white"
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                >
                                    {paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                                </select>
                            </div>

                            <button type="submit" className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 flex justify-center items-center gap-2 mt-2">
                                <CheckCircle size={20} /> CONFIRMAR PAGO
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};