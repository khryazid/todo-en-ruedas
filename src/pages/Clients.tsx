/**
 * @file Clients.tsx
 * @description Gestión de Clientes (CRM Avanzado).
 * Incluye historial de compras, cálculo de valor de vida (LTV) y nivel de fidelidad.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    Users, Search, Plus, Edit, Trash2,
    Phone, Mail, MapPin, X, Save,
    ShoppingBag, Calendar, TrendingUp, Award, Clock
} from 'lucide-react';
import type { Client, Sale } from '../types';

export const Clients = () => {
    const { clients, sales, addClient, updateClient, deleteClient } = useStore();

    // Estados UI
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Estado Formulario
    const initialForm: Client = { id: '', name: '', rif: '', phone: '', address: '', email: '', notes: '' };
    const [formData, setFormData] = useState<Client>(initialForm);
    const [isEditing, setIsEditing] = useState(false);

    // Filtrado
    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.rif.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- LÓGICA DE HISTORIAL Y FIDELIDAD ---
    const getClientMetrics = (clientId: string) => {
        const clientSales = sales.filter(s => s.clientId === clientId && s.status !== 'CANCELLED');
        const totalSpent = clientSales.reduce((acc, s) => acc + s.totalUSD, 0);
        const visitCount = clientSales.length;

        // Calcular nivel de fidelidad (Ejemplo simple)
        let tier = { label: 'NUEVO', color: 'bg-gray-100 text-gray-500', icon: Users };
        if (totalSpent > 1000) tier = { label: 'VIP ORO', color: 'bg-yellow-100 text-yellow-700', icon: Award };
        else if (totalSpent > 500) tier = { label: 'PLATA', color: 'bg-gray-200 text-gray-700', icon: Award };
        else if (totalSpent > 100) tier = { label: 'BRONCE', color: 'bg-orange-100 text-orange-700', icon: Award };

        const lastVisit = clientSales.length > 0
            ? new Date(Math.max(...clientSales.map(s => new Date(s.date).getTime()))).toLocaleDateString()
            : 'Nunca';

        return { totalSpent, visitCount, tier, lastVisit, history: clientSales };
    };

    // --- HANDLERS ---
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.rif) return alert("Nombre y RIF son obligatorios");

        if (isEditing) {
            updateClient(formData.id, formData);
            alert("Cliente actualizado");
        } else {
            addClient({ ...formData, id: Date.now().toString() });
            alert("Cliente registrado exitosamente");
        }
        closeModal();
    };

    const openEdit = (client: Client) => {
        setFormData(client);
        setIsEditing(true);
        setIsModalOpen(true);
    };

    const openHistory = (client: Client) => {
        setSelectedClient(client);
        setIsHistoryOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setFormData(initialForm);
        setIsEditing(false);
    };

    const handleDelete = (id: string) => {
        if (window.confirm("¿Estás seguro de eliminar este cliente? Su historial de ventas permanecerá, pero perderá la asociación.")) deleteClient(id);
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cartera de Clientes</h2>
                    <p className="text-gray-500 font-medium">Gestión de fidelidad y contactos</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 flex items-center gap-2 active:scale-95 transition"
                >
                    <Plus size={20} /> Nuevo Cliente
                </button>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por Nombre, RIF o Cédula..."
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-red-100 font-medium"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* GRID DE CLIENTES */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredClients.map(client => {
                    const metrics = getClientMetrics(client.id);
                    const TierIcon = metrics.tier.icon;

                    return (
                        <div key={client.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition group flex flex-col justify-between h-full">
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-gray-100 text-gray-500 p-3 rounded-full font-black text-lg">
                                            {client.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-lg leading-tight line-clamp-1">{client.name}</h3>
                                            <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{client.rif}</span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${metrics.tier.color}`}>
                                        <TierIcon size={12} /> {metrics.tier.label}
                                    </span>
                                </div>

                                <div className="space-y-2 text-sm text-gray-600 mt-4 mb-4">
                                    {client.phone && (
                                        <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /><span>{client.phone}</span></div>
                                    )}
                                    {client.address && (
                                        <div className="flex items-start gap-2"><MapPin size={14} className="text-gray-400 mt-1 flex-shrink-0" /><span className="leading-tight line-clamp-1">{client.address}</span></div>
                                    )}
                                </div>
                            </div>

                            {/* Footer Tarjeta: Métricas y Acciones */}
                            <div className="mt-auto pt-4 border-t border-gray-100">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Total Gastado</p>
                                        <p className="font-black text-gray-800">{formatCurrency(metrics.totalSpent, 'USD')}</p>
                                    </div>
                                    <div className="h-6 w-px bg-gray-200"></div>
                                    <div className="text-center">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Última Visita</p>
                                        <p className="font-bold text-gray-600 text-xs">{metrics.lastVisit}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openHistory(client)}
                                        className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs hover:bg-blue-100 transition flex items-center justify-center gap-2"
                                    >
                                        <Clock size={14} /> Historial
                                    </button>
                                    <button onClick={() => openEdit(client)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(client.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filteredClients.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">
                        <Users size={48} className="mx-auto mb-3 opacity-20" />
                        <p>No se encontraron clientes.</p>
                    </div>
                )}
            </div>

            {/* MODAL 1: CREAR / EDITAR CLIENTE */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                            <button onClick={closeModal} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nombre / Razón Social *</label>
                                <input required className="w-full border-2 border-gray-100 rounded-xl p-3 font-bold text-gray-800 focus:border-red-200 outline-none" placeholder="Ej: Inversiones Los Andes" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">RIF / Cédula *</label><input required className="w-full border-2 border-gray-100 rounded-xl p-3 font-mono" placeholder="J-12345678-9" value={formData.rif} onChange={e => setFormData({ ...formData, rif: e.target.value })} /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Teléfono</label><input className="w-full border-2 border-gray-100 rounded-xl p-3" placeholder="0414-..." value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Dirección Fiscal</label><input className="w-full border-2 border-gray-100 rounded-xl p-3" placeholder="Av. Principal..." value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Email (Opcional)</label><input type="email" className="w-full border-2 border-gray-100 rounded-xl p-3" placeholder="correo@ejemplo.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notas Internas</label><textarea className="w-full border-2 border-gray-100 rounded-xl p-3 h-20 resize-none" placeholder="Preferencias, persona de contacto..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div>
                            <button type="submit" className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg flex items-center justify-center gap-2 mt-2"><Save size={20} /> {isEditing ? 'GUARDAR CAMBIOS' : 'REGISTRAR CLIENTE'}</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: HISTORIAL DE COMPRAS (NUEVO) */}
            {isHistoryOpen && selectedClient && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                        {/* Header Historial */}
                        <div className="p-5 bg-gray-50 border-b flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2"><ShoppingBag className="text-red-600" /> Historial de Compras</h3>
                                <p className="text-sm text-gray-500 font-bold">{selectedClient.name}</p>
                            </div>
                            <button onClick={() => setIsHistoryOpen(false)} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500 transition"><X size={20} /></button>
                        </div>

                        {/* Body Historial */}
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                            {getClientMetrics(selectedClient.id).history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                    <ShoppingBag size={64} className="opacity-20 mb-4" />
                                    <p>Este cliente aún no ha realizado compras.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-xs uppercase font-bold text-gray-500 sticky top-0">
                                        <tr>
                                            <th className="p-4">Fecha</th>
                                            <th className="p-4">Ticket</th>
                                            <th className="p-4 text-center">Ítems</th>
                                            <th className="p-4 text-right">Total ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {getClientMetrics(selectedClient.id).history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(sale => (
                                            <tr key={sale.id} className="hover:bg-gray-50 transition">
                                                <td className="p-4 font-medium text-gray-700">
                                                    {new Date(sale.date).toLocaleDateString()}
                                                    <span className="block text-[10px] text-gray-400 font-normal">{new Date(sale.date).toLocaleTimeString()}</span>
                                                </td>
                                                <td className="p-4 font-mono text-xs text-gray-500">#{sale.id.slice(-6)}</td>
                                                <td className="p-4 text-center">
                                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{sale.items.length}</span>
                                                </td>
                                                <td className="p-4 text-right font-black text-gray-800">{formatCurrency(sale.totalUSD, 'USD')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer Resumen */}
                        <div className="p-5 bg-gray-50 border-t flex justify-between items-center">
                            <div className="text-xs text-gray-500">
                                <p>Compras Totales: <strong className="text-gray-800">{getClientMetrics(selectedClient.id).visitCount}</strong></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Total Histórico</p>
                                <p className="text-2xl font-black text-green-600">{formatCurrency(getClientMetrics(selectedClient.id).totalSpent, 'USD')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};