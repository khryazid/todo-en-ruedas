/**
 * @file pages/Suppliers.tsx
 * @description Módulo completo de Proveedores.
 * - Lista de proveedores con KPIs de deuda y compras
 * - Ficha completa: datos de contacto, historial de facturas, deuda acumulada
 * - CRUD: crear, editar, eliminar proveedores
 * Solo accesible por ADMIN y MANAGER.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    Truck, Plus, Search, X, Save, Edit, Trash2,
    Phone, Mail, MapPin, FileText, TrendingDown, ChevronRight,
    Building2, Tag, User, StickyNote, AlertCircle
} from 'lucide-react';
import type { Supplier, SupplierCategory } from '../types';
import toast from 'react-hot-toast';

const SUPPLIER_CATEGORIES: SupplierCategory[] = ['Importador', 'Nacional', 'Fabricante', 'Distribuidor', 'Otro'];

const CATEGORY_COLORS: Record<SupplierCategory, string> = {
    Importador: 'bg-blue-100 text-blue-700',
    Nacional: 'bg-green-100 text-green-700',
    Fabricante: 'bg-purple-100 text-purple-700',
    Distribuidor: 'bg-orange-100 text-orange-700',
    Otro: 'bg-gray-100 text-gray-500',
};

type SupplierForm = Omit<Supplier, 'id' | 'createdAt'> & {
    category?: SupplierCategory;
};

const emptyForm: SupplierForm = {
    name: '',
    rif: '',
    rifType: 'J',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    category: undefined,
    notes: '',
};

export const Suppliers = () => {
    const { suppliers, invoices, addSupplier, updateSupplier, deleteSupplier } = useStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('Todos');
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<SupplierForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    // ── Per-supplier metrics from invoices ──────────────────────────────────
    const supplierMetrics = useMemo(() => {
        const map: Record<string, { totalPurchased: number; totalDebt: number; invoiceCount: number }> = {};
        invoices.forEach(inv => {
            const key = (inv.supplier || '').toLowerCase();
            const sup = suppliers.find(s => s.name.toLowerCase() === key);
            if (!sup) return;
            if (!map[sup.id]) map[sup.id] = { totalPurchased: 0, totalDebt: 0, invoiceCount: 0 };
            map[sup.id].totalPurchased += inv.totalUSD;
            map[sup.id].totalDebt += inv.totalUSD - inv.paidAmountUSD;
            map[sup.id].invoiceCount++;
        });
        return map;
    }, [invoices, suppliers]);

    // ── List filtered ───────────────────────────────────────────────────────
    const filteredSuppliers = useMemo(() => {
        return suppliers.filter(s => {
            const matchSearch =
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.rif || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.contactName || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchCat = categoryFilter === 'Todos' || s.category === categoryFilter;
            return matchSearch && matchCat;
        });
    }, [suppliers, searchTerm, categoryFilter]);

    // ── Per-supplier invoices (for detail panel) ────────────────────────────
    const supplierInvoices = useMemo(() => {
        if (!selectedSupplier) return [];
        return invoices
            .filter(inv => (inv.supplier || '').toLowerCase() === selectedSupplier.name.toLowerCase())
            .sort((a, b) => new Date(b.dateIssue).getTime() - new Date(a.dateIssue).getTime());
    }, [invoices, selectedSupplier]);

    // Global KPIs
    const totalDebtAll = Object.values(supplierMetrics).reduce((a, m) => a + m.totalDebt, 0);
    const totalPurchasedAll = Object.values(supplierMetrics).reduce((a, m) => a + m.totalPurchased, 0);

    // ── Handlers ───────────────────────────────────────────────────────────
    const openNew = () => {
        setForm(emptyForm);
        setEditingId(null);
        setIsModalOpen(true);
    };

    const openEdit = (sup: Supplier) => {
        setForm({
            name: sup.name,
            rif: sup.rif || '',
            rifType: sup.rifType || 'J',
            contactName: sup.contactName || '',
            phone: sup.phone || '',
            email: sup.email || '',
            address: sup.address || '',
            category: sup.category,
            notes: sup.notes || '',
        });
        setEditingId(sup.id);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return toast.error('El nombre del proveedor es obligatorio');

        const clean = (value?: string | null) => {
            const v = (value ?? '').trim();
            return v ? v : undefined;
        };

        const payload: Omit<Supplier, 'id' | 'createdAt'> = {
            name: form.name.trim(),
            rif: clean(form.rif),
            rifType: clean(form.rif) ? (form.rifType || 'J') : undefined,
            contactName: clean(form.contactName),
            phone: clean(form.phone),
            email: clean(form.email),
            address: clean(form.address),
            category: form.category ? form.category as SupplierCategory : undefined,
            notes: clean(form.notes),
        };

        setIsSaving(true);
        try {
            if (editingId) {
                await updateSupplier(editingId, payload);
                if (selectedSupplier?.id === editingId) {
                    setSelectedSupplier(prev => prev ? { ...prev, ...payload } : null);
                }
            } else {
                await addSupplier(payload);
            }
            setIsModalOpen(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (sup: Supplier) => {
        if (!window.confirm(`¿Eliminar a "${sup.name}"? Esta acción no se puede deshacer.`)) return;
        const ok = await deleteSupplier(sup.id);
        if (ok && selectedSupplier?.id === sup.id) setSelectedSupplier(null);
    };

    return (
        <div className="flex h-[calc(100vh-3.5rem)] bg-gray-50 overflow-hidden">

            {/* ── PANEL IZQUIERDO: LISTA ──────────────────────────────── */}
            <div className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${selectedSupplier ? 'w-0 md:w-[400px] overflow-hidden' : 'w-full md:w-full'}`}>

                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex-shrink-0">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Truck size={22} className="text-red-600" /> Proveedores
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5">{suppliers.length} registrados</p>
                        </div>
                        <button
                            onClick={openNew}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-100 transition active:scale-95"
                        >
                            <Plus size={16} /> Nuevo
                        </button>
                    </div>

                    {/* KPIs rápidos */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                            <p className="text-[10px] text-red-500 font-bold uppercase">Deuda Total</p>
                            <p className="text-lg font-black text-red-700">{formatCurrency(totalDebtAll, 'USD')}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] text-gray-500 font-bold uppercase">Total Comprado</p>
                            <p className="text-lg font-black text-gray-800">{formatCurrency(totalPurchasedAll, 'USD')}</p>
                        </div>
                    </div>

                    {/* Buscador */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, RIF o contacto..."
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-200 transition"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Category pills */}
                    <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5">
                        {['Todos', ...SUPPLIER_CATEGORIES].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategoryFilter(cat)}
                                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all ${categoryFilter === cat ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto">
                    {filteredSuppliers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400 gap-3">
                            <Truck size={40} strokeWidth={1} />
                            <p className="font-bold text-sm">Sin proveedores</p>
                            <button onClick={openNew} className="text-xs text-red-500 hover:underline">+ Agregar el primero</button>
                        </div>
                    ) : (
                        filteredSuppliers.map(sup => {
                            const metrics = supplierMetrics[sup.id] || { totalPurchased: 0, totalDebt: 0, invoiceCount: 0 };
                            const isSelected = selectedSupplier?.id === sup.id;
                            return (
                                <button
                                    key={sup.id}
                                    onClick={() => setSelectedSupplier(isSelected ? null : sup)}
                                    className={`w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 text-left transition group ${isSelected ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${isSelected ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-red-100 group-hover:text-red-600'} transition`}>
                                            {sup.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-bold text-sm truncate ${isSelected ? 'text-red-700' : 'text-gray-800'}`}>{sup.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {sup.rif && <span className="text-[10px] font-mono text-gray-400">{sup.rifType}-{sup.rif}</span>}
                                                {sup.category && (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[sup.category as SupplierCategory] || 'bg-gray-100 text-gray-500'}`}>
                                                        {sup.category}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-3">
                                        {metrics.totalDebt > 0 && (
                                            <p className="text-xs font-black text-red-600">{formatCurrency(metrics.totalDebt, 'USD')}</p>
                                        )}
                                        <p className="text-[10px] text-gray-400">{metrics.invoiceCount} factura(s)</p>
                                        <ChevronRight size={14} className={`ml-auto text-gray-300 mt-1 ${isSelected ? 'text-red-400 rotate-90' : ''} transition`} />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── PANEL DERECHO: FICHA DETALLE ────────────────────────── */}
            {selectedSupplier && (
                <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
                    {/* Ficha Header */}
                    <div className="p-5 bg-white border-b border-gray-100 flex-shrink-0">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-red-100">
                                    {selectedSupplier.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-800">{selectedSupplier.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        {selectedSupplier.rif && (
                                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                {selectedSupplier.rifType}-{selectedSupplier.rif}
                                            </span>
                                        )}
                                        {selectedSupplier.category && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[selectedSupplier.category as SupplierCategory] || ''}`}>
                                                {selectedSupplier.category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openEdit(selectedSupplier)}
                                    className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                                    title="Editar"
                                >
                                    <Edit size={18} />
                                </button>
                                <button
                                    onClick={() => handleDelete(selectedSupplier)}
                                    className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                                    title="Eliminar"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <button
                                    onClick={() => setSelectedSupplier(null)}
                                    className="p-2 border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-100 transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">

                        {/* KPIs del proveedor */}
                        {(() => {
                            const m = supplierMetrics[selectedSupplier.id] || { totalPurchased: 0, totalDebt: 0, invoiceCount: 0 };
                            return (
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center shadow-sm">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Total Comprado</p>
                                        <p className="text-lg font-black text-gray-800 mt-1">{formatCurrency(m.totalPurchased, 'USD')}</p>
                                    </div>
                                    <div className={`rounded-2xl p-4 border text-center shadow-sm ${m.totalDebt > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Deuda Pendiente</p>
                                        <p className={`text-lg font-black mt-1 ${m.totalDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {m.totalDebt > 0 ? formatCurrency(m.totalDebt, 'USD') : '✓ Al día'}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center shadow-sm">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Facturas</p>
                                        <p className="text-lg font-black text-gray-800 mt-1">{m.invoiceCount}</p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Datos de contacto */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Datos de Contacto</h4>
                            </div>
                            <div className="p-5 space-y-3">
                                {selectedSupplier.contactName && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><User size={14} className="text-gray-500" /></div>
                                        <div><p className="text-[10px] text-gray-400 font-bold uppercase">Contacto</p><p className="text-sm font-semibold text-gray-800">{selectedSupplier.contactName}</p></div>
                                    </div>
                                )}
                                {selectedSupplier.phone && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><Phone size={14} className="text-gray-500" /></div>
                                        <div><p className="text-[10px] text-gray-400 font-bold uppercase">Teléfono</p><p className="text-sm font-semibold text-gray-800">{selectedSupplier.phone}</p></div>
                                    </div>
                                )}
                                {selectedSupplier.email && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><Mail size={14} className="text-gray-500" /></div>
                                        <div><p className="text-[10px] text-gray-400 font-bold uppercase">Email</p><p className="text-sm font-semibold text-gray-800">{selectedSupplier.email}</p></div>
                                    </div>
                                )}
                                {selectedSupplier.address && (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><MapPin size={14} className="text-gray-500" /></div>
                                        <div><p className="text-[10px] text-gray-400 font-bold uppercase">Dirección</p><p className="text-sm font-semibold text-gray-800">{selectedSupplier.address}</p></div>
                                    </div>
                                )}
                                {selectedSupplier.notes && (
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center flex-shrink-0"><StickyNote size={14} className="text-yellow-600" /></div>
                                        <div><p className="text-[10px] text-gray-400 font-bold uppercase">Notas</p><p className="text-sm text-gray-600 leading-relaxed">{selectedSupplier.notes}</p></div>
                                    </div>
                                )}
                                {!selectedSupplier.contactName && !selectedSupplier.phone && !selectedSupplier.email && !selectedSupplier.address && (
                                    <p className="text-sm text-gray-400 text-center py-4 italic">Sin datos de contacto. <button onClick={() => openEdit(selectedSupplier)} className="text-blue-500 hover:underline">Agregar →</button></p>
                                )}
                            </div>
                        </div>

                        {/* Historial de facturas */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={12} /> Historial de Compras
                                </h4>
                                <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">{supplierInvoices.length}</span>
                            </div>
                            {supplierInvoices.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <FileText size={32} className="mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">Sin facturas registradas</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {supplierInvoices.map(inv => {
                                        const debt = inv.totalUSD - inv.paidAmountUSD;
                                        const isPaid = inv.status === 'PAID';
                                        const isOverdue = new Date(inv.dateDue) < new Date() && !isPaid;
                                        return (
                                            <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-green-50' : isOverdue ? 'bg-red-50' : 'bg-orange-50'}`}>
                                                        {isPaid ? <FileText size={14} className="text-green-600" /> : isOverdue ? <AlertCircle size={14} className="text-red-600" /> : <TrendingDown size={14} className="text-orange-600" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-800">#{inv.number}</p>
                                                        <p className="text-[10px] text-gray-400">{new Date(inv.dateIssue + 'T12:00:00').toLocaleDateString('es-VE')} · {inv.items.length} ítems</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-gray-900">{formatCurrency(inv.totalUSD, 'USD')}</p>
                                                    {!isPaid && <p className="text-[10px] text-red-600 font-bold">Debe: {formatCurrency(debt, 'USD')}</p>}
                                                    {isPaid && <p className="text-[10px] text-green-600 font-bold">✓ Pagado</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* ── MODAL CREAR / EDITAR ──────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:w-[560px] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                <Truck size={20} className="text-red-600" />
                                {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Nombre */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1">
                                    <Building2 size={12} /> Nombre de la Empresa *
                                </label>
                                <input
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-800 focus:border-red-300 outline-none transition"
                                    placeholder="Ej: Distribuidora Caribe C.A."
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>

                            {/* RIF */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5">RIF</label>
                                <div className="flex gap-2">
                                    <select
                                        className="border-2 border-gray-100 rounded-xl px-3 py-3 font-bold text-gray-700 outline-none focus:border-red-300"
                                        value={form.rifType}
                                        onChange={e => setForm(f => ({ ...f, rifType: e.target.value as Supplier['rifType'] }))}
                                    >
                                        {(['J', 'V', 'E', 'G', 'P', 'C'] as const).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <input
                                        className="flex-1 border-2 border-gray-100 rounded-xl p-3 font-mono font-semibold text-gray-700 focus:border-red-300 outline-none"
                                        placeholder="12345678-9"
                                        value={form.rif}
                                        onChange={e => setForm(f => ({ ...f, rif: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {/* Categoría */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1">
                                    <Tag size={12} /> Categoría
                                </label>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, category: '' }))}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${!form.category ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                                    >
                                        Sin categoría
                                    </button>
                                    {SUPPLIER_CATEGORIES.map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, category: cat }))}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${form.category === cat ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Contacto + Teléfono */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1"><User size={12} /> Contacto</label>
                                    <input className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-700 focus:border-red-300 outline-none"
                                        placeholder="Nombre de contacto" value={form.contactName}
                                        onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1"><Phone size={12} /> Teléfono</label>
                                    <input className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-700 focus:border-red-300 outline-none"
                                        placeholder="+58 412..." value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1"><Mail size={12} /> Email</label>
                                <input type="email" className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-700 focus:border-red-300 outline-none"
                                    placeholder="proveedor@email.com" value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                            </div>

                            {/* Dirección */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1"><MapPin size={12} /> Dirección</label>
                                <input className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-700 focus:border-red-300 outline-none"
                                    placeholder="Av. Principal, Local 4..." value={form.address}
                                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-1"><StickyNote size={12} /> Notas</label>
                                <textarea
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold text-gray-700 focus:border-red-300 outline-none resize-none"
                                    placeholder="Condiciones de pago, días de crédito, etc."
                                    rows={3}
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                />
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="w-full py-4 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60"
                            >
                                <Save size={20} />
                                {isSaving ? 'Guardando...' : editingId ? 'GUARDAR CAMBIOS' : 'CREAR PROVEEDOR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
