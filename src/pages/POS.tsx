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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { printInvoice, sendToWhatsApp } from '../utils/ticketGenerator';
import {
    User, Search, FileText,
    X, UserPlus, Minus, Plus, Trash2, DollarSign,
    LayoutGrid, List, Star, Barcode, ShoppingCart
} from 'lucide-react';
import type { Product, Client, Sale, Quote, PriceList } from '../types';
import { QuickClientModal } from '../components/QuickClientModal';
import { useDebounce } from '../hooks/useDebounce';
import { ProductCard } from '../components/pos/ProductCard';
import { POSCheckoutModal } from '../components/pos/POSCheckoutModal';
import { generateId } from '../utils/id';

// =============================================
// COMPONENTE PRINCIPAL: POS
// =============================================
export const POS = () => {
    const { products, clients, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, recalculateCartPrices, completeSale, settings, paymentMethods, sales, addQuote, quotes, applyClientCredit, setRealtimeGuard, fetchProducts } = useStore();
    const location = useLocation();

    const [searchTerm, setSearchTerm] = useState('');
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods.length > 0 ? paymentMethods[0].name : 'Efectivo');
    const [isCreditSale, setIsCreditSale] = useState(false);
    const [initialPayment, setInitialPayment] = useState('');
    const [discountPct, setDiscountPct] = useState(0);
    const [applyCredit, setApplyCredit] = useState(false);

    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientList, setShowClientList] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
    const [completedSale, setCompletedSale] = useState<Sale | null>(null);
    const clientListRef = useRef<HTMLDivElement>(null);

    // 🆕 MEJORAS UX POS
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
    const [sheetOffsetY, setSheetOffsetY] = useState(0);
    const [isDraggingSheet, setIsDraggingSheet] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const sheetDragStartYRef = useRef<number | null>(null);

    // ✅ RECALCULAR PRECIOS DEL CARRITO SI CAMBIA EL CLIENTE
    useEffect(() => {
        recalculateCartPrices(selectedClient?.priceList as PriceList | undefined);
    }, [selectedClient, recalculateCartPrices]);

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
        setApplyCredit(false);
        setShowClientList(false);
        setHighlightedClientIndex(-1);
    }, []);

    useEffect(() => {
        // Hydrate from quote transfer
        if (clients.length === 0) return;

        let clientMatch: Client | undefined;

        if (location.state?.clientId) {
            clientMatch = clients.find(c => c.id === location.state.clientId);
        }

        if (!clientMatch && location.state?.clientName) {
            const stateClientName = String(location.state.clientName).trim().toLowerCase();
            clientMatch = clients.find(c => c.name.trim().toLowerCase() === stateClientName);
        }

        if (clientMatch) {
            setTimeout(() => {
                handleSelectClient(clientMatch);
                // Clear state so it doesn't re-apply if we navigate away and back
                window.history.replaceState({}, document.title);
            }, 0);
        }
    }, [location.state?.clientId, location.state?.clientName, clients, handleSelectClient]);

    const clearClient = useCallback(() => {
        setSelectedClient(null);
        setClientSearch('');
        setApplyCredit(false);
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

    // Pre-calcular precios considerando la lista del cliente seleccionado
    const productsWithPrices = useMemo(() => {
        const priceList = selectedClient?.priceList as PriceList | undefined;
        return products.map(p => ({
            product: p,
            priceUSD: calculatePrices(p, settings, priceList).finalPriceUSD
        }));
    }, [products, settings, selectedClient?.priceList]);

    // 🆕 Categorías únicas para tabs
    const categories = useMemo(() => {
        const cats = [...new Set(products.map(p => p.category || 'General'))].sort();
        return ['Todos', ...cats];
    }, [products]);

    // 🆕 Top 8 más vendidos (calculado desde historial)
    const topSold = useMemo(() => {
        const counter: Record<string, { product: Product; count: number; priceUSD: number }> = {};
        for (const sale of sales) {
            for (const item of sale.items) {
                const p = products.find(prod => prod.sku === item.sku);
                if (!p) continue;
                if (!counter[p.id]) {
                    const priceUSD = calculatePrices(p, settings).finalPriceUSD;
                    counter[p.id] = { product: p, count: 0, priceUSD };
                }
                counter[p.id].count += item.quantity;
            }
        }
        return Object.values(counter)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [sales, products, settings]);

    // 🆕 Filtrar con búsqueda debounced + categoría seleccionada
    const filteredProducts = useMemo(() => {
        let list = productsWithPrices;
        if (selectedCategory !== 'Todos') {
            list = list.filter(({ product: p }) => (p.category || 'General') === selectedCategory);
        }
        if (!debouncedSearch) return list;
        const term = debouncedSearch.toLowerCase();
        return list.filter(({ product: p }) =>
            (p.name || '').toLowerCase().includes(term) ||
            (p.sku || '').toLowerCase().includes(term)
        );
    }, [productsWithPrices, debouncedSearch, selectedCategory]);

    // 🆕 Dropdown instantáneo: top 8 resultados mientras escribe
    const dropdownResults = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2) return [];
        const term = searchTerm.toLowerCase();
        return productsWithPrices
            .filter(({ product: p }) =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.sku || '').toLowerCase().includes(term)
            )
            .slice(0, 8);
    }, [productsWithPrices, searchTerm]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
                setShowSearchDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    useEffect(() => {
        if (mobileView === 'cart') return;
        setSheetOffsetY(0);
        setIsDraggingSheet(false);
        sheetDragStartYRef.current = null;
    }, [mobileView]);

    const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!window.matchMedia('(max-width: 768px)').matches) return;
        sheetDragStartYRef.current = e.touches[0]?.clientY ?? null;
        setIsDraggingSheet(true);
    };

    const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!window.matchMedia('(max-width: 768px)').matches) return;
        const startY = sheetDragStartYRef.current;
        if (startY === null) return;

        const currentY = e.touches[0]?.clientY ?? startY;
        const deltaY = Math.max(0, currentY - startY);
        setSheetOffsetY(Math.min(deltaY, 320));
    };

    const handleSheetTouchEnd = () => {
        if (!window.matchMedia('(max-width: 768px)').matches) return;

        if (sheetOffsetY > 120) {
            setMobileView('products');
        }

        setSheetOffsetY(0);
        setIsDraggingSheet(false);
        sheetDragStartYRef.current = null;
    };

    // Handler estable para addToCart con validación de stock y lista de precio
    const handleAddToCart = useCallback((product: Product) => {
        const itemInCart = cart.find(item => item.id === product.id);
        const currentQty = itemInCart ? itemInCart.quantity : 0;
        if (currentQty + 1 > product.stock) {
            toast.error(`Stock insuficiente. Disponibles: ${product.stock}`);
            return;
        }
        addToCart(product, selectedClient?.priceList as PriceList | undefined);
    }, [addToCart, cart, selectedClient?.priceList]);

    // Totales con descuento (#3)
    const subtotalUSD = Math.round(cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0) * 100) / 100;
    const discountAmount = Math.round(subtotalUSD * (discountPct / 100) * 100) / 100;
    const totalUSD = Math.round((subtotalUSD - discountAmount) * 100) / 100;
    const totalBs = Math.round((totalUSD * settings.tasaBCV) * 100) / 100;

    useEffect(() => {
        if (!isCheckoutModalOpen && !completedSale) {
            // Se usa setTimeout para evitar el setState sincrónico dentro del effect 
            setTimeout(() => {
                setIsCreditSale(false);
                setInitialPayment('');
                setDiscountPct(0);
                setApplyCredit(false);
            }, 0);
        }
    }, [isCheckoutModalOpen, completedSale]);

    useEffect(() => {
        // Mantener sync de stock en vivo aunque exista carrito; solo pausar en el cobro.
        const isCriticalFlowActive = isCheckoutModalOpen;
        setRealtimeGuard('pos-active-sale', isCriticalFlowActive);

        return () => {
            setRealtimeGuard('pos-active-sale', false);
        };
    }, [isCheckoutModalOpen, setRealtimeGuard]);

    useEffect(() => {
        const refreshProducts = () => {
            void fetchProducts();
        };

        // Fallback de sincronizacion para stock si realtime falla temporalmente.
        const intervalMs = window.matchMedia('(max-width: 768px)').matches ? 8000 : 4000;
        const intervalId = window.setInterval(refreshProducts, intervalMs);

        const handleFocus = () => {
            refreshProducts();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshProducts();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        refreshProducts();

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchProducts]);

    const currentClientDebt = (() => {
        if (!selectedClient) return 0;
        return sales
            .filter(s => s.clientId === selectedClient.id && (s.status === 'PENDING' || s.status === 'PARTIAL'))
            .reduce((acc, s) => acc + (s.totalUSD - s.paidAmountUSD), 0);
    })();

    const effectivePaymentMethod = useMemo(() => {
        const hasSelected = paymentMethods.some((method) => method.name === selectedPaymentMethod);
        if (hasSelected) return selectedPaymentMethod;
        return paymentMethods[0]?.name || selectedPaymentMethod || 'Efectivo';
    }, [paymentMethods, selectedPaymentMethod]);

    const handleCheckout = async () => {
        if (isCreditSale && !selectedClient) {
            toast.error('⚠️ Para vender a crédito, DEBES seleccionar un Cliente registrado.');
            return;
        }

        // #2 Validación de límite de crédito
        if (isCreditSale && selectedClient && (selectedClient.creditLimit ?? 0) > 0) {
            const abono = parseFloat(initialPayment) || 0;
            const newDebt = totalUSD - abono;
            if (currentClientDebt + newDebt > (selectedClient.creditLimit ?? 0)) {
                return alert(
                    `⛔ Límite de crédito excedido.\n` +
                    `Deuda actual: $${currentClientDebt.toFixed(2)}\n` +
                    `Nueva deuda: $${newDebt.toFixed(2)}\n` +
                    `Límite: $${(selectedClient.creditLimit ?? 0).toFixed(2)}`
                );
            }
        }

        const creditUsed = (applyCredit && selectedClient && (selectedClient.creditBalance ?? 0) > 0)
            ? Math.min(selectedClient.creditBalance!, totalUSD)
            : 0;
        const effectiveTotal = Math.max(0, totalUSD - creditUsed);

        let paymentAmount = effectiveTotal;
        if (isCreditSale) {
            const abono = parseFloat(initialPayment) || 0;
            if (abono > effectiveTotal) return alert('El abono no puede ser mayor al total.');
            paymentAmount = abono;
        }

        const sale = await completeSale(effectivePaymentMethod, selectedClient?.id, paymentAmount);
        if (sale) {
            // Deduct credit used from client balance
            if (creditUsed > 0 && selectedClient) {
                await applyClientCredit(selectedClient.id, -creditUsed);
            }
            setCompletedSale(sale);
            setIsCheckoutModalOpen(false);
            setMobileView('products');
        } else {
            setIsCheckoutModalOpen(false);
        }
    };

    // ✅ FIX: Guardar carrito como cotización
    const handleSaveQuote = useCallback(async () => {
        if (cart.length === 0) return;

        const nextNumber = quotes.length === 0 ? 'COT-001' : `COT-${String(Math.max(...quotes.map(q => parseInt(q.number.replace('COT-', '')) || 0)) + 1).padStart(3, '0')}`;

        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 7); // Default 7 days

        const quote: Quote = {
            id: generateId(),
            number: nextNumber,
            date: new Date().toISOString(),
            validUntil: validUntil.toISOString(),
            clientId: selectedClient?.id,
            clientName: selectedClient?.name,
            items: cart.map(item => ({
                productId: item.id,
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                priceFinalUSD: item.priceFinalUSD,
                discountPct: item.discountPct,
            })),
            totalUSD: totalUSD,
            totalBs: totalBs,
            status: 'DRAFT',
        };

        await addQuote(quote);
        clearCart();
    }, [cart, selectedClient, quotes, totalUSD, totalBs, clearCart, addQuote]);

    const handleSendWhatsAppReceipt = async () => {
        if (!completedSale) return;
        if (!selectedClient) {
            alert('Asigna un cliente primero o créalo para poder enviar el recibo.');
            return;
        }
        await sendToWhatsApp(completedSale);
    };

    const handlePrintReceipt = () => {
        if (!completedSale) return;
        printInvoice(completedSale);
    };

    const handleNewSale = () => {
        setCompletedSale(null);
        clearClient();
        setMobileView('products');
    };

    const handleSelectClientById = (clientId: string) => {
        if (!clientId) {
            clearClient();
            return;
        }

        const client = clients.find((item) => item.id === clientId) || null;
        if (client) {
            handleSelectClient(client);
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] bg-gray-100 w-full overflow-hidden pb-20 md:pb-0">
            {/* IZQUIERDA: CATÁLOGO */}
            <div className={`${mobileView === 'products' ? 'flex opacity-100 translate-y-0' : 'hidden opacity-0 translate-y-2'} md:flex flex-1 flex-col min-h-0 min-w-0 transition-all duration-200`}>

                {/* BARRA SUPERIOR: BÚSQUEDA + TOGGLE */}
                <div className="p-3 bg-white border-b border-gray-200 shadow-sm z-20 space-y-2">
                    <div className="flex gap-2">
                        {/* Smart Search con Dropdown */}
                        <div ref={searchContainerRef} className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Buscar por nombre o código (SKU)..."
                                className="w-full pl-10 pr-8 py-2.5 bg-gray-100 border-2 border-transparent rounded-xl outline-none focus:border-red-400 focus:bg-white text-sm font-medium transition-all"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setShowSearchDropdown(true); }}
                                onFocus={() => searchTerm.length >= 2 && setShowSearchDropdown(true)}
                                onKeyDown={e => { if (e.key === 'Escape') { setSearchTerm(''); setShowSearchDropdown(false); } }}
                                autoFocus
                            />
                            {searchTerm && (
                                <button onClick={() => { setSearchTerm(''); setShowSearchDropdown(false); searchRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition">
                                    <X size={16} />
                                </button>
                            )}

                            {/* DROPDOWN INSTANTÁNEO */}
                            {showSearchDropdown && dropdownResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                    <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resultados rápidos — click para agregar</p>
                                    {dropdownResults.map(({ product: p, priceUSD }) => (
                                        <button
                                            key={p.id}
                                            onClick={() => { handleAddToCart(p); setSearchTerm(''); setShowSearchDropdown(false); searchRef.current?.focus(); }}
                                            className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-50 text-left transition group ${p.stock === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={p.stock === 0}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition">
                                                    <Barcode size={14} className="text-gray-500 group-hover:text-red-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-800 truncate group-hover:text-red-700">{p.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono">{p.sku} · {p.stock > 0 ? `${p.stock} disponibles` : 'Sin Stock'}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-gray-900 pl-3 flex-shrink-0">${priceUSD.toFixed(2)}</span>
                                        </button>
                                    ))}
                                    <div className="border-t border-gray-100 p-2">
                                        <button onClick={() => setShowSearchDropdown(false)} className="w-full text-xs text-gray-400 py-1 hover:text-gray-600 transition">
                                            Ver todos los resultados en el catálogo ↓
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Toggle Grid / Lista */}
                        <div className="flex border-2 border-gray-200 rounded-xl overflow-hidden flex-shrink-0">
                            <button onClick={() => setViewMode('grid')} title="Cuadrícula" className={`p-2.5 transition ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:bg-gray-100'}`}>
                                <LayoutGrid size={18} />
                            </button>
                            <button onClick={() => setViewMode('list')} title="Lista Compacta" className={`p-2.5 transition ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:bg-gray-100'}`}>
                                <List size={18} />
                            </button>
                        </div>
                    </div>

                    {/* TABS DE CATEGORÍAS */}
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-red-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* NAVEGACIÓN MÓVIL PRODUCTOS/CARRITO */}
                    <div className="md:hidden grid grid-cols-2 gap-2 pt-1">
                        <button
                            onClick={() => setMobileView('products')}
                            className={`px-3 py-2 rounded-xl text-xs font-black transition ${mobileView === 'products' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
                        >
                            Productos
                        </button>
                        <button
                            onClick={() => setMobileView('cart')}
                            className={`px-3 py-2 rounded-xl text-xs font-black transition ${mobileView === 'cart' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'}`}
                        >
                            Carrito ({cart.length})
                        </button>
                    </div>
                </div>

                {/* BAR TOP VENDIDOS */}
                {!searchTerm && topSold.length > 0 && (
                    <div className="px-3 pt-2.5 pb-2 bg-white border-b border-amber-100">
                        <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1 mb-1.5">
                            <Star size={10} fill="currentColor" /> Más Vendidos
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {topSold.map(({ product: p, priceUSD }) => (
                                <button
                                    key={p.id}
                                    onClick={() => handleAddToCart(p)}
                                    disabled={p.stock === 0}
                                    title={p.name}
                                    className={`flex-shrink-0 flex items-center gap-2 pl-3 pr-4 py-2 rounded-xl border text-left transition active:scale-95 max-w-[180px] ${p.stock === 0 ? 'opacity-40 cursor-not-allowed bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
                                >
                                    <Star size={13} className="text-amber-500 flex-shrink-0" fill="currentColor" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-gray-800 truncate leading-tight">{p.name}</p>
                                        <p className="text-[10px] font-black text-amber-700">${priceUSD.toFixed(2)}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* CATÁLOGO: GRID o LISTA */}
                <div className="flex-1 overflow-y-auto p-2 md:p-3 bg-gray-50">
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400 gap-3">
                            <Search size={40} strokeWidth={1} />
                            <p className="font-bold text-sm">Sin resultados para "{searchTerm}"</p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3 pb-20 md:pb-0">
                            {filteredProducts.slice(0, 120).map(({ product, priceUSD }) => (
                                <ProductCard key={product.id} product={product} priceUSD={priceUSD} onAdd={handleAddToCart} />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1 pb-20 md:pb-0">
                            {filteredProducts.slice(0, 200).map(({ product: p, priceUSD }) => {
                                const isOutOfStock = p.stock === 0;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => !isOutOfStock && handleAddToCart(p)}
                                        disabled={isOutOfStock}
                                        className={`w-full flex items-center justify-between px-4 py-2.5 bg-white rounded-xl border text-left transition-all active:scale-[.99] group ${isOutOfStock ? 'opacity-50 cursor-not-allowed border-gray-100' : 'border-gray-100 hover:border-red-200 hover:shadow-sm'}`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-red-50 transition">
                                                <Plus size={14} className="text-gray-400 group-hover:text-red-500" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-800 truncate group-hover:text-red-700 transition">{p.name}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-mono text-gray-400">{p.sku}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 rounded-full ${p.stock <= p.minStock ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>{p.stock} un.</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-sm font-black text-gray-900 pl-3 flex-shrink-0">${priceUSD.toFixed(2)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {mobileView === 'cart' && (
                <button
                    onClick={() => setMobileView('products')}
                    className="md:hidden fixed inset-0 bg-black/35 z-30"
                    aria-label="Cerrar carrito"
                />
            )}

            {/* DERECHA: CARRITO */}
            <div
                className={`${mobileView === 'cart' ? 'flex fixed inset-x-0 bottom-0 h-[82vh] rounded-t-3xl z-40' : 'hidden'} md:relative md:top-auto md:inset-auto md:z-20 md:flex md:h-auto md:rounded-none w-full md:w-[380px] md:flex-shrink-0 bg-white border-t md:border-t-0 md:border-l border-gray-200 flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.18)] md:shadow-none transition-transform duration-200`}
                style={{ transform: `translateY(${sheetOffsetY}px)`, transitionDuration: isDraggingSheet ? '0ms' : '200ms' }}
            >
                <div
                    className="md:hidden pt-2 flex justify-center"
                    onTouchStart={handleSheetTouchStart}
                    onTouchMove={handleSheetTouchMove}
                    onTouchEnd={handleSheetTouchEnd}
                    onTouchCancel={handleSheetTouchEnd}
                >
                    <div className="w-14 h-1.5 rounded-full bg-gray-300" />
                </div>
                <div className="md:hidden px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-white">
                    <p className="font-black text-sm text-gray-800">Carrito Activo</p>
                    <button
                        onClick={() => setMobileView('products')}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-600"
                    >
                        Volver
                    </button>
                </div>
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
                                    if (e.target.value === '') clearClient();
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
                    {/* Client results dropdown — inside ref so click-outside works */}
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
                {/* 🏷️ BADGE: Lista de Precio activa */}
                {selectedClient?.priceList && selectedClient.priceList !== 'Detal' && (
                    <div className={`px-3 py-1.5 flex items-center gap-2 text-xs font-bold border-b ${selectedClient.priceList === 'Mayorista' ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-purple-50 border-purple-100 text-purple-700'}`}>
                        <span>{selectedClient.priceList === 'Mayorista' ? '🏷️' : '⭐'}</span>
                        <span>Precios {selectedClient.priceList} aplicados al catálogo</span>
                    </div>
                )}

                {/* 💳 BANNER: Saldo a favor del cliente */}
                {(selectedClient?.creditBalance ?? 0) > 0 && (
                    <div className="px-3 py-2 flex items-center gap-2 bg-green-50 border-b border-green-200">
                        <span className="text-green-600">💳</span>
                        <div className="flex-1">
                            <p className="text-[10px] font-bold text-green-700">Saldo a Favor disponible</p>
                            <p className="text-xs font-black text-green-800">${selectedClient!.creditBalance!.toFixed(2)} USD</p>
                        </div>
                        <button
                            onClick={() => setApplyCredit(v => !v)}
                            className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border transition ${applyCredit ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}`}
                        >
                            {applyCredit ? '✓ Aplicar' : 'Aplicar'}
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 custom-scrollbar max-h-none">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm animate-in slide-in-from-right-2 fade-in duration-200">
                            <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                                <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                                <p className="text-[11px] text-blue-600 font-black mt-0.5">{formatCurrency(item.priceFinalUSD, 'USD')}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center border rounded-xl overflow-hidden bg-gray-50">
                                    <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="w-9 h-9 md:w-7 md:h-7 hover:bg-gray-200 text-gray-600 transition flex items-center justify-center"><Minus size={14} /></button>
                                    <span className="text-sm md:text-xs font-black w-10 md:w-6 text-center bg-white border-x border-gray-100 h-9 md:h-7 flex items-center justify-center">{item.quantity}</span>
                                    <button onClick={() => {
                                        const p = products.find(prod => prod.id === item.id);
                                        if (p && item.quantity + 1 > p.stock) {
                                            toast.error(`Stock insuficiente. Disponibles: ${p.stock}`);
                                            return;
                                        }
                                        updateCartQuantity(item.id, item.quantity + 1);
                                    }} className="w-9 h-9 md:w-7 md:h-7 hover:bg-gray-200 text-gray-600 transition flex items-center justify-center"><Plus size={14} /></button>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="text-[11px] text-red-400 hover:text-red-600 font-bold flex items-center gap-1"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    {discountPct > 0 && (
                        <p className="text-xs font-black text-red-500 mb-2 text-right">Descuento en cobro: -{formatCurrency(discountAmount, 'USD')}</p>
                    )}
                    <div className="flex justify-between items-end pt-1 mb-4">
                        <div className="text-left">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total a Pagar</p>
                            <p className="text-blue-600 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(totalUSD, 'USD')}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        <button onClick={clearCart} disabled={cart.length === 0} className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition" title="Vaciar Carrito"><Trash2 size={20} /></button>
                        <button onClick={handleSaveQuote} disabled={cart.length === 0} className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 shadow-sm disabled:opacity-50 transition" title="Guardar como Cotización"><FileText size={20} /></button>
                        <button onClick={() => setIsCheckoutModalOpen(true)} disabled={cart.length === 0} className="col-span-2 flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black shadow-lg disabled:opacity-50 transition active:scale-95 text-sm"><DollarSign size={20} /> COBRAR</button>
                    </div>
                </div>{/* end cart column */}
            </div>{/* end main flex */}

            <POSCheckoutModal
                isOpen={isCheckoutModalOpen}
                completedSale={completedSale}
                clients={clients}
                selectedClient={selectedClient}
                onSelectClientById={handleSelectClientById}
                settings={settings}
                totalUSD={totalUSD}
                totalBs={totalBs}
                discountPct={discountPct}
                setDiscountPct={setDiscountPct}
                discountAmount={discountAmount}
                currentClientDebt={currentClientDebt}
                isCreditSale={isCreditSale}
                setIsCreditSale={setIsCreditSale}
                initialPayment={initialPayment}
                setInitialPayment={setInitialPayment}
                paymentMethods={paymentMethods}
                selectedPaymentMethod={effectivePaymentMethod}
                setSelectedPaymentMethod={setSelectedPaymentMethod}
                onCloseCheckout={() => setIsCheckoutModalOpen(false)}
                onCheckout={handleCheckout}
                onNewSale={handleNewSale}
                onSendWhatsApp={handleSendWhatsAppReceipt}
                onPrint={handlePrintReceipt}
            />

            {/* MODAL DE CREACIÓN RÁPIDA DE CLIENTE */}
            <QuickClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onClientCreated={(newClient) => {
                    // Seleccionar automáticamente al cliente en el input del buscador
                    setSelectedClient(newClient as Client);
                    setClientSearch(newClient.name);
                    setApplyCredit(false);
                }}
            />

            {/* BARRA RÁPIDA MÓVIL */}
            <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-3 py-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMobileView('cart')}
                        className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-left"
                    >
                        <p className="text-[10px] uppercase font-black tracking-wide text-gray-400">Carrito</p>
                        <p className="text-sm font-black text-gray-800 flex items-center gap-1">
                            <ShoppingCart size={14} className="text-gray-500" />
                            {cart.length} item{cart.length !== 1 ? 's' : ''}
                        </p>
                    </button>
                    <button
                        onClick={() => {
                            setMobileView('products');
                            setIsCheckoutModalOpen(true);
                        }}
                        disabled={cart.length === 0}
                        className="flex-1 rounded-xl bg-red-600 text-white px-3 py-2.5 disabled:opacity-50"
                    >
                        <p className="text-[10px] uppercase font-black tracking-wide text-red-100">Total</p>
                        <p className="text-sm font-black">{formatCurrency(totalUSD, 'USD')} · Cobrar</p>
                    </button>
                </div>
            </div>
        </div >
    );
};

