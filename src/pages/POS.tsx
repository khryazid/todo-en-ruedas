/**
 * @file POS.tsx
 * @description Punto de Venta Actualizado.
 * Incluye BUSCADOR DE CLIENTES (Por Nombre o Cédula/RIF) para agilizar la venta.
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import {
    Search, ShoppingCart, Plus, Minus, Trash2,
    CreditCard, DollarSign, Package, CheckCircle, X, User, UserPlus, AlertTriangle, ChevronDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Client } from '../types';

export const POS = () => {
    const { products, clients, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, completeSale, settings, paymentMethods } = useStore();

    // --- ESTADOS LOCALES ---
    const [searchTerm, setSearchTerm] = useState('');
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods.length > 0 ? paymentMethods[0].name : 'Efectivo');

    // Estados para Crédito
    const [isCreditSale, setIsCreditSale] = useState(false);
    const [initialPayment, setInitialPayment] = useState('');

    // --- LÓGICA DE BUSCADOR DE CLIENTES ---
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showClientList, setShowClientList] = useState(false);
    const clientListRef = useRef<HTMLDivElement>(null);

    // Filtrar clientes por Nombre o RIF/Cédula
    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.rif.toLowerCase().includes(clientSearch.toLowerCase())
    );

    // Cerrar lista de clientes al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (clientListRef.current && !clientListRef.current.contains(event.target as Node)) {
                setShowClientList(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Seleccionar Cliente
    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        setClientSearch(client.name); // Mostrar el nombre en el input
        setShowClientList(false);
    };

    // Limpiar Cliente
    const clearClient = () => {
        setSelectedClient(null);
        setClientSearch('');
        setShowClientList(false);
    };

    // --- FIN LÓGICA CLIENTES ---

    // Filtrado de Productos
    const filteredProducts = products.filter(p =>
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Totales
    const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
    const totalBs = totalUSD * settings.tasaBCV;

    // Resetear estados al abrir/cerrar modal
    useEffect(() => {
        if (isCheckoutModalOpen) {
            setIsCreditSale(false);
            setInitialPayment('');
        }
    }, [isCheckoutModalOpen]);

    const handleCheckout = () => {
        if (isCreditSale && !selectedClient) {
            return alert("⚠️ Para vender a crédito, DEBES seleccionar un Cliente registrado.");
        }

        let paymentAmount = totalUSD;
        if (isCreditSale) {
            const abono = parseFloat(initialPayment) || 0;
            if (abono > totalUSD) return alert("El abono no puede ser mayor al total.");
            paymentAmount = abono;
        }

        completeSale(selectedPaymentMethod, selectedClient?.id, paymentAmount);

        setIsCheckoutModalOpen(false);
        clearClient(); // Resetear cliente
        alert(isCreditSale ? '⚠️ Venta a Crédito registrada. Pendiente de cobro.' : '✅ ¡Venta registrada correctamente!');
    };

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-5rem)] md:h-screen bg-gray-100 w-full overflow-hidden">

            {/* --- IZQUIERDA: CATÁLOGO --- */}
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
                        {filteredProducts.map(product => {
                            const prices = calculatePrices(product, settings);
                            const estimatedPrice = prices.finalPriceUSD;
                            const isOutOfStock = product.stock === 0;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => !isOutOfStock && addToCart(product)}
                                    className={`relative flex flex-col justify-between p-3 md:p-4 rounded-2xl border shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-full group select-none ${isOutOfStock ? 'bg-gray-50 border-gray-200 opacity-60 grayscale' : 'bg-white border-gray-100 hover:border-red-200 hover:shadow-lg hover:-translate-y-1'}`}
                                >
                                    {isOutOfStock && <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 rounded-2xl backdrop-blur-[1px]"><span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md transform -rotate-12 border-2 border-white">AGOTADO</span></div>}
                                    <div className="w-full">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">{product.sku}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${product.stock <= product.minStock ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-green-50 text-green-700 border-green-100'}`}>{product.stock} un.</span>
                                        </div>
                                        <h3 className="text-xs md:text-sm font-bold text-gray-700 leading-snug line-clamp-3 min-h-[2.5rem] mb-2 group-hover:text-red-600 transition-colors" title={product.name}>{product.name}</h3>
                                    </div>
                                    <div className="mt-auto pt-3 border-t border-dashed border-gray-100 flex justify-between items-end">
                                        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Precio</span><span className="text-base md:text-lg font-black text-gray-900 leading-none">{formatCurrency(estimatedPrice, 'USD')}</span></div>
                                        {!isOutOfStock && <div className="bg-red-50 text-red-600 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-red-600 group-hover:text-white transition-all duration-300"><Plus size={18} strokeWidth={3} /></div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* --- DERECHA: CARRITO --- */}
            <div className="w-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:shadow-none z-20">

                {/* 1. BUSCADOR DE CLIENTES (NUEVO) */}
                <div className="p-3 bg-blue-50/50 border-b border-blue-100 flex items-center gap-2 relative" ref={clientListRef}>
                    <User size={18} className="text-blue-600 flex-shrink-0" />

                    {/* Input Buscador */}
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Buscar Cliente (Nombre o RIF)..."
                            className="w-full bg-white border border-blue-200 text-sm rounded-lg pl-3 pr-8 py-2 font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:font-normal placeholder:text-gray-400"
                            value={clientSearch}
                            onChange={(e) => {
                                setClientSearch(e.target.value);
                                setShowClientList(true);
                                if (e.target.value === '') setSelectedClient(null);
                            }}
                            onFocus={() => setShowClientList(true)}
                        />
                        {/* Icono estado (Flecha o X) */}
                        {selectedClient || clientSearch ? (
                            <button onClick={clearClient} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
                                <X size={14} />
                            </button>
                        ) : (
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        )}

                        {/* Lista Desplegable de Resultados */}
                        {showClientList && (clientSearch || filteredClients.length > 0) && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[250px] overflow-y-auto custom-scrollbar">
                                {filteredClients.length > 0 ? (
                                    filteredClients.map(client => (
                                        <button
                                            key={client.id}
                                            onClick={() => handleSelectClient(client)}
                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition flex flex-col"
                                        >
                                            <span className="font-bold text-gray-800 text-sm">{client.name}</span>
                                            <span className="text-[10px] text-gray-500 font-mono">RIF: {client.rif}</span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-3 text-center text-xs text-gray-400 italic">
                                        No se encontraron clientes.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <Link to="/clients" className="p-2 bg-white border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition" title="Crear Nuevo Cliente">
                        <UserPlus size={18} />
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 custom-scrollbar max-h-[20vh] md:max-h-none">
                    {cart.map(item => (
                        <div key={item.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm animate-in slide-in-from-right-2 fade-in duration-200">
                            <div className="flex-1 min-w-0 pr-2"><p className="text-xs font-bold text-gray-800 truncate">{item.name}</p><p className="text-[10px] text-gray-400 font-mono">{item.sku}</p><p className="text-[11px] text-blue-600 font-black mt-0.5">{formatCurrency(item.priceFinalUSD, 'USD')}</p></div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center border rounded-lg overflow-hidden bg-gray-50"><button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-gray-200 text-gray-600 transition"><Minus size={12} /></button><span className="text-xs font-bold w-6 text-center bg-white border-x border-gray-100 h-full flex items-center justify-center">{item.quantity}</span><button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-gray-200 text-gray-600 transition"><Plus size={12} /></button></div>
                                <button onClick={() => removeFromCart(item.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold flex items-center gap-1"><Trash2 size={10} /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-between items-end pt-1 mb-4"><div className="text-left"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total a Pagar</p><p className="text-blue-600 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p></div><p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(totalUSD, 'USD')}</p></div>
                    <div className="grid grid-cols-4 gap-3">
                        <button onClick={clearCart} disabled={cart.length === 0} className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition"><Trash2 size={20} /></button>
                        <button onClick={() => setIsCheckoutModalOpen(true)} disabled={cart.length === 0} className="col-span-3 flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black shadow-lg disabled:opacity-50 transition active:scale-95"><DollarSign size={20} /> COBRAR</button>
                    </div>
                </div>
            </div>

            {/* MODAL COBRO */}
            {isCheckoutModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in">
                    <div className="bg-white w-full md:w-[420px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black text-gray-800">Procesar Pago</h3><button onClick={() => setIsCheckoutModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition"><X size={20} /></button></div>

                        {selectedClient && (
                            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-4 flex items-center gap-3">
                                <div className="bg-blue-200 text-blue-700 p-2 rounded-full"><User size={20} /></div>
                                <div><p className="text-[10px] uppercase font-bold text-blue-400">Cliente Asignado</p><p className="font-bold text-blue-900 text-sm">{selectedClient.name}</p></div>
                            </div>
                        )}

                        <div className="bg-gray-900 text-white p-5 rounded-2xl mb-4 text-center relative overflow-hidden shadow-xl">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Total Venta</p>
                            <p className="text-4xl font-black relative z-10">{formatCurrency(totalUSD, 'USD')}</p>
                            <p className="text-blue-300 font-bold text-sm mt-1">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>

                        {/* SWITCH DE CRÉDITO */}
                        <div className="mb-4">
                            <label className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition ${isCreditSale ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${isCreditSale ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-500'}`}><AlertTriangle size={16} /></div>
                                    <span className={`font-bold text-sm ${isCreditSale ? 'text-orange-800' : 'text-gray-500'}`}>Venta a Crédito / Fiado</span>
                                </div>
                                <input type="checkbox" className="w-5 h-5 accent-orange-600" checked={isCreditSale} onChange={e => setIsCreditSale(e.target.checked)} />
                            </label>

                            {/* INPUT ABONO INICIAL */}
                            {isCreditSale && (
                                <div className="mt-3 animate-in slide-in-from-top-2 fade-in">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Abono Inicial (Opcional)</label>
                                    <div className="flex gap-2 mt-1">
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="flex-1 border-2 border-orange-100 rounded-xl p-3 font-bold text-gray-800 focus:border-orange-400 outline-none"
                                            value={initialPayment}
                                            onChange={e => setInitialPayment(e.target.value)}
                                        />
                                    </div>
                                    <div className="text-right mt-1">
                                        <span className="text-xs font-bold text-red-500">
                                            Resta por Cobrar: {formatCurrency(Math.max(0, totalUSD - (parseFloat(initialPayment) || 0)), 'USD')}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Método de Pago {isCreditSale && "(del Abono)"}</p>
                        <div className="space-y-2 mb-6 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                            {paymentMethods.map(method => (
                                <button key={method.id} onClick={() => setSelectedPaymentMethod(method.name)} className={`w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all ${selectedPaymentMethod === method.name ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-white hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`font-bold text-sm ${selectedPaymentMethod === method.name ? 'text-red-900' : 'text-gray-700'}`}>{method.name}</span>
                                    </div>
                                    {selectedPaymentMethod === method.name && <CheckCircle size={18} className="text-red-600" />}
                                </button>
                            ))}
                        </div>

                        <button onClick={handleCheckout} className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2 ${isCreditSale ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}>
                            <CheckCircle size={24} /> {isCreditSale ? 'REGISTRAR DEUDA' : 'CONFIRMAR VENTA'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};