import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    FileText, DollarSign, AlertCircle, CheckCircle,
    Clock, TrendingDown, Eye, Users, List,
    Save, X, Trash2, Edit, History, Truck, Building2, Briefcase, BarChart3
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { Invoice, Payment, IncomingItem } from '../types';

export const Invoices = () => {
    const { invoices, registerPayment, updateInvoice, paymentMethods } = useStore();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState<'all' | 'suppliers'>('all');

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
            const targetInvoice = invoices.find(inv => inv.id === location.state.openInvoiceId);
            if (targetInvoice) {
                setEditingInvoice(JSON.parse(JSON.stringify(targetInvoice)));
                setIsDetailModalOpen(true);
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state, invoices]);

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);
    const pendingInvoicesCount = invoices.filter(i => i.status !== 'PAID').length;

    // --- LÓGICA DE RESUMEN POR PROVEEDOR ---
    const suppliersSummary = useMemo(() => {
        const summary: Record<string, { name: string, totalDebt: number, totalInvoices: number, pendingCount: number, totalPurchased: number }> = {};

        invoices.forEach(inv => {
            const debt = inv.totalUSD - inv.paidAmountUSD;
            if (!summary[inv.supplier]) {
                summary[inv.supplier] = {
                    name: inv.supplier,
                    totalDebt: 0,
                    totalInvoices: 0,
                    pendingCount: 0,
                    totalPurchased: 0
                };
            }

            summary[inv.supplier].totalInvoices += 1;
            summary[inv.supplier].totalPurchased += inv.totalUSD;

            if (inv.status !== 'PAID' && debt > 0.01) {
                summary[inv.supplier].totalDebt += debt;
                summary[inv.supplier].pendingCount += 1;
            }
        });

        // Ordenar por mayor deuda primero
        return Object.values(summary).sort((a, b) => b.totalDebt - a.totalDebt);
    }, [invoices]);

    // --- MANEJADORES ---
    const handleOpenPayment = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setPaymentAmount((invoice.totalUSD - invoice.paidAmountUSD).toFixed(2));
        setPaymentNote('');
        setIsPaymentModalOpen(true);
    };

    const handleOpenDetail = (invoice: Invoice) => {
        setEditingInvoice(JSON.parse(JSON.stringify(invoice)));
        setIsDetailModalOpen(true);
    };

    const handleSaveDetail = () => {
        if (editingInvoice) {
            const newTotal = editingInvoice.totalUSD;
            const paid = editingInvoice.paidAmountUSD;
            let newStatus = editingInvoice.status;
            if (paid >= newTotal - 0.01) newStatus = 'PAID';
            else if (paid > 0) newStatus = 'PARTIAL';
            else newStatus = 'PENDING';

            updateInvoice({ ...editingInvoice, status: newStatus });
            setIsDetailModalOpen(false);
            setEditingInvoice(null);
            alert("✅ Factura actualizada.");
        }
    };

    const handleDeleteItem = (index: number) => {
        if (!editingInvoice) return;
        if (!window.confirm("¿Eliminar este ítem?")) return;
        const newItems = editingInvoice.items.filter((_, i) => i !== index);
        recalculateInvoice(newItems, editingInvoice.freightTotalUSD);
    };

    const handleDeletePayment = (index: number) => {
        if (!editingInvoice) return;
        if (!window.confirm("¿Eliminar este abono? La deuda aumentará.")) return;
        const newPayments = editingInvoice.payments.filter((_, i) => i !== index);
        const newPaidAmount = newPayments.reduce((acc, p) => acc + p.amountUSD, 0);
        setEditingInvoice({ ...editingInvoice, payments: newPayments, paidAmountUSD: newPaidAmount });
    };

    const handleUpdateItem = (index: number, field: keyof IncomingItem, value: any) => {
        if (!editingInvoice) return;
        const newItems = [...editingInvoice.items];
        newItems[index] = { ...newItems[index], [field]: value };
        recalculateInvoice(newItems, editingInvoice.freightTotalUSD);
    };

    const recalculateInvoice = (items: IncomingItem[], freight: number) => {
        if (!editingInvoice) return;
        const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.costUnitUSD), 0);
        const total = subtotal + freight;
        setEditingInvoice({ ...editingInvoice, items, subtotalUSD: subtotal, freightTotalUSD: freight, totalUSD: total });
    };

    const handleSubmitPayment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice || !paymentAmount) return;
        const amount = parseFloat(paymentAmount);
        const pending = selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD;

        if (amount <= 0) return alert("Monto inválido");
        if (amount > (pending + 0.01)) return alert(`Excede deuda ($${pending.toFixed(2)})`);

        const newPayment: Payment = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            amountUSD: amount,
            method: paymentMethod,
            note: paymentNote || 'Abono manual'
        };

        registerPayment(selectedInvoice.id, newPayment);
        setIsPaymentModalOpen(false);
        alert("✅ Abono registrado.");
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div><h2 className="text-2xl font-bold text-gray-800">Cuentas por Pagar</h2><p className="text-gray-500">Gestión de facturas y deudas</p></div>
                <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm w-full md:w-auto">
                    <button onClick={() => setActiveTab('all')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'all' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}><List size={18} /> Facturas</button>
                    <button onClick={() => setActiveTab('suppliers')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition ${activeTab === 'suppliers' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Users size={18} /> Proveedores</button>
                </div>
            </div>

            {/* TARJETAS RESUMEN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-lg"><TrendingDown size={24} /></div><div><p className="text-sm text-gray-500">Deuda Total Global</p><h3 className="text-2xl font-bold text-gray-900">{formatCurrency(totalDebt, 'USD')}</h3></div></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Clock size={24} /></div><div><p className="text-sm text-gray-500">Facturas Pendientes</p><h3 className="text-2xl font-bold text-gray-900">{pendingInvoicesCount}</h3></div></div>
            </div>

            {/* VISTA 1: LISTA DE FACTURAS */}
            {activeTab === 'all' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-600">
                            <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500"><tr><th className="px-6 py-4">Proveedor / Factura</th><th className="px-6 py-4">Vencimiento</th><th className="px-6 py-4 text-right">Total</th><th className="px-6 py-4 text-center">Estado</th><th className="px-6 py-4 text-right">Pendiente</th><th className="px-6 py-4 text-center">Acciones</th></tr></thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoices.length === 0 ? (<tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin facturas registradas.</td></tr>) : invoices.map((invoice) => {
                                    const percentagePaid = (invoice.paidAmountUSD / invoice.totalUSD) * 100;
                                    const pending = invoice.totalUSD - invoice.paidAmountUSD;
                                    const isPaid = invoice.status === 'PAID';

                                    return (
                                        <tr key={invoice.id} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4"><p className="font-bold text-gray-800">{invoice.supplier}</p><div className="flex items-center gap-1 text-xs text-gray-400 font-mono mt-1"><FileText size={12} /> {invoice.number}</div></td>
                                            <td className="px-6 py-4 text-xs"><span className={`font-medium flex items-center gap-1 ${new Date(invoice.dateDue) < new Date() && !isPaid ? 'text-red-600 font-bold' : 'text-gray-500'}`}><Clock size={12} /> {formatDate(invoice.dateDue)}</span></td>
                                            <td className="px-6 py-4 text-right font-bold text-gray-800">{formatCurrency(invoice.totalUSD, 'USD')}</td>
                                            <td className="px-6 py-4"><div className="flex items-center justify-center gap-2 mb-1">{isPaid ? (<span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full"><CheckCircle size={12} /> PAGADO</span>) : (<span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full"><AlertCircle size={12} /> PENDIENTE</span>)}</div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${isPaid ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${Math.min(percentagePaid, 100)}%` }}></div></div></td>
                                            <td className="px-6 py-4 text-right"><span className={`font-bold ${pending <= 0.01 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(pending, 'USD')}</span></td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    {!isPaid && (<button onClick={() => handleOpenPayment(invoice)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm" title="Abonar"><DollarSign size={18} /></button>)}
                                                    <button onClick={() => handleOpenDetail(invoice)} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition shadow-sm" title="Editar"><Edit size={18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* VISTA 2: RESUMEN POR PROVEEDORES (NUEVO) */}
            {activeTab === 'suppliers' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {suppliersSummary.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-400">No hay proveedores con movimientos.</div>
                    ) : (
                        suppliersSummary.map((sup, idx) => (
                            <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between hover:shadow-md transition">
                                <div>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Building2 size={24} /></div>
                                        {sup.totalDebt > 0.01 ? (
                                            <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><AlertCircle size={12} /> Deudor</span>
                                        ) : (
                                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle size={12} /> Solvente</span>
                                        )}
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-1">{sup.name}</h3>
                                    <div className="h-px bg-gray-100 my-4"></div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 flex items-center gap-2"><Briefcase size={14} /> Facturas Abiertas</span>
                                            <span className="font-bold text-gray-800">{sup.pendingCount} <span className="text-gray-400 text-xs font-normal">/ {sup.totalInvoices}</span></span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-500 flex items-center gap-2"><BarChart3 size={14} /> Total Comprado</span>
                                            <span className="font-bold text-gray-800">{formatCurrency(sup.totalPurchased, 'USD')}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-dashed border-gray-200">
                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Deuda Pendiente</p>
                                    <p className={`text-2xl font-black ${sup.totalDebt > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                                        {formatCurrency(sup.totalDebt, 'USD')}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* --- MODAL 1: ABONAR --- */}
            {isPaymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-blue-600 p-4 text-white">
                            <h3 className="text-lg font-bold flex items-center gap-2"><DollarSign size={20} /> Registrar Pago</h3>
                            <p className="text-blue-100 text-sm">{selectedInvoice.supplier} - Fac: {selectedInvoice.number}</p>
                        </div>

                        <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                                <p className="text-xs text-gray-500 uppercase font-bold">Monto Pendiente</p>
                                <p className="text-3xl font-black text-gray-800">{formatCurrency(selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD, 'USD')}</p>
                            </div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">Monto a Abonar ($)</label><input type="number" step="0.01" required className="w-full border-2 border-blue-100 rounded-xl p-3 text-xl font-bold text-gray-800 outline-none focus:border-blue-500" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">Método</label><select className="w-full border rounded-xl p-3 bg-white" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}</select></div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">Nota</label><input type="text" className="w-full border rounded-xl p-3 text-sm" placeholder="Referencia..." value={paymentNote} onChange={e => setPaymentNote(e.target.value)} /></div>
                            <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button><button type="submit" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"><CheckCircle size={18} /> Confirmar</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- MODAL 2: DETALLE FACTURA --- */}
            {isDetailModalOpen && editingInvoice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-2 md:p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-5 border-b bg-gray-50 flex justify-between items-center"><div><h3 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Edit size={20} className="text-blue-600" /> Editar Factura</h3><p className="text-xs text-gray-500 font-mono">ID: {editingInvoice.id}</p></div><button onClick={() => setIsDetailModalOpen(false)} className="text-gray-400 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><X size={20} /></button></div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div className="md:col-span-2"><label className="text-[10px] font-bold text-gray-500">Proveedor</label><input className="w-full border rounded-lg p-2 font-bold bg-white" value={editingInvoice.supplier} onChange={e => setEditingInvoice({ ...editingInvoice, supplier: e.target.value })} /></div>
                                <div><label className="text-[10px] font-bold text-gray-500">Nº Factura</label><input className="w-full border rounded-lg p-2 font-bold bg-white" value={editingInvoice.number} onChange={e => setEditingInvoice({ ...editingInvoice, number: e.target.value })} /></div>
                                <div><label className="text-[10px] font-bold text-gray-500 text-red-600">Vencimiento</label><input type="date" className="w-full border rounded-lg p-2 font-bold bg-white border-red-200" value={editingInvoice.dateDue} onChange={e => setEditingInvoice({ ...editingInvoice, dateDue: e.target.value })} /></div>
                            </div>
                            <div className="border rounded-xl overflow-hidden">
                                <div className="bg-gray-100 p-3 text-xs font-bold text-gray-600 border-b flex justify-between"><span>DETALLE ÍTEMS</span><span className="text-orange-500">⚠ Edita con precaución</span></div>
                                <div className="max-h-60 overflow-y-auto custom-scrollbar"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-400 uppercase sticky top-0"><tr><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Desc</th><th className="p-2 text-center">Cant</th><th className="p-2 text-right">Costo</th><th className="p-2 text-right">Total</th><th className="p-2"></th></tr></thead><tbody className="divide-y">{editingInvoice.items.map((item, i) => (<tr key={i}><td className="p-2 font-mono text-xs text-gray-500">{item.sku}</td><td className="p-2"><input className="w-full border rounded p-1 text-xs" value={item.name} onChange={e => handleUpdateItem(i, 'name', e.target.value)} /></td><td className="p-2 text-center"><input type="number" className="w-16 border rounded p-1 text-center font-bold" value={item.quantity} onChange={e => handleUpdateItem(i, 'quantity', parseFloat(e.target.value) || 0)} /></td><td className="p-2 text-right"><input type="number" step="0.01" className="w-20 border rounded p-1 text-right" value={item.costUnitUSD} onChange={e => handleUpdateItem(i, 'costUnitUSD', parseFloat(e.target.value) || 0)} /></td><td className="p-2 text-right font-bold">{formatCurrency(item.costUnitUSD * item.quantity, 'USD')}</td><td className="p-2 text-center"><button onClick={() => handleDeleteItem(i)} className="text-red-300 hover:text-red-600 p-1"><Trash2 size={16} /></button></td></tr>))}</tbody></table></div>
                                <div className="bg-gray-50 p-3 flex justify-end items-center gap-3 border-t"><div className="flex items-center gap-2 text-sm text-gray-600"><Truck size={16} /> Flete: <input type="number" className="w-20 border rounded p-1 font-bold" value={editingInvoice.freightTotalUSD} onChange={e => recalculateInvoice(editingInvoice.items, parseFloat(e.target.value) || 0)} /></div><div className="text-right ml-4"><p className="text-xs text-gray-500 uppercase font-bold">Nuevo Total</p><p className="text-xl font-black text-gray-900">{formatCurrency(editingInvoice.totalUSD, 'USD')}</p></div></div>
                            </div>
                            <div className="border rounded-xl overflow-hidden">
                                <div className="bg-blue-50 p-3 text-xs font-bold text-blue-700 border-b flex items-center gap-2"><History size={14} /> PAGOS REGISTRADOS</div>
                                {editingInvoice.payments.length === 0 ? (<p className="p-4 text-center text-gray-400 text-sm italic">No hay pagos.</p>) : (<table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-400 uppercase"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Método</th><th className="p-2 text-left">Nota</th><th className="p-2 text-right">Monto</th><th className="p-2"></th></tr></thead><tbody className="divide-y">{editingInvoice.payments.map((pay, i) => (<tr key={i}><td className="p-2 text-gray-500">{new Date(pay.date).toLocaleDateString()}</td><td className="p-2 font-bold text-gray-700">{pay.method}</td><td className="p-2 text-gray-500 italic text-xs">{pay.note}</td><td className="p-2 text-right font-bold text-green-600">{formatCurrency(pay.amountUSD, 'USD')}</td><td className="p-2 text-center"><button onClick={() => handleDeletePayment(i)} className="text-red-300 hover:text-red-600 p-1"><Trash2 size={16} /></button></td></tr>))}</tbody></table>)}
                                <div className="bg-gray-50 p-3 text-right border-t"><span className="text-xs text-gray-500 mr-2">Pagado: {formatCurrency(editingInvoice.paidAmountUSD, 'USD')}</span><span className={`font-bold ${editingInvoice.totalUSD - editingInvoice.paidAmountUSD > 0.01 ? 'text-red-600' : 'text-green-600'}`}>Resta: {formatCurrency(editingInvoice.totalUSD - editingInvoice.paidAmountUSD, 'USD')}</span></div>
                            </div>
                        </div>
                        <div className="p-5 border-t bg-white flex justify-end gap-3"><button onClick={() => setIsDetailModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button><button onClick={handleSaveDetail} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-md flex items-center gap-2"><Save size={18} /> Guardar Cambios</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};