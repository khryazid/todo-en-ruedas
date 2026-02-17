/**
 * @file Sales.tsx
 * @description Historial de Ventas.
 * Permite auditar operaciones, anular ventas, borrar ventas de prueba, reimprimir tickets y ENVIAR POR WHATSAPP.
 */

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { usePermissions } from '../hooks/usePermissions';
import { formatCurrency } from '../utils/pricing';
import { printInvoice, printSalesList, sendToWhatsApp } from '../utils/ticketGenerator';
import {
    Eye, Search, Printer, Ban,
    X, ShoppingBag, User, Phone, MapPin, MessageCircle, Trash2
} from 'lucide-react';
import type { Sale } from '../types';

export const Sales = () => {
    const { sales, clients, annulSale, deleteSale } = useStore(); // <--- AÑADIDO deleteSale
    const { isAdmin, isManager } = usePermissions(); // <--- NUEVO: Hook de permisos

    // Estados de Filtros y Selección
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

    // Helper para obtener cliente
    const getClient = (clientId?: string) => clients.find(c => c.id === clientId);

    // --- LÓGICA DE FILTRADO ---
    const filteredSales = sales.filter(sale => {
        // Buscamos el cliente asociado para filtrar por nombre
        const client = getClient(sale.clientId);
        const clientName = client?.name.toLowerCase() || '';

        // Filtramos por ID de venta O por Nombre de Cliente
        const matchTerm = sale.id.toLowerCase().includes(searchTerm.toLowerCase()) || clientName.includes(searchTerm.toLowerCase());

        // Filtro de Fechas
        if (startDate && endDate) {
            const sDate = new Date(sale.date).toISOString().split('T')[0];
            return matchTerm && sDate >= startDate && sDate <= endDate;
        }
        return matchTerm;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handlePrintReport = () => {
        printSalesList(filteredSales, startDate, endDate);
    };

    // --- NUEVA FUNCIÓN DE BORRADO ---
    const handleDelete = (id: string) => {
        if (window.confirm('🚨 ¿Seguro que deseas BORRAR DEFINITIVAMENTE esta venta? \nEsta acción es irreversible y NO restaurará el stock de inventario.')) {
            deleteSale(id);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Historial de Ventas</h2>
                    <p className="text-gray-500 font-medium">Auditoría y control de operaciones</p>
                </div>
                <button
                    onClick={handlePrintReport}
                    className="w-full md:w-auto bg-gray-900 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition shadow-lg active:scale-95"
                >
                    <Printer size={18} /> Imprimir Listado
                </button>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Buscar Ticket o Cliente</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Nº Referencia o Nombre Cliente..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-red-100 font-medium"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex gap-2 w-full lg:w-auto">
                    <div className="flex-1 lg:w-40">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Desde</label>
                        <input type="date" className="w-full py-2.5 px-3 bg-gray-50 rounded-xl text-sm font-bold text-gray-700" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="flex-1 lg:w-40">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Hasta</label>
                        <input type="date" className="w-full py-2.5 px-3 bg-gray-50 rounded-xl text-sm font-bold text-gray-700" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* TABLA PRINCIPAL */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-400">
                            <tr>
                                <th className="px-6 py-4">Fecha / Ticket</th>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4 text-center">Ítems</th>
                                <th className="px-6 py-4">Método</th>
                                <th className="px-6 py-4 text-right">Total ($)</th>
                                <th className="px-6 py-4 text-right">Ref. (Bs)</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-center sticky right-0 bg-gray-50 shadow-[-5px_0_10px_rgba(0,0,0,0.02)]">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredSales.map(sale => {
                                const isCancelled = sale.status === 'CANCELLED';
                                const isPending = sale.status === 'PENDING' || sale.status === 'PARTIAL';
                                const client = getClient(sale.clientId);

                                return (
                                    <tr key={sale.id} className={`hover:bg-gray-50 transition group ${isCancelled ? 'bg-red-50/30' : ''}`}>
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-gray-800">{new Date(sale.date).toLocaleString('es-VE')}</p>
                                            <p className="text-xs text-gray-400 font-mono">#{sale.id.slice(-6)}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {client ? (
                                                <div>
                                                    <p className="font-bold text-blue-900 text-xs uppercase">{client.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono">{client.rif}</p>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">Anónimo / General</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black inline-flex items-center gap-1">
                                                <ShoppingBag size={12} /> {sale.items.length}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-600">{sale.paymentMethod || 'Efectivo'}</td>
                                        <td className="px-6 py-4 text-right font-black text-gray-800 text-base">{formatCurrency(sale.totalUSD, 'USD')}</td>
                                        <td className="px-6 py-4 text-right font-medium text-gray-500">Bs. {sale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-center">
                                            {isCancelled ? (
                                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-red-200"><Ban size={10} /> ANULADA</span>
                                            ) : isPending ? (
                                                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-orange-200">PENDIENTE</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-green-200">COMPLETADA</span>
                                            )}
                                        </td>

                                        {/* ACCIONES (Detalle, Imprimir, Anular, Borrar) */}
                                        <td className="px-6 py-4 text-center sticky right-0 bg-white group-hover:bg-gray-50 transition-colors shadow-[-5px_0_10px_rgba(0,0,0,0.02)]">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => setSelectedSale(sale)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Ver Detalle"><Eye size={18} /></button>
                                                <button onClick={() => printInvoice(sale)} className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition" title="Imprimir"><Printer size={18} /></button>

                                                {/* Solo ADMIN y MANAGER pueden BORRAR ventas */}
                                                {(isAdmin || isManager) && (
                                                    <button
                                                        onClick={() => handleDelete(sale.id)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="Borrar Venta Definitivamente"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredSales.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-gray-400">No se encontraron ventas con estos filtros.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- MODAL DETALLE --- */}
            {selectedSale && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

                        {/* Header Modal */}
                        <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-xl text-gray-800">Detalle de Venta</h3>
                                <p className="text-sm text-gray-500 font-mono">Ticket #{selectedSale.id.slice(-6)} • {new Date(selectedSale.date).toLocaleString('es-VE')}</p>
                            </div>
                            <button onClick={() => setSelectedSale(null)} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition shadow-sm"><X size={20} /></button>
                        </div>

                        {/* Contenido Modal (Scrollable) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">

                            {/* Tarjeta Cliente */}
                            {getClient(selectedSale.clientId) ? (
                                <div className="bg-blue-50 p-4 m-4 rounded-xl border border-blue-100 flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <div className="bg-blue-200 p-3 rounded-full text-blue-700">
                                        <User size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-blue-400 uppercase mb-1">Cliente Registrado</p>
                                        <h4 className="text-lg font-black text-blue-900">{getClient(selectedSale.clientId)?.name}</h4>
                                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-blue-800">
                                            <span className="font-mono bg-white/50 px-2 rounded border border-blue-200">
                                                {getClient(selectedSale.clientId)?.rif}
                                            </span>
                                            {getClient(selectedSale.clientId)?.phone && (
                                                <span className="flex items-center gap-1"><Phone size={14} /> {getClient(selectedSale.clientId)?.phone}</span>
                                            )}
                                            {getClient(selectedSale.clientId)?.address && (
                                                <span className="flex items-center gap-1"><MapPin size={14} /> {getClient(selectedSale.clientId)?.address}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 p-3 m-4 rounded-xl border border-dashed border-gray-200 text-center text-gray-400 text-sm">
                                    Venta a Cliente General / Anónimo
                                </div>
                            )}

                            {/* VISTA MÓVIL */}
                            <div className="md:hidden p-4 space-y-3 pt-0">
                                {selectedSale.items.map((item, i) => (
                                    <div key={i} className="flex justify-between py-3 border-b border-dashed border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-sm font-bold text-gray-800"><span className="text-red-600">{item.quantity}x</span> {item.name}</p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-gray-900">{formatCurrency(item.priceFinalUSD * item.quantity, 'USD')}</p>
                                            <p className="text-[10px] text-gray-400">{formatCurrency(item.priceFinalUSD, 'USD')} c/u</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* VISTA PC */}
                            <div className="hidden md:block">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-100 text-xs uppercase font-bold text-gray-500">
                                        <tr>
                                            <th className="px-6 py-3">Código</th>
                                            <th className="px-6 py-3">Producto</th>
                                            <th className="px-6 py-3 text-center">Cant.</th>
                                            <th className="px-6 py-3 text-right">Precio Unit.</th>
                                            <th className="px-6 py-3 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {selectedSale.items.map((item, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-6 py-3 font-mono text-xs text-gray-500">{item.sku}</td>
                                                <td className="px-6 py-3 font-medium text-gray-700">{item.name}</td>
                                                <td className="px-6 py-3 text-center font-bold">{item.quantity}</td>
                                                <td className="px-6 py-3 text-right text-gray-500">{formatCurrency(item.priceFinalUSD, 'USD')}</td>
                                                <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(item.priceFinalUSD * item.quantity, 'USD')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer Modal con Acciones */}
                        <div className="bg-gray-50 p-5 border-t">
                            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6">
                                <div className="text-sm text-gray-500">
                                    <span className="block">Método: <strong className="text-gray-800">{selectedSale.paymentMethod}</strong></span>
                                    <span className="block">Estado: <strong className={selectedSale.status === 'CANCELLED' ? 'text-red-600' : 'text-green-600'}>{selectedSale.status === 'CANCELLED' ? 'ANULADA' : selectedSale.status === 'COMPLETED' ? 'COMPLETADA' : 'PENDIENTE'}</strong></span>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Venta</p>
                                    <p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(selectedSale.totalUSD, 'USD')}</p>
                                    <p className="text-sm font-medium text-gray-500 mt-1">Ref. Bs {selectedSale.totalVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                {/* BOTÓN ANULAR */}
                                {selectedSale.status !== 'CANCELLED' && (
                                    <button
                                        onClick={() => {
                                            if (window.confirm('¿Seguro que deseas anular esta venta? El stock volverá al inventario.')) {
                                                annulSale(selectedSale.id);
                                                setSelectedSale(null);
                                            }
                                        }}
                                        className="px-4 py-3 bg-white border border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 flex items-center justify-center gap-2 transition"
                                        title="Anular Venta"
                                    >
                                        <Ban size={20} />
                                    </button>
                                )}

                                {/* BOTÓN WHATSAPP */}
                                <button
                                    onClick={() => sendToWhatsApp(selectedSale)}
                                    className="px-4 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 shadow-lg shadow-green-200 transition flex items-center justify-center gap-2"
                                    title="Enviar por WhatsApp"
                                >
                                    <MessageCircle size={20} />
                                </button>

                                {/* BOTÓN IMPRIMIR */}
                                <button
                                    onClick={() => printInvoice(selectedSale)}
                                    className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black flex justify-center items-center gap-2 shadow-lg transition transform active:scale-95"
                                >
                                    <Printer size={20} /> REIMPRIMIR TICKET
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};