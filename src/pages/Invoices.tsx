import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    FileText, Calendar, DollarSign, AlertCircle, CheckCircle,
    Clock, TrendingDown, Eye, Users, List, Building2
} from 'lucide-react';
import type { Invoice } from '../types';

export const Invoices = () => {
    const { invoices, registerPayment } = useStore();
    const [activeTab, setActiveTab] = useState<'all' | 'suppliers'>('all');
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);
    const pendingInvoicesCount = invoices.filter(i => i.status !== 'PAID').length;

    const suppliersSummary = invoices.reduce((acc, inv) => {
        if (!acc[inv.supplier]) {
            acc[inv.supplier] = { name: inv.supplier, totalDebt: 0, invoicesCount: 0 };
        }
        acc[inv.supplier].totalDebt += (inv.totalUSD - inv.paidAmountUSD);
        if (inv.status !== 'PAID') acc[inv.supplier].invoicesCount += 1;
        return acc;
    }, {} as Record<string, { name: string, totalDebt: number, invoicesCount: number }>);

    const handleOpenPayment = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsPaymentModalOpen(true);
        setPaymentAmount('');
    };

    const handleSubmitPayment = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInvoice || !paymentAmount) return;
        const amount = parseFloat(paymentAmount);
        if (amount <= 0) return;
        if (amount > (selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD)) { alert("Monto mayor a deuda."); return; }

        registerPayment(selectedInvoice.id, {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            amountUSD: amount,
            method: paymentMethod,
            note: 'Abono manual'
        });
        setIsPaymentModalOpen(false);
    };

    return (
        <div className="p-8 space-y-6 ml-64 bg-gray-50 min-h-screen">

            <div className="flex justify-between items-start">
                <div><h2 className="text-2xl font-bold text-gray-800">Cuentas por Pagar</h2><p className="text-gray-500">Gestión de facturas y pagos</p></div>
                <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                    <button onClick={() => setActiveTab('all')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'all' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}><List size={18} /> Facturas</button>
                    <button onClick={() => setActiveTab('suppliers')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'suppliers' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Users size={18} /> Por Proveedor</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-3 bg-red-100 text-red-600 rounded-lg"><TrendingDown size={24} /></div><div><p className="text-sm text-gray-500">Deuda Total Pendiente</p><h3 className="text-2xl font-bold text-gray-900">{formatCurrency(totalDebt, 'USD')}</h3></div></div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4"><div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Clock size={24} /></div><div><p className="text-sm text-gray-500">Facturas Pendientes</p><h3 className="text-2xl font-bold text-gray-900">{pendingInvoicesCount}</h3></div></div>
            </div>

            {activeTab === 'all' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500"><tr><th className="px-6 py-4">Proveedor / Factura</th><th className="px-6 py-4">Vencimiento</th><th className="px-6 py-4 text-right">Total</th><th className="px-6 py-4 text-center">Estado</th><th className="px-6 py-4 text-right">Pendiente</th><th className="px-6 py-4 text-center">Acciones</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoices.length === 0 ? (<tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin facturas.</td></tr>) : invoices.map((invoice) => {
                                const percentagePaid = (invoice.paidAmountUSD / invoice.totalUSD) * 100;
                                const pending = invoice.totalUSD - invoice.paidAmountUSD;
                                const isPaid = invoice.status === 'PAID';
                                return (
                                    <tr key={invoice.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4"><p className="font-bold text-gray-800">{invoice.supplier}</p><div className="flex items-center gap-1 text-xs text-gray-400 font-mono mt-1"><FileText size={12} /> {invoice.number}</div></td>
                                        <td className="px-6 py-4 text-xs"><span className="text-red-500 font-medium flex items-center gap-1"><Clock size={12} /> {invoice.dateDue}</span></td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-800">{formatCurrency(invoice.totalUSD, 'USD')}</td>
                                        <td className="px-6 py-4"><div className="flex items-center justify-center gap-2 mb-1">{isPaid ? (<span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full"><CheckCircle size={12} /> PAGADO</span>) : (<span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded-full"><AlertCircle size={12} /> PENDIENTE</span>)}</div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${isPaid ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${percentagePaid}%` }}></div></div></td>
                                        <td className="px-6 py-4 text-right"><span className={`font-bold ${pending <= 0.01 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(pending, 'USD')}</span></td>
                                        <td className="px-6 py-4 text-center"><div className="flex justify-center gap-2">{!isPaid && (<button onClick={() => handleOpenPayment(invoice)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition" title="Registrar Abono"><DollarSign size={18} /></button>)}<button className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition" onClick={() => alert(`Items: ${invoice.items.length}`)}><Eye size={18} /></button></div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'suppliers' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.values(suppliersSummary).map((sup, index) => (
                        <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-40">
                            <div>
                                <div className="flex items-center gap-2 mb-2"><Building2 size={20} className="text-gray-400" /><h3 className="font-bold text-gray-800 text-lg truncate">{sup.name}</h3></div>
                                <p className="text-xs text-gray-500">{sup.invoicesCount} facturas pendientes de pago</p>
                            </div>
                            <div className="flex justify-between items-end border-t pt-4 border-gray-50"><span className="text-xs font-bold text-gray-400 uppercase">Deuda Total</span><span className={`text-2xl font-bold ${sup.totalDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(sup.totalDebt, 'USD')}</span></div>
                        </div>
                    ))}
                    {Object.keys(suppliersSummary).length === 0 && (<p className="col-span-3 text-center text-gray-400 py-10">No hay proveedores con movimientos.</p>)}
                </div>
            )}

            {isPaymentModalOpen && selectedInvoice && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2"><DollarSign className="text-green-600" /> Registrar Abono</h3>
                        <div className="mb-4 text-sm bg-gray-50 p-4 rounded-lg border border-gray-100">
                            <p className="text-gray-500">Factura: <span className="font-bold text-gray-800">{selectedInvoice.number}</span></p>
                            <div className="mt-2 flex justify-between font-bold"><span>Pendiente:</span><span className="text-red-600">{formatCurrency(selectedInvoice.totalUSD - selectedInvoice.paidAmountUSD, 'USD')}</span></div>
                        </div>
                        <form onSubmit={handleSubmitPayment} className="space-y-4">
                            <div><label className="block text-sm font-medium mb-1">Monto a Abonar ($)</label><input type="number" step="0.01" required autoFocus className="w-full border p-2 rounded-lg text-lg font-bold text-green-700" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></div>
                            <div><label className="block text-sm font-medium mb-1">Método de Pago</label><select className="w-full border p-2 rounded-lg bg-white" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>Transferencia</option><option>Efectivo</option><option>Zelle</option></select></div>
                            <div className="flex justify-end gap-3 mt-6"><button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button><button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold">Confirmar Pago</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};