import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { printInvoice, printSalesList } from '../utils/ticketGenerator';
import {
    FileText, Calendar, Package, Edit, Trash2,
    Search, Ban, Printer, Eye, Filter, X, Save
} from 'lucide-react';
import type { Sale } from '../types';

export const Sales = () => {
    const { sales, updateSale, annulSale } = useStore();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const formatDate = (isoString: string) => new Date(isoString).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const filteredSales = sales.filter(sale => {
        const saleDate = new Date(sale.date);
        const matchSearch = sale.id.toLowerCase().includes(searchTerm.toLowerCase()) || formatDate(sale.date).includes(searchTerm);
        let matchDate = true;
        if (startDate) { const start = new Date(startDate); start.setHours(0, 0, 0, 0); if (saleDate < start) matchDate = false; }
        if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); if (saleDate > end) matchDate = false; }
        return matchSearch && matchDate;
    });

    const sortedSales = [...filteredSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const totalSalesUSD = sortedSales.filter(s => s.status !== 'CANCELLED').reduce((acc, sale) => acc + sale.totalUSD, 0);

    // Manejadores
    const handleEditClick = (sale: Sale) => { setEditingSale(JSON.parse(JSON.stringify(sale))); setIsEditModalOpen(true); };

    const handleSaveChanges = () => {
        if (editingSale) {
            // Recalcular total antes de guardar por seguridad
            const newTotal = editingSale.items.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
            editingSale.totalUSD = newTotal;

            if (updateSale(editingSale)) {
                setIsEditModalOpen(false);
                setEditingSale(null);
                alert("✅ Venta actualizada.");
            }
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div><h2 className="text-2xl font-bold text-gray-800">Historial de Ventas</h2><p className="text-gray-500">Registro detallado de transacciones</p></div>
                <div className="flex flex-wrap gap-2 md:gap-4 w-full md:w-auto">
                    <button onClick={() => printSalesList(sortedSales, startDate, endDate)} className="flex-1 md:flex-none px-4 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black flex items-center justify-center gap-2 shadow-lg"><Printer size={20} /> Reporte</button>
                    <div className="flex-1 md:flex-none bg-white px-6 py-3 rounded-xl shadow-sm border border-gray-100 text-center md:text-right"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Filtrado</p><p className="text-xl font-bold text-green-600">{formatCurrency(totalSalesUSD, 'USD')}</p></div>
                </div>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4">
                <div className="w-full md:flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-auto flex items-center gap-2 border-t md:border-t-0 md:border-l pt-3 md:pt-0 pl-0 md:pl-4 border-gray-200 overflow-x-auto">
                    <span className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap"><Filter size={12} className="inline" /> Fecha:</span>
                    <input type="date" className="border rounded-lg px-2 py-2 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span>-</span>
                    <input type="date" className="border rounded-lg px-2 py-2 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
            </div>

            {/* TABLA PRINCIPAL */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Ticket</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4 hidden md:table-cell">Método</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Total</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedSales.length === 0 ? (<tr><td colSpan={6} className="text-center py-10 text-gray-400">Sin ventas.</td></tr>) : sortedSales.map((sale) => {
                                const isCancelled = sale.status === 'CANCELLED';
                                return (
                                    <tr key={sale.id} className={`hover:bg-gray-50 transition ${isCancelled ? 'bg-red-50/50' : ''}`}>
                                        <td className="px-6 py-4 font-mono text-xs font-bold">#{sale.id.slice(-6)}</td>
                                        <td className="px-6 py-4 text-xs">{formatDate(sale.date)}</td>
                                        <td className="px-6 py-4 text-xs font-bold hidden md:table-cell">{sale.paymentMethod || 'Efectivo'}</td>
                                        <td className="px-6 py-4">{isCancelled ? <span className="text-red-600 font-bold text-xs">ANULADA</span> : <span className="text-green-600 font-bold text-xs">OK</span>}</td>
                                        <td className="px-6 py-4 text-right font-bold">{formatCurrency(sale.totalUSD, 'USD')}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => handleEditClick(sale)} className="p-2 text-blue-600 bg-blue-50 rounded-lg" title="Ver / Editar"><Eye size={18} /></button>
                                                {!isCancelled && (<button onClick={() => annulSale(sale.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg" title="Anular"><Ban size={18} /></button>)}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- MODAL DE EDICIÓN (AHORA SÍ CON INPUTS) --- */}
            {isEditModalOpen && editingSale && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[90vh]">

                        {/* Header Modal */}
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Edit size={18} className="text-blue-600" /> Editar Ticket #{editingSale.id.slice(-6)}</h3>
                                <p className="text-xs text-gray-500">{new Date(editingSale.date).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
                        </div>

                        {/* Cuerpo Editable */}
                        <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase text-gray-500 bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="p-2 text-center">Cant</th>
                                        <th className="p-2 text-left">Descripción</th>
                                        <th className="p-2 text-right">Precio U. ($)</th>
                                        <th className="p-2 text-right">Subtotal</th>
                                        <th className="p-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {editingSale.items.map((item, idx) => (
                                        <tr key={idx}>
                                            {/* INPUT CANTIDAD */}
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    className="w-16 border rounded text-center font-bold p-1 bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                                                    value={item.quantity}
                                                    onChange={e => { const n = [...editingSale.items]; n[idx].quantity = parseFloat(e.target.value) || 0; setEditingSale({ ...editingSale, items: n }); }}
                                                />
                                            </td>
                                            {/* INPUT NOMBRE */}
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    className="w-full border rounded p-1 text-gray-700 focus:ring-2 focus:ring-blue-200 outline-none"
                                                    value={item.name}
                                                    onChange={e => { const n = [...editingSale.items]; n[idx].name = e.target.value; setEditingSale({ ...editingSale, items: n }); }}
                                                />
                                            </td>
                                            {/* INPUT PRECIO */}
                                            <td className="p-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="w-20 border rounded text-right p-1 font-mono text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none float-right"
                                                    value={item.priceFinalUSD}
                                                    onChange={e => { const n = [...editingSale.items]; n[idx].priceFinalUSD = parseFloat(e.target.value) || 0; setEditingSale({ ...editingSale, items: n }); }}
                                                />
                                            </td>
                                            {/* SUBTOTAL (Calculado) */}
                                            <td className="p-2 text-right font-bold text-gray-800">
                                                {formatCurrency(item.priceFinalUSD * item.quantity, 'USD')}
                                            </td>
                                            {/* BOTÓN ELIMINAR */}
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => { const n = editingSale.items.filter((_, i) => i !== idx); setEditingSale({ ...editingSale, items: n }); }}
                                                    className="text-red-300 hover:text-red-600 p-1 transition"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="flex justify-between items-center border-t pt-4 mt-4">
                                <div className="text-xs text-orange-500 font-bold bg-orange-50 px-3 py-1 rounded-full">
                                    ⚠ Modificar cantidades ajustará el stock.
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase font-bold">Nuevo Total</p>
                                    <p className="text-2xl font-black text-gray-900">
                                        {formatCurrency(editingSale.items.reduce((a, b) => a + (b.quantity * b.priceFinalUSD), 0), 'USD')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer Botones */}
                        <div className="p-4 bg-gray-100 flex justify-between items-center border-t border-gray-200">
                            <button
                                onClick={() => printInvoice(editingSale)}
                                className="bg-gray-800 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-md hover:bg-black transition"
                            >
                                <Printer size={16} /> Ticket
                            </button>

                            {!editingSale.status?.includes('CANCELLED') && (
                                <button
                                    onClick={handleSaveChanges}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-blue-700 transition"
                                >
                                    <Save size={18} /> Guardar Cambios
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};