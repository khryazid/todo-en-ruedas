/**
 * @file Invoices.tsx
 * @description Gestión de Cuentas por Pagar.
 * Incluye botón de "Pagar Total" para liquidar deudas rápidamente.
 */

import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    FileText, CheckCircle, Clock, TrendingDown,
    Save, X, Trash2, Edit, History, Truck, Wallet, Plus, RefreshCw, Zap
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { Invoice, Payment, IncomingItem } from '../types';

export const Invoices = () => {
    const { invoices, products, registerPayment, updateInvoice, updateProduct, paymentMethods } = useStore();
    const location = useLocation();

    // Estados de Modales
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('');
    const [paymentNote, setPaymentNote] = useState('');

    useEffect(() => {
        if (paymentMethods.length > 0) setPaymentMethod(paymentMethods[0].name);
    }, [paymentMethods]);

    useEffect(() => {
        if (location.state?.openInvoiceId) {
            const target = invoices.find(inv => inv.id === location.state.openInvoiceId);
            if (target) openDetailModal(target);
        }
    }, [location.state, invoices]);

    const sortedInvoices = useMemo(() => {
        return [...invoices].sort((a, b) => {
            if (a.status === 'PENDING' && b.status === 'PAID') return -1;
            if (a.status === 'PAID' && b.status === 'PENDING') return 1;
            return new Date(a.dateDue).getTime() - new Date(b.dateDue).getTime();
        });
    }, [invoices]);

    // --- MANEJO DE MODALES ---
    const openPaymentModal = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setPaymentAmount('');
        setIsPaymentModalOpen(true);
    };

    const openDetailModal = (invoice: Invoice) => {
        setEditingInvoice(JSON.parse(JSON.stringify(invoice)));
        setIsDetailModalOpen(true);
    };

    // --- LÓGICA DE EDICIÓN DE PRODUCTOS ---
    const handleItemChange = (index: number, field: keyof IncomingItem, value: any) => {
        if (!editingInvoice) return;
        const newItems = [...editingInvoice.items];
        newItems[index] = { ...newItems[index], [field]: value };
        recalculateTotals(newItems, editingInvoice.freightTotalUSD);
    };

    const handleRemoveItem = (index: number) => {
        if (!editingInvoice) return;
        if (!window.confirm("¿Quitar este producto de la factura? Se ajustará el stock.")) return;
        const newItems = editingInvoice.items.filter((_, i) => i !== index);
        recalculateTotals(newItems, editingInvoice.freightTotalUSD);
    };

    const recalculateTotals = (items: IncomingItem[], freight: number) => {
        if (!editingInvoice) return;
        const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.costUnitUSD), 0);
        const total = subtotal + freight;
        setEditingInvoice({ ...editingInvoice, items, subtotalUSD: subtotal, totalUSD: total });
    };

    const handleSaveDetail = () => {
        if (!editingInvoice) return;
        const originalInvoice = invoices.find(i => i.id === editingInvoice.id);
        if (!originalInvoice) return;

        // 1. Revertir stock viejo
        originalInvoice.items.forEach(oldItem => {
            const product = products.find(p => p.sku === oldItem.sku);
            if (product) updateProduct(product.id, { stock: product.stock - oldItem.quantity });
        });

        // 2. Aplicar stock nuevo (Hack de timeout para asegurar secuencialidad)
        setTimeout(() => {
            editingInvoice.items.forEach(newItem => {
                const currentProducts = useStore.getState().products;
                const product = currentProducts.find(p => p.sku === newItem.sku);
                if (product) updateProduct(product.id, { stock: product.stock + newItem.quantity });
            });
            updateInvoice(editingInvoice);
            alert("✅ Factura actualizada y Stock ajustado correctamente.");
            setIsDetailModalOpen(false);
        }, 50);
    };

    // --- GESTIÓN DE PAGOS ---
    const handleRegisterPayment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice) return;
        const amount = parseFloat(paymentAmount);
        if (amount <= 0) return alert("Monto inválido");
        const debt = selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD;
        // Permitimos un margen de error de 0.01 por redondeo
        if (amount > debt + 0.01) return alert(`El monto excede la deuda (${formatCurrency(debt, 'USD')})`);

        const newPayment: Payment = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            amountUSD: amount,
            method: paymentMethod,
            note: paymentNote
        };
        registerPayment(selectedInvoice.id, newPayment);
        alert("✅ Pago registrado");
        setIsPaymentModalOpen(false);
    };

    const handleDeletePayment = (paymentIndex: number) => {
        if (!editingInvoice) return;
        if (!window.confirm("¿Borrar este pago?")) return;
        const paymentToDelete = editingInvoice.payments[paymentIndex];
        const newPayments = editingInvoice.payments.filter((_, i) => i !== paymentIndex);
        const newPaidAmount = editingInvoice.paidAmountUSD - paymentToDelete.amountUSD;

        let newStatus = editingInvoice.status;
        if (newPaidAmount < editingInvoice.totalUSD - 0.01) newStatus = newPaidAmount > 0 ? 'PARTIAL' : 'PENDING';

        setEditingInvoice({ ...editingInvoice, payments: newPayments, paidAmountUSD: newPaidAmount, status: newStatus });
    };

    const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cuentas por Pagar</h2>
                    <p className="text-gray-500 font-medium">Gestión de proveedores y deudas</p>
                </div>
                <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="bg-red-50 p-2 rounded-lg text-red-600"><TrendingDown size={20} /></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Deuda Total</p><p className="text-xl font-black text-red-600">{formatCurrency(totalDebt, 'USD')}</p></div>
                </div>
            </div>

            {/* GRID FACTURAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedInvoices.map(invoice => {
                    const debt = invoice.totalUSD - invoice.paidAmountUSD;
                    const isPaid = invoice.status === 'PAID';
                    const isOverdue = new Date(invoice.dateDue) < new Date() && !isPaid;
                    return (
                        <div key={invoice.id} className={`bg-white p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${isPaid ? 'border-gray-100 opacity-80' : isOverdue ? 'border-red-200 ring-1 ring-red-50' : 'border-gray-200'}`}>
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <div><h3 className="font-bold text-gray-800 text-lg truncate w-40">{invoice.supplier}</h3><span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono font-bold">#{invoice.number}</span></div>
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{isPaid ? 'PAGADA' : 'PENDIENTE'}</span>
                                </div>
                                <div className="space-y-2 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <div className="flex justify-between text-sm"><span className="text-gray-500">Total:</span><span className="font-bold text-gray-800">{formatCurrency(invoice.totalUSD, 'USD')}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-500">Abonado:</span><span className="font-bold text-green-600">{formatCurrency(invoice.paidAmountUSD, 'USD')}</span></div>
                                    <div className="w-full h-px bg-gray-200 my-1"></div>
                                    <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-400 uppercase">Resta</span><span className={`text-lg font-black ${isPaid ? 'text-gray-400' : 'text-red-600'}`}>{formatCurrency(debt, 'USD')}</span></div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => openDetailModal(invoice)} className="flex-1 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition flex items-center justify-center gap-2 text-xs"><Edit size={14} /> Editar / Detalles</button>
                                {!isPaid && <button onClick={() => openPaymentModal(invoice)} className="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition flex items-center justify-center gap-2 text-xs shadow-md shadow-red-100"><Wallet size={14} /> Abonar</button>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL 1: REGISTRAR PAGO (CON BOTÓN DE ABONO TOTAL) */}
            {isPaymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center"><h3 className="font-bold text-gray-800">Registrar Abono</h3><button onClick={() => setIsPaymentModalOpen(false)}><X size={20} className="text-gray-400 hover:text-red-500" /></button></div>
                        <form onSubmit={handleRegisterPayment} className="p-6 space-y-4">
                            <div className="bg-red-50 p-4 rounded-xl text-center border border-red-100"><p className="text-xs text-red-400 uppercase font-bold mb-1">Deuda Pendiente</p><p className="text-3xl font-black text-red-600">{formatCurrency(selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD, 'USD')}</p></div>

                            {/* CAMPO MONTO CON BOTÓN DE "PAGAR TOTAL" */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Monto ($)</label>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentAmount((selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD).toFixed(2))}
                                        className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-bold hover:bg-blue-100 transition flex items-center gap-1"
                                    >
                                        <Zap size={10} fill="currentColor" /> PAGAR TOTAL
                                    </button>
                                </div>
                                <input type="number" step="0.01" autoFocus required className="w-full text-lg font-bold border-2 border-gray-200 rounded-xl p-3 focus:border-green-500 outline-none" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                            </div>

                            <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Método</label><select className="w-full border-2 border-gray-200 rounded-xl p-3 bg-white" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}</select></div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nota (Opcional)</label><input className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm" placeholder="Ref. bancaria..." value={paymentNote} onChange={e => setPaymentNote(e.target.value)} /></div>
                            <button type="submit" className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 mt-2">CONFIRMAR PAGO</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: VER / EDITAR DETALLES */}
            {isDetailModalOpen && editingInvoice && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                            <div><h3 className="font-bold text-xl text-gray-800 flex items-center gap-2"><FileText className="text-blue-600" /> Editar Factura</h3><p className="text-xs text-gray-500 mt-1">Los cambios en productos ajustarán el stock automáticamente.</p></div>
                            <button onClick={() => setIsDetailModalOpen(false)} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100">
                                <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2 text-sm uppercase"><Edit size={14} /> Cabecera</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div><label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label><input className="w-full border rounded-lg p-2 font-bold bg-white" value={editingInvoice.supplier} onChange={e => setEditingInvoice({ ...editingInvoice, supplier: e.target.value })} /></div>
                                    <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nº Factura</label><input className="w-full border rounded-lg p-2 font-mono bg-white" value={editingInvoice.number} onChange={e => setEditingInvoice({ ...editingInvoice, number: e.target.value })} /></div>
                                    <div><label className="text-[10px] font-bold text-red-500 uppercase">Vencimiento</label><input type="date" className="w-full border rounded-lg p-2 bg-white border-red-200" value={editingInvoice.dateDue} onChange={e => setEditingInvoice({ ...editingInvoice, dateDue: e.target.value })} /></div>
                                    <div><label className="text-[10px] font-bold text-gray-500 uppercase">Flete Global ($)</label><input type="number" className="w-full border rounded-lg p-2 bg-white" value={editingInvoice.freightTotalUSD} onChange={e => { const val = parseFloat(e.target.value) || 0; setEditingInvoice({ ...editingInvoice, freightTotalUSD: val }); recalculateTotals(editingInvoice.items, val); }} /></div>
                                </div>
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm uppercase"><Truck size={14} /> Productos (Ajuste de Inventario)</h4>
                                <div className="border rounded-xl overflow-hidden bg-gray-50">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-100 text-xs text-gray-500 font-bold uppercase"><tr><th className="p-3 text-left">SKU</th><th className="p-3 text-left">Producto</th><th className="p-3 text-center w-24">Cant.</th><th className="p-3 text-right w-32">Costo U.</th><th className="p-3 text-right">Subtotal</th><th className="p-3 text-center"></th></tr></thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {editingInvoice.items.map((item, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition">
                                                    <td className="p-3 text-xs font-mono text-gray-400">{item.sku}</td>
                                                    <td className="p-3"><input className="w-full border-none bg-transparent font-medium text-gray-700 outline-none focus:ring-1 rounded" value={item.name} onChange={e => handleItemChange(i, 'name', e.target.value)} /></td>
                                                    <td className="p-3"><input type="number" className="w-full border border-gray-200 rounded p-1 text-center font-bold" value={item.quantity} onChange={e => handleItemChange(i, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                                                    <td className="p-3"><input type="number" className="w-full border border-gray-200 rounded p-1 text-right" value={item.costUnitUSD} onChange={e => handleItemChange(i, 'costUnitUSD', parseFloat(e.target.value) || 0)} /></td>
                                                    <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(item.quantity * item.costUnitUSD, 'USD')}</td>
                                                    <td className="p-3 text-center"><button onClick={() => handleRemoveItem(i)} className="text-gray-300 hover:text-red-500"><Trash2 size={16} /></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-end mt-4 gap-6 text-sm items-center"><p className="text-gray-500">Subtotal: <span className="font-bold text-gray-800">{formatCurrency(editingInvoice.subtotalUSD, 'USD')}</span></p><p className="text-gray-500">+ Flete: <span className="font-bold text-gray-800">{formatCurrency(editingInvoice.freightTotalUSD, 'USD')}</span></p><p className="text-xl font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">{formatCurrency(editingInvoice.totalUSD, 'USD')}</p></div>
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm uppercase"><History size={14} /> Pagos Realizados</h4>
                                {editingInvoice.payments.length === 0 ? <p className="text-sm text-gray-400 italic">Sin pagos.</p> : (
                                    <table className="w-full text-sm border rounded-xl overflow-hidden">
                                        <thead className="bg-gray-100 text-xs text-gray-500 font-bold uppercase"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Método</th><th className="p-2 text-right">Monto</th><th className="p-2 text-center"></th></tr></thead>
                                        <tbody className="bg-white">{editingInvoice.payments.map((p, i) => (<tr key={i}><td className="p-2 text-gray-500">{new Date(p.date).toLocaleDateString()}</td><td className="p-2 font-bold">{p.method}</td><td className="p-2 text-right font-bold text-green-600">{formatCurrency(p.amountUSD, 'USD')}</td><td className="p-2 text-center"><button onClick={() => handleDeletePayment(i)} className="text-red-300 hover:text-red-600"><Trash2 size={14} /></button></td></tr>))}</tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                        <div className="p-5 border-t bg-white flex justify-between items-center">
                            <div className="text-xs text-gray-400 italic flex items-center gap-1"><RefreshCw size={12} /> Al guardar, el stock se recalcula.</div>
                            <div className="flex gap-3"><button onClick={() => setIsDetailModalOpen(false)} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition">Cancelar</button><button onClick={handleSaveDetail} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition flex items-center gap-2 transform active:scale-95"><Save size={20} /> Guardar Todo</button></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};