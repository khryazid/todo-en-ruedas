/**
 * @file POS.tsx
 * @description Punto de Venta optimizado.
 *
 * ✅ SPRINT 6 FIXES:
 *   6.2 — useMemo: precios calculados solo cuando cambian products/settings
 *   6.3 — React.memo: ProductCard no re-renderiza si sus props no cambian
 *   6.5 — Debounce: búsqueda con 200ms de delay para inventarios grandes
 *   6.6 — useCallback: handlers estables entre renders
 */

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { printInvoice, sendToWhatsApp } from '../utils/ticketGenerator';
import {
    ShoppingCart, User, Search, MapPin, Printer,
    CheckCircle, X, Phone, XCircle, UserPlus, Minus, Plus, Trash2, ArrowRight, MessageCircle, AlertTriangle, DollarSign
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product, Client, Sale } from '../types';
import { QuickClientModal } from '../components/QuickClientModal';

// =============================================
// HOOK: useDebounce
// =============================================
function useDebounce(value: string, delay: number) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

// =============================================
// COMPONENTE MEMOIZADO: ProductCard
// =============================================
interface ProductCardProps {
    product: Product;
    priceUSD: number;
    onAdd: (product: Product) => void;
}

const ProductCard = memo(({ product, priceUSD, onAdd }: ProductCardProps) => {
    const isOutOfStock = product.stock === 0;

    return (
        <div
            onClick={() => !isOutOfStock && onAdd(product)}
            className={`relative flex flex-col justify-between p-3 md:p-4 rounded-2xl border shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-full group select-none ${isOutOfStock ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-white border-gray-100 hover:shadow-md hover:border-red-200'}`}
        >
            <div>
                <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{product.sku}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${product.stock <= product.minStock ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-green-50 text-green-700 border-green-100'}`}>{product.stock} un.</span>
                </div>
                <h3 className="text-xs md:text-sm font-bold text-gray-700 leading-snug line-clamp-3 min-h-[2.5rem] mb-2 group-hover:text-red-600 transition-colors" title={product.name}>{product.name}</h3>
            </div>
            <div className="mt-auto pt-3 border-t border-dashed border-gray-100 flex justify-between items-end">
                <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Precio</span><span className="text-base md:text-lg font-black text-gray-900 leading-none">{formatCurrency(priceUSD, 'USD')}</span></div>
                {!isOutOfStock && <div className="bg-red-50 text-red-600 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-red-600 group-hover:text-white transition-all duration-300"><Plus size={18} strokeWidth={3} /></div>}
            </div>
        </div>
    );
});

// =============================================
// COMPONENTE PRINCIPAL: POS
// =============================================
export const POS = () => {
    const { products, clients, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, completeSale, settings, paymentMethods } = useStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods.length > 0 ? paymentMethods[0].name : 'Efectivo');
    const [isCreditSale, setIsCreditSale] = useState(false);
    const [initialPayment, setInitialPayment] = useState('');

    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientList, setShowClientList] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
    const [completedSale, setCompletedSale] = useState<Sale | null>(null); // ✅ Para la vista post-venta
    const clientListRef = useRef<HTMLDivElement>(null);

    // ✅ FIX 6.5: Debounce de búsqueda (200ms)
    const debouncedSearch = useDebounce(searchTerm, 200);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return [];
        const term = clientSearch.toLowerCase();
        return clients.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.rif.toLowerCase().includes(term)
        ).slice(0, 5); // Max 5 items
    }, [clients, clientSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (clientListRef.current && !clientListRef.current.contains(event.target as Node)) {
                setShowClientList(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectClient = useCallback((client: Client) => {
        setSelectedClient(client);
        setClientSearch(client.name);
        setShowClientList(false);
        setHighlightedClientIndex(-1);
    }, []);

    const clearClient = useCallback(() => {
        setSelectedClient(null);
        setClientSearch('');
        setShowClientList(false);
        setHighlightedClientIndex(-1);
    }, []);

    // Navegación por teclado en el buscador de clientes
    const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showClientList || filteredClients.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev < filteredClients.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedClientIndex >= 0 && highlightedClientIndex < filteredClients.length) {
                handleSelectClient(filteredClients[highlightedClientIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowClientList(false);
            setHighlightedClientIndex(-1);
        }
    };

    // ✅ FIX 6.2: Pre-calcular precios solo cuando cambian products o settings
    const productsWithPrices = useMemo(() => {
        return products.map(p => ({
            product: p,
            priceUSD: calculatePrices(p, settings).finalPriceUSD
        }));
    }, [products, settings]);

    // ✅ FIX 6.2: Filtrar sobre la lista ya precalculada con el término debounced
    const filteredProducts = useMemo(() => {
        if (!debouncedSearch) return productsWithPrices;
        const term = debouncedSearch.toLowerCase();
        return productsWithPrices.filter(({ product: p }) =>
            (p.name || '').toLowerCase().includes(term) ||
            (p.sku || '').toLowerCase().includes(term)
        );
    }, [productsWithPrices, debouncedSearch]);

    // ✅ FIX 6.6: Handler estable para addToCart
    const handleAddToCart = useCallback((product: Product) => {
        addToCart(product);
    }, [addToCart]);

    // Totales
    const totalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
    const totalBs = Math.round((totalUSD * settings.tasaBCV) * 100) / 100;

    useEffect(() => {
        if (!isCheckoutModalOpen && !completedSale) {
            setIsCreditSale(false);
            setInitialPayment('');
        }
    }, [isCheckoutModalOpen, completedSale]);

    const handleCheckout = useCallback(async () => {
        if (isCreditSale && !selectedClient) return alert("⚠️ Para vender a crédito, DEBES seleccionar un Cliente registrado.");

        let paymentAmount = totalUSD;
        if (isCreditSale) {
            const abono = parseFloat(initialPayment) || 0;
            if (abono > totalUSD) return alert("El abono no puede ser mayor al total.");
            paymentAmount = abono;
        }

        const sale = await completeSale(selectedPaymentMethod, selectedClient?.id, paymentAmount);
        if (sale) {
            setCompletedSale(sale); // Ir a la vista de éxito
            setIsCheckoutModalOpen(false); // Cerramos el modal de cobro (el de exito se muestra con completedSale)
        } else {
            setIsCheckoutModalOpen(false); // Cierra si hay error catastrófico
        }
    }, [isCreditSale, selectedClient, totalUSD, initialPayment, selectedPaymentMethod, completeSale, clearClient]);

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-5rem)] md:h-screen bg-gray-100 w-full overflow-hidden">
            {/* IZQUIERDA: CATÁLOGO */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="p-3 bg-white border-b border-gray-200 shadow-sm z-10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar producto o SKU..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-sm font-medium"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                        {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"><X size={16} /></button>}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar bg-gray-50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-0">
                        {filteredProducts.map(({ product, priceUSD }) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                priceUSD={priceUSD}
                                onAdd={handleAddToCart}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* DERECHA: CARRITO */}
            <div className="w-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:shadow-none z-20">
                <div className="p-3 bg-blue-50/50 border-b border-blue-100 flex items-center gap-2 relative" ref={clientListRef}>
                    <User size={18} className="text-blue-600 flex-shrink-0" />
                    <div className="relative flex-1 flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Buscar Cliente (Nombre o RIF)..."
                                className="w-full bg-white border border-blue-200 text-sm rounded-lg pl-3 pr-8 py-2 font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                value={clientSearch}
                                onChange={(e) => {
                                    setClientSearch(e.target.value);
                                    setShowClientList(true);
                                    setHighlightedClientIndex(-1);
                                    if (e.target.value === '') setSelectedClient(null);
                                }}
                                onFocus={() => setShowClientList(true)}
                                onKeyDown={handleClientKeyDown}
                            />
                            {(selectedClient || clientSearch) ? (
                                <button onClick={clearClient} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"><X size={14} /></button>
                            ) : null}
                        </div>
                        {/* ✅ FIX #2: Botón de Cliente Rápido */}
                        <button
                            onClick={() => setIsClientModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow flex-shrink-0 transition"
                            title="Añadir Cliente Rápido"
                        >
                            <UserPlus size={18} />
                        </button>
                    </div>
                    {showClientList && clientSearch && !selectedClient && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                            {filteredClients.length > 0 ? filteredClients.map((c, idx) => (
                                <button
                                    key={c.id}
                                    onClick={() => handleSelectClient(c)}
                                    className={`w-full text-left px-4 py-2 text-sm border-b border-gray-50 transition ${highlightedClientIndex === idx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}
                                >
                                    <span className="font-bold text-gray-800">{c.name}</span>
                                    <span className="text-gray-400 ml-2 text-xs">{c.rif}</span>
                                </button>
                            )) : (
                                <div className="p-3 text-center text-xs text-gray-400">
                                    No se encontró. <button onClick={() => { setShowClientList(false); setIsClientModalOpen(true); }} className="text-blue-600 font-bold hover:underline">Registrar Nuevo</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 custom-scrollbar max-h-[20vh] md:max-h-none">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm animate-in slide-in-from-right-2 fade-in duration-200">
                            <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                                <p className="text-[11px] text-blue-600 font-black mt-0.5">{formatCurrency(item.priceFinalUSD, 'USD')}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center border rounded-lg overflow-hidden bg-gray-50">
                                    <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-gray-200 text-gray-600 transition"><Minus size={12} /></button>
                                    <span className="text-xs font-bold w-6 text-center bg-white border-x border-gray-100 h-full flex items-center justify-center">{item.quantity}</span>
                                    <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-gray-200 text-gray-600 transition"><Plus size={12} /></button>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold flex items-center gap-1"><Trash2 size={10} /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-between items-end pt-1 mb-4">
                        <div className="text-left">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total a Pagar</p>
                            <p className="text-blue-600 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(totalUSD, 'USD')}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        <button onClick={clearCart} disabled={cart.length === 0} className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition"><Trash2 size={20} /></button>
                        <button onClick={() => setIsCheckoutModalOpen(true)} disabled={cart.length === 0} className="col-span-3 flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black shadow-lg disabled:opacity-50 transition active:scale-95"><DollarSign size={20} /> COBRAR</button>
                    </div>
                </div>
            </div>

            {/* MODAL DE CHECKOUT Y ÉXITO */}
            {(isCheckoutModalOpen || completedSale) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in">
                    <div className="bg-white w-full md:w-[420px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">
                        {completedSale ? (
                            <div className="text-center">
                                <CheckCircle className="text-green-500 mx-auto mb-4" size={64} />
                                <h3 className="text-2xl font-black text-gray-800 mb-2">¡Venta Exitosa!</h3>
                                <p className="text-gray-500 mb-6">La venta #{completedSale.id} ha sido registrada correctamente.</p>

                                <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100 shadow-inner">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-500 font-bold uppercase text-xs">Total Pagado</span>
                                        <span className="text-3xl font-black text-gray-900">{formatCurrency(completedSale.paidAmountUSD, 'USD')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-400">Ref. Bs</span>
                                        <span className="font-bold text-blue-600">Bs. {((completedSale.paidAmountUSD || 0) * settings.tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {(completedSale.totalUSD - completedSale.paidAmountUSD) > 0.01 && (
                                        <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-gray-200">
                                            <span className="text-red-500 font-bold">Deuda Pendiente</span>
                                            <span className="font-bold text-red-600">{formatCurrency(completedSale.totalUSD - completedSale.paidAmountUSD, 'USD')}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={async () => {
                                            if (!selectedClient) {
                                                alert("Asigna un cliente primero o créalo para poder enviar el recibo.");
                                                return;
                                            }
                                            await sendToWhatsApp(completedSale);
                                        }}
                                        disabled={!selectedClient || !selectedClient.phone}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={(!selectedClient || !selectedClient.phone) ? "El cliente debe tener un teléfono registrado" : "Enviar por WhatsApp"}
                                    >
                                        <MessageCircle size={20} /> ENVIAR RECIBO POR WHATSAPP
                                    </button>
                                    <button
                                        onClick={() => {
                                            printInvoice(completedSale);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition"
                                    >
                                        <Printer size={20} /> IMPRIMIR RECIBO
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCompletedSale(null);
                                            clearClient();
                                        }}
                                        className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                                    >
                                        PROCESAR NUEVA VENTA
                                    </button>
                                </div>
                            </div>
                        ) : isCheckoutModalOpen ? (
                            <>
                                <button onClick={() => setIsCheckoutModalOpen(false)} className="absolute right-4 top-4 text-gray-400 hover:bg-gray-100 p-2 rounded-full transition"><X size={20} /></button>
                                <h2 className="text-2xl font-black text-gray-800 mb-6 flex items-center gap-2"><ShoppingCart className="text-blue-600" /> Checkout</h2>

                                {selectedClient && (
                                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-4 flex items-center gap-3">
                                        <div className="bg-blue-200 text-blue-700 p-2 rounded-full"><User size={20} /></div>
                                        <div><p className="text-[10px] uppercase font-bold text-blue-400">Cliente Asignado</p><p className="font-bold text-blue-900 text-sm">{selectedClient.name}</p></div>
                                    </div>
                                )}

                                <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100 shadow-inner">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-500 font-bold uppercase text-xs">Total Venta</span>
                                        <span className="text-3xl font-black text-gray-900">{formatCurrency(totalUSD, 'USD')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-400">Ref. Bs</span>
                                        <span className="font-bold text-blue-600">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-6">
                                    <label className="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer hover:bg-gray-50 transition border-gray-100">
                                        <input type="checkbox" checked={isCreditSale} onChange={(e) => setIsCreditSale(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                        <span className="font-bold text-gray-700">Venta a Crédito / Fiado</span>
                                    </label>

                                    {isCreditSale && (
                                        <div className="pl-8 animate-in slide-in-from-top-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Abono Inicial (Dejar en 0 si no paga nada)</label>
                                            <div className="flex gap-2 items-center">
                                                <span className="font-bold text-gray-400">$</span>
                                                <input type="number" step="0.01" className="w-full border-b-2 border-gray-200 outline-none focus:border-blue-500 font-bold text-lg py-1 bg-transparent" placeholder="0.00" value={initialPayment} onChange={e => setInitialPayment(e.target.value)} />
                                            </div>
                                            <div className="mt-2 text-right">
                                                <span className="text-xs font-bold text-red-500">Resta por Cobrar: {formatCurrency(Math.max(0, totalUSD - (parseFloat(initialPayment) || 0)), 'USD')}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Método de Pago {isCreditSale && "(del Abono)"}</p>
                                <div className="space-y-2 mb-6 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                                    {paymentMethods.map(method => (
                                        <button key={method.id} onClick={() => setSelectedPaymentMethod(method.name)} className={`w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all ${selectedPaymentMethod === method.name ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
                                            <div className="flex items-center gap-3"><span className={`font-bold text-sm ${selectedPaymentMethod === method.name ? 'text-red-900' : 'text-gray-700'}`}>{method.name}</span></div>
                                            {selectedPaymentMethod === method.name && <CheckCircle size={18} className="text-red-600" />}
                                        </button>
                                    ))}
                                </div>

                                <button onClick={handleCheckout} className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2 ${isCreditSale ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}>
                                    <CheckCircle size={24} /> {isCreditSale ? 'REGISTRAR DEUDA' : 'CONFIRMAR VENTA'}
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            {/* MODAL DE CREACIÓN RÁPIDA DE CLIENTE */}
            <QuickClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onClientCreated={(newClient) => {
                    // Seleccionar automáticamente al cliente en el input del buscador
                    setSelectedClient(newClient as Client);
                    setClientSearch(newClient.name);
                }}
            />
        </div>
    );
};

