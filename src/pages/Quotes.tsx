/**
 * @file pages/Quotes.tsx
 * @description Módulo de Cotizaciones — crear, ver, cambiar estado e imprimir.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { printMobileQuote } from '../utils/quoteGenerator';
import { printQuoteReport } from '../utils/ticketGenerator';
import {
    FileText, Plus, X, Save, Trash2, Search,
    CheckCircle, XCircle, Clock, Send, Eye, Printer,
    AlertCircle, ShoppingBag, MessageCircle
} from 'lucide-react';
import type { Quote, QuoteItem, QuoteStatus } from '../types';

// --- Helpers visuales de estado ---
const STATUS_CONFIG: Record<QuoteStatus, { label: string; color: string; icon: React.ElementType }> = {
    DRAFT: { label: 'Borrador', color: 'bg-gray-100 text-gray-600', icon: Clock },
    SENT: { label: 'Enviada', color: 'bg-blue-100 text-blue-700', icon: Send },
    ACCEPTED: { label: 'Aceptada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-700', icon: XCircle },
    EXPIRED: { label: 'Vencida', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
};

const STATUS_ORDER: QuoteStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

export const Quotes = () => {
    const { quotes, products, clients, settings, addQuote, updateQuote, deleteQuote, convertQuoteToSale, paymentMethods, loadQuoteIntoCart } = useStore();
    const navigate = useNavigate();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [viewQuote, setViewQuote] = useState<Quote | null>(null);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<QuoteStatus | 'ALL'>('ALL');
    const [showConvertModal, setShowConvertModal] = useState(false);
    const [convertPayMethod, setConvertPayMethod] = useState<string>('');

    // Formulario nuevo
    const [formClientId, setFormClientId] = useState('');
    const [formValidDays, setFormValidDays] = useState(7);
    const [formNotes, setFormNotes] = useState('');
    const [formItems, setFormItems] = useState<QuoteItem[]>([]);
    const [productSearch, setProductSearch] = useState('');

    const tasaBCV = settings.tasaBCV || 1;

    // Número correlativo
    const nextNumber = useMemo(() => {
        if (quotes.length === 0) return 'COT-001';
        const nums = quotes.map(q => parseInt(q.number.replace('COT-', '')) || 0);
        return `COT-${String(Math.max(...nums) + 1).padStart(3, '0')}`;
    }, [quotes]);

    // Filtrado
    const filtered = quotes.filter(q => {
        if (filterStatus !== 'ALL' && q.status !== filterStatus) return false;
        if (search) {
            const t = search.toLowerCase();
            return q.number.toLowerCase().includes(t) ||
                (q.clientName || '').toLowerCase().includes(t);
        }
        return true;
    });

    const formTotal = formItems.reduce((acc, i) => {
        const net = i.priceFinalUSD * (1 - (i.discountPct || 0) / 100);
        return acc + net * i.quantity;
    }, 0);
    const selectedClient = clients.find(c => c.id === formClientId);

    // Productos filtrados para el buscador del formulario
    const productResults = productSearch.length > 1
        ? products.filter(p =>
            p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.sku.toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 8)
        : [];

    const addItem = (productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        const exists = formItems.find(i => i.productId === productId);
        if (exists) {
            setFormItems(formItems.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
            const priceUSD = calculatePrices(p, settings).finalPriceUSD;
            setFormItems([...formItems, {
                productId: p.id, sku: p.sku, name: p.name,
                quantity: 1, priceFinalUSD: priceUSD
            }]);
        }
        setProductSearch('');
    };

    const updateItemQty = (productId: string, qty: number) => {
        if (qty <= 0) {
            setFormItems(formItems.filter(i => i.productId !== productId));
        } else {
            setFormItems(formItems.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
        }
    };

    const updateItemPrice = (productId: string, price: number) => {
        setFormItems(formItems.map(i => i.productId === productId ? { ...i, priceFinalUSD: price } : i));
    };

    const updateItemDiscount = (productId: string, pct: number) => {
        setFormItems(formItems.map(i => i.productId === productId ? { ...i, discountPct: Math.min(100, Math.max(0, pct)) } : i));
    };

    const resetForm = () => {
        setFormClientId(''); setFormValidDays(7); setFormNotes('');
        setFormItems([]); setProductSearch(''); setIsFormOpen(false);
    };

    const handleSave = () => {
        if (formItems.length === 0) return alert('Agrega al menos un producto.');
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + formValidDays);
        const quote: Quote = {
            id: crypto.randomUUID(),
            number: nextNumber,
            date: new Date().toISOString(),
            validUntil: validUntil.toISOString(),
            clientId: formClientId || undefined,
            clientName: selectedClient?.name,
            items: formItems,
            totalUSD: formTotal,
            totalBs: formTotal * tasaBCV,
            notes: formNotes || undefined,
            status: 'DRAFT',
        };
        addQuote(quote);
        resetForm();
    };

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">Cotizaciones</h2>
                    <p className="text-gray-500 font-medium">Propuestas de precio para clientes</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 active:scale-95 transition"
                >
                    <Plus size={20} /> Nueva Cotización
                </button>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar por Nº o cliente..."
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 outline-none"
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as QuoteStatus | 'ALL')}
                >
                    <option value="ALL">Todos los estados</option>
                    {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                </select>
                <span className="text-xs text-gray-400 self-center ml-auto">{filtered.length} cotizaciones</span>
            </div>

            {/* LISTA */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="py-20 text-center">
                        <FileText size={48} className="mx-auto mb-3 opacity-20 text-gray-400" />
                        <p className="text-gray-400">No hay cotizaciones. ¡Crea la primera!</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {filtered.map(q => {
                            const cfg = STATUS_CONFIG[q.status];
                            const StatusIcon = cfg.icon;
                            const expired = new Date(q.validUntil) < new Date() && q.status === 'SENT';
                            return (
                                <div key={q.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition">
                                    {/* Número */}
                                    <div className="flex-shrink-0 text-center w-16">
                                        <p className="font-black text-gray-800 text-sm">{q.number}</p>
                                        <p className="text-[10px] text-gray-400">{new Date(q.date).toLocaleDateString('es-VE')}</p>
                                    </div>

                                    {/* Cliente */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-700 truncate">
                                            {q.clientName || <span className="text-gray-400 italic">Sin cliente</span>}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {q.items.length} producto{q.items.length !== 1 ? 's' : ''} •
                                            Vence: {new Date(q.validUntil).toLocaleDateString('es-VE')}
                                            {expired && <span className="text-orange-500 font-bold ml-1">⚠ Vencida</span>}
                                        </p>
                                    </div>

                                    {/* Total */}
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-black text-gray-800">{formatCurrency(q.totalUSD, 'USD')}</p>
                                        <p className="text-[10px] text-gray-400">Bs {(q.totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                                    </div>

                                    {/* Estado */}
                                    <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.color}`}>
                                        <StatusIcon size={11} /> {cfg.label}
                                    </span>

                                    {/* Acciones */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={() => setViewQuote(q)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition" title="Ver detalle">
                                            <Eye size={15} />
                                        </button>
                                        <button onClick={() => printMobileQuote(q, settings)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition" title="Imprimir">
                                            <Printer size={15} />
                                        </button>
                                        <button onClick={() => { if (window.confirm('¿Eliminar esta cotización?')) deleteQuote(q.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Eliminar">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL: NUEVA COTIZACIÓN */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-xl text-gray-800">Nueva Cotización — {nextNumber}</h3>
                            <button onClick={resetForm} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500 transition shadow-sm"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Cliente y validez */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Cliente (opcional)</label>
                                    <select
                                        className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none focus:border-blue-200 text-sm"
                                        value={formClientId}
                                        onChange={e => setFormClientId(e.target.value)}
                                    >
                                        <option value="">— Sin cliente —</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Válida por (días)</label>
                                    <input
                                        type="number" min={1} max={90}
                                        className="w-full border-2 border-gray-100 rounded-xl p-3 outline-none focus:border-blue-200 text-sm font-bold"
                                        value={formValidDays}
                                        onChange={e => setFormValidDays(parseInt(e.target.value) || 7)}
                                    />
                                </div>
                            </div>

                            {/* Buscador de productos */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Agregar Producto</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o SKU..."
                                        className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-200 text-sm"
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                    />
                                </div>
                                {productResults.length > 0 && (
                                    <div className="border border-gray-200 rounded-xl mt-1 overflow-hidden shadow-sm">
                                        {productResults.map(p => (
                                            <button key={p.id} onClick={() => addItem(p.id)}
                                                className="w-full flex justify-between items-center px-4 py-2.5 hover:bg-blue-50 text-left transition text-sm border-b border-gray-50 last:border-0"
                                            >
                                                <span className="font-bold text-gray-700">{p.name} <span className="text-gray-400 font-normal font-mono text-xs">{p.sku}</span></span>
                                                <span className="font-black text-blue-700">{formatCurrency(calculatePrices(p, settings).finalPriceUSD, 'USD')}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Items agregados */}
                            {formItems.length > 0 && (
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase grid grid-cols-12 gap-2">
                                        <span className="col-span-4">Producto</span>
                                        <span className="col-span-2 text-center">Cant.</span>
                                        <span className="col-span-2 text-center">Precio $</span>
                                        <span className="col-span-2 text-center">Desc.%</span>
                                        <span className="col-span-2 text-right">Sub.</span>
                                    </div>
                                    {formItems.map(item => {
                                        const netPrice = item.priceFinalUSD * (1 - (item.discountPct || 0) / 100);
                                        return (
                                            <div key={item.productId} className="grid grid-cols-12 gap-2 items-center px-4 py-2 border-t border-gray-50">
                                                <span className="col-span-4 text-sm font-bold text-gray-700 truncate">{item.name}</span>
                                                <input type="number" min={1} value={item.quantity}
                                                    onChange={e => updateItemQty(item.productId, parseInt(e.target.value))}
                                                    className="col-span-2 border border-gray-200 rounded-lg text-center p-1 text-sm font-bold w-full"
                                                />
                                                <input type="number" min={0} step={0.01} value={item.priceFinalUSD}
                                                    onChange={e => updateItemPrice(item.productId, e.target.value === '' ? ('' as any) : parseFloat(e.target.value))}
                                                    className="col-span-2 border border-gray-200 rounded-lg text-center p-1 text-sm font-bold w-full"
                                                />
                                                <div className="col-span-2 relative">
                                                    <input type="number" min={0} max={100} step={1} value={item.discountPct ?? ''}
                                                        onChange={e => updateItemDiscount(item.productId, e.target.value === '' ? ('' as any) : parseFloat(e.target.value))}
                                                        placeholder="0"
                                                        className="border border-red-200 rounded-lg text-center p-1 text-sm font-bold w-full text-red-600 focus:border-red-400 outline-none"
                                                    />
                                                </div>
                                                <span className="col-span-2 text-right text-sm font-black text-gray-800">
                                                    {formatCurrency(netPrice * item.quantity, 'USD')}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <div className="bg-blue-50 px-4 py-3 flex justify-between items-center">
                                        <span className="text-sm font-bold text-blue-700">TOTAL</span>
                                        <span className="text-xl font-black text-blue-900">{formatCurrency(formTotal, 'USD')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Notas */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notas / Condiciones</label>
                                <textarea
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 h-20 resize-none text-sm outline-none focus:border-blue-200"
                                    placeholder="Ej: Precios sujetos a disponibilidad. Tiempo de entrega: 3 días hábiles."
                                    value={formNotes}
                                    onChange={e => setFormNotes(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex gap-3">
                            <button onClick={resetForm} className="px-5 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition">
                                Cancelar
                            </button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-2 transition active:scale-95">
                                <Save size={18} /> Guardar Cotización
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: DETALLE / CAMBIAR ESTADO */}
            {viewQuote && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{viewQuote.number}</h3>
                                <p className="text-xs text-gray-400">{new Date(viewQuote.date).toLocaleString('es-VE')}</p>
                            </div>
                            <button onClick={() => setViewQuote(null)} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500 transition shadow-sm"><X size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Info */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-gray-50 p-3 rounded-xl">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Cliente</p>
                                    <p className="font-bold text-gray-700 mt-0.5">{viewQuote.clientName || '—'}</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Válida hasta</p>
                                    <p className="font-bold text-gray-700 mt-0.5">{new Date(viewQuote.validUntil).toLocaleDateString('es-VE')}</p>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                                {viewQuote.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center px-4 py-2.5 text-sm">
                                        <div>
                                            <p className="font-bold text-gray-700">{item.name}</p>
                                            <p className="text-[10px] text-gray-400">{item.quantity} × {formatCurrency(item.priceFinalUSD, 'USD')}</p>
                                        </div>
                                        <span className="font-black text-gray-800">{formatCurrency(item.priceFinalUSD * item.quantity, 'USD')}</span>
                                    </div>
                                ))}
                                <div className="bg-blue-50 px-4 py-3 flex justify-between">
                                    <span className="font-bold text-blue-700">TOTAL</span>
                                    <span className="font-black text-blue-900 text-lg">{formatCurrency(viewQuote.totalUSD, 'USD')}</span>
                                </div>
                            </div>

                            {viewQuote.notes && (
                                <div className="bg-gray-50 p-3 rounded-xl text-sm text-gray-600 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Notas</p>
                                    {viewQuote.notes}
                                </div>
                            )}

                            {/* Cambiar estado */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Cambiar Estado</p>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_ORDER.map(s => {
                                        const c = STATUS_CONFIG[s];
                                        const Icon = c.icon;
                                        return (
                                            <button key={s}
                                                onClick={() => { updateQuote(viewQuote.id, { status: s }); setViewQuote({ ...viewQuote, status: s }); }}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border-2 ${viewQuote.status === s ? `${c.color} border-current` : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}
                                            >
                                                <Icon size={12} /> {c.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 space-y-2">
                            {/* Botón Convertir a Venta */}
                            {viewQuote.status !== 'ACCEPTED' && viewQuote.status !== 'REJECTED' && viewQuote.status !== 'EXPIRED' && (
                                <button
                                    onClick={() => {
                                        loadQuoteIntoCart(viewQuote, products);
                                        navigate('/sales', { state: { clientId: viewQuote.clientId } });
                                    }}
                                    className="w-full py-2.5 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-100 flex justify-center items-center gap-2 transition text-sm shadow-sm"
                                >
                                    <ShoppingBag size={16} /> Cargar en Punto de Venta (POS)
                                </button>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const items = viewQuote.items.map(i => `  • ${i.name} x${i.quantity} = $${(i.priceFinalUSD * i.quantity).toFixed(2)}`).join('\n');
                                        const msg = [
                                            `*COTIZACIÓN ${viewQuote.number}*`,
                                            `_${settings.companyName}_`,
                                            '',
                                            viewQuote.clientName ? `Cliente: ${viewQuote.clientName}` : '',
                                            `Fecha: ${new Date(viewQuote.date).toLocaleDateString('es-VE')}`,
                                            `Válida hasta: ${new Date(viewQuote.validUntil).toLocaleDateString('es-VE')}`,
                                            '',
                                            '*Productos:*',
                                            items,
                                            '',
                                            `*TOTAL: $${viewQuote.totalUSD.toFixed(2)}*`,
                                            `_(Ref. Bs ${viewQuote.totalBs.toFixed(2)} @ ${settings.tasaBCV})_`,
                                            viewQuote.notes ? `\n_${viewQuote.notes}_` : '',
                                        ].filter(Boolean).join('\n');
                                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                                    }}
                                    className="flex-1 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 flex justify-center items-center gap-2 shadow-lg shadow-green-100 transition"
                                >
                                    <MessageCircle size={18} /> WhatsApp
                                </button>
                                <button
                                    onClick={() => printMobileQuote(viewQuote, settings)}
                                    className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black flex justify-center items-center gap-2 transition"
                                >
                                    <Printer size={18} /> Ticket
                                </button>
                                <button
                                    onClick={() => printQuoteReport(viewQuote, settings.companyName || 'Glyph Core', settings.tasaBCV || 1)}
                                    className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 flex justify-center items-center gap-2 transition shadow-lg shadow-red-100"
                                    title="Generar PDF A4 profesional"
                                >
                                    <Printer size={18} /> PDF A4
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
