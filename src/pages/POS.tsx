/**
 * @file POS.tsx
 * @description Punto de Venta (Point of Sale).
 * Interfaz optimizada con diseño de tarjetas responsivo (auto-ajustable).
 */

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing'; // Asegúrate de importar calculatePrices si lo usas, o calcular manual
import {
    Search, ShoppingCart, Plus, Minus, Trash2,
    CreditCard, DollarSign, Package, CheckCircle, X
} from 'lucide-react';

export const POS = () => {
    const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, completeSale, settings, paymentMethods } = useStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods.length > 0 ? paymentMethods[0].name : 'Efectivo');

    // Filtrado
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Cálculos Totales del Carrito
    const totalUSD = cart.reduce((acc, item) => acc + (item.priceFinalUSD * item.quantity), 0);
    const totalBs = totalUSD * settings.tasaBCV;

    const handleCheckout = () => {
        completeSale(selectedPaymentMethod);
        setIsCheckoutModalOpen(false);
        alert('¡Venta procesada con éxito!');
    };

    return (
        // ESTRUCTURA PRINCIPAL: Flex vertical en móvil, fila en escritorio
        <div className="flex flex-col md:flex-row h-[calc(100vh-5rem)] md:h-screen bg-gray-100 w-full overflow-hidden">

            {/* --- SECCIÓN IZQUIERDA: CATÁLOGO DE PRODUCTOS --- */}
            <div className="flex-1 flex flex-col min-h-0">

                {/* Barra de Búsqueda */}
                <div className="p-3 bg-white border-b border-gray-200 shadow-sm z-10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar producto o SKU..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"><X size={16} /></button>}
                    </div>
                </div>

                {/* Grid de Productos (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar bg-gray-50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-20 md:pb-0">
                        {filteredProducts.map(product => {
                            // Calculamos el precio real usando la utilidad
                            // Si prefieres usar el cálculo manual visual rápido:
                            // const estimatedPrice = product.cost * (1 + (settings.defaultMargin / 100)) * (1 + (settings.defaultVAT / 100));
                            // Usaremos calculatePrices para ser consistente con el resto de la app
                            const prices = calculatePrices(product, settings);
                            const estimatedPrice = prices.finalPriceUSD;

                            const isOutOfStock = product.stock === 0;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => !isOutOfStock && addToCart(product)}
                                    className={`
                                        relative flex flex-col justify-between p-3 md:p-4 rounded-2xl border shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-full group
                                        ${isOutOfStock
                                            ? 'bg-gray-50 border-gray-200 opacity-60 grayscale'
                                            : 'bg-white border-gray-100 hover:border-red-200 hover:shadow-lg hover:-translate-y-1'
                                        }
                                    `}
                                >
                                    {/* Badge Agotado */}
                                    {isOutOfStock && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 rounded-2xl backdrop-blur-[1px]">
                                            <span className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md transform -rotate-12 border-2 border-white">AGOTADO</span>
                                        </div>
                                    )}

                                    {/* Parte Superior: SKU y Stock */}
                                    <div className="w-full">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                                                {product.sku}
                                            </span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${product.stock <= product.minStock
                                                ? 'bg-orange-50 text-orange-700 border-orange-100'
                                                : 'bg-green-50 text-green-700 border-green-100'
                                                }`}>
                                                Stock: {product.stock}
                                            </span>
                                        </div>

                                        {/* NOMBRE DEL PRODUCTO (CORREGIDO) */}
                                        {/* Usamos min-h-[2.5rem] para permitir 2 líneas cómodas, y line-clamp-3 por si es muy largo */}
                                        <h3
                                            className="text-xs md:text-sm font-bold text-gray-700 leading-snug line-clamp-3 min-h-[2.5rem] mb-2 group-hover:text-red-600 transition-colors"
                                            title={product.name}
                                        >
                                            {product.name}
                                        </h3>
                                    </div>

                                    {/* Parte Inferior: Precio y Botón */}
                                    <div className="mt-auto pt-3 border-t border-dashed border-gray-100 flex justify-between items-end">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Precio</span>
                                            <span className="text-base md:text-lg font-black text-gray-900 leading-none">
                                                {formatCurrency(estimatedPrice, 'USD')}
                                            </span>
                                        </div>

                                        {!isOutOfStock && (
                                            <div className="bg-red-50 text-red-600 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-red-600 group-hover:text-white transition-all duration-300">
                                                <Plus size={18} strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Mensaje si no hay resultados */}
                    {filteredProducts.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10">
                            <Package size={48} className="mb-2 opacity-20" />
                            <p>No se encontraron productos.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- SECCIÓN DERECHA (INFERIOR EN MÓVIL): CARRITO --- */}
            <div className="w-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:shadow-none z-20">

                {/* Header del Carrito (Solo PC) */}
                <div className="hidden md:flex p-4 border-b border-gray-100 justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-gray-700 flex items-center gap-2"><ShoppingCart size={18} className="text-red-600" /> Ticket Actual</h2>
                    <span className="text-xs bg-white border px-2 py-1 rounded-md text-gray-500 font-mono font-bold">{cart.length} ítems</span>
                </div>

                {/* Lista de Ítems (Expandible en PC, pequeña en móvil) */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 custom-scrollbar max-h-[20vh] md:max-h-none">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 py-4">
                            <ShoppingCart size={40} className="mb-2 opacity-20" />
                            <p className="text-xs font-medium">Carrito vacío</p>
                            <p className="text-[10px] opacity-70">Selecciona productos</p>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm animate-in slide-in-from-right-2 fade-in duration-200">
                                <div className="flex-1 min-w-0 pr-2">
                                    <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                                    <p className="text-[11px] text-blue-600 font-black mt-0.5">{formatCurrency(item.priceFinalUSD, 'USD')}</p>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center border rounded-lg overflow-hidden bg-gray-50">
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="p-1.5 hover:bg-gray-200 text-gray-600 transition"><Minus size={12} /></button>
                                        <span className="text-xs font-bold w-8 text-center bg-white border-x border-gray-100 h-full flex items-center justify-center">{item.quantity}</span>
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="p-1.5 hover:bg-gray-200 text-gray-600 transition"><Plus size={12} /></button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold flex items-center gap-1"><Trash2 size={10} /> Quitar</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer de Totales y Cobro */}
                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    {/* Totales */}
                    <div className="space-y-1 mb-4">
                        <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-gray-400 uppercase">Subtotal</span>
                            <span className="text-sm font-bold text-gray-600">{formatCurrency(totalUSD / 1.16, 'USD')}</span>
                        </div>
                        <div className="flex justify-between items-end pb-2 border-b border-dashed border-gray-200">
                            <span className="text-xs font-bold text-gray-400 uppercase">IVA (16%)</span>
                            <span className="text-sm font-bold text-gray-600">{formatCurrency(totalUSD - (totalUSD / 1.16), 'USD')}</span>
                        </div>
                        <div className="flex justify-between items-end pt-1">
                            <div className="text-left">
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total a Pagar</p>
                                <p className="text-blue-600 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <p className="text-3xl font-black text-gray-900 leading-none">{formatCurrency(totalUSD, 'USD')}</p>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="grid grid-cols-4 gap-3">
                        <button
                            onClick={clearCart}
                            disabled={cart.length === 0}
                            className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            <Trash2 size={20} />
                        </button>
                        <button
                            onClick={() => setIsCheckoutModalOpen(true)}
                            disabled={cart.length === 0}
                            className="col-span-3 flex items-center justify-center gap-2 p-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-black shadow-lg disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition active:scale-95"
                        >
                            <DollarSign size={20} /> COBRAR
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MODAL DE COBRO (Overlay) --- */}
            {isCheckoutModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:w-[420px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">

                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-800">Procesar Pago</h3>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition"><X size={20} /></button>
                        </div>

                        <div className="bg-gray-900 text-white p-5 rounded-2xl mb-6 text-center relative overflow-hidden shadow-xl">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><DollarSign size={120} /></div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-bold">Monto Exacto</p>
                            <p className="text-4xl font-black relative z-10">{formatCurrency(totalUSD, 'USD')}</p>
                            <div className="w-full h-px bg-gray-700 my-3"></div>
                            <p className="text-blue-300 font-bold text-lg">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>

                        <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Selecciona Método</p>
                        <div className="space-y-2 mb-6 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                            {paymentMethods.map(method => (
                                <button
                                    key={method.id}
                                    onClick={() => setSelectedPaymentMethod(method.name)}
                                    className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all group ${selectedPaymentMethod === method.name ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-white text-gray-600 hover:border-gray-300'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${selectedPaymentMethod === method.name ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                                            <CreditCard size={18} />
                                        </div>
                                        <span className={`font-bold ${selectedPaymentMethod === method.name ? 'text-red-900' : 'text-gray-700'}`}>{method.name}</span>
                                    </div>
                                    {selectedPaymentMethod === method.name && <CheckCircle size={20} className="text-red-600" />}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleCheckout}
                            className="w-full py-4 bg-green-600 text-white font-bold rounded-xl text-lg hover:bg-green-700 shadow-xl shadow-green-200 active:scale-95 transition-transform flex items-center justify-center gap-2"
                        >
                            <CheckCircle size={24} /> CONFIRMAR VENTA
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};