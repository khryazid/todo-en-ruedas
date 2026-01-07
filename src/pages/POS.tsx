import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
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

    // Cálculos
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
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={16} /></button>}
                    </div>
                </div>

                {/* Grid de Productos (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-2 md:p-4 custom-scrollbar">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4 pb-20 md:pb-0">
                        {filteredProducts.map(product => {
                            const estimatedPrice = product.cost * (1 + (settings.defaultMargin / 100)) * (1 + (settings.defaultVAT / 100));
                            const isOutOfStock = product.stock === 0;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => !isOutOfStock && addToCart(product)}
                                    className={`
                            relative flex flex-col justify-between p-2 md:p-4 rounded-xl border shadow-sm transition-all active:scale-95 cursor-pointer h-full
                            ${isOutOfStock ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100 hover:border-blue-300 hover:shadow-md'}
                          `}
                                >
                                    {/* Badge Agotado */}
                                    {isOutOfStock && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 rounded-xl">
                                            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm transform -rotate-12">AGOTADO</span>
                                        </div>
                                    )}

                                    {/* Info Superior */}
                                    <div className="mb-2">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1 rounded">{product.sku}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${product.stock <= product.minStock ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                {product.stock}
                                            </span>
                                        </div>
                                        {/* Nombre truncado a 2 líneas */}
                                        <h3 className="text-xs md:text-sm font-semibold text-gray-700 leading-tight line-clamp-2 h-8 md:h-10">
                                            {product.name}
                                        </h3>
                                    </div>

                                    {/* Precio y Botón */}
                                    <div className="mt-auto flex justify-between items-center border-t border-gray-50 pt-2">
                                        <div>
                                            <p className="text-[10px] text-gray-400">Precio</p>
                                            <p className="text-sm md:text-lg font-bold text-gray-900">{formatCurrency(estimatedPrice, 'USD')}</p>
                                        </div>
                                        {!isOutOfStock && (
                                            <div className="bg-blue-600 text-white p-1.5 rounded-lg shadow-sm">
                                                <Plus size={14} className="md:w-5 md:h-5" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN DERECHA (INFERIOR EN MÓVIL): CARRITO --- */}
            <div className="w-full md:w-[350px] bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:shadow-none z-20">

                {/* Header del Carrito (Solo PC) */}
                <div className="hidden md:flex p-4 border-b border-gray-100 justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-gray-700 flex items-center gap-2"><ShoppingCart size={18} /> Ticket Actual</h2>
                    <span className="text-xs bg-white border px-2 py-1 rounded-md text-gray-500 font-mono">{cart.length} ítems</span>
                </div>

                {/* Lista de Ítems (Expandible en PC, pequeña en móvil) */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 custom-scrollbar max-h-[20vh] md:max-h-none">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 py-4">
                            <Package size={32} className="mb-2 opacity-50" />
                            <p className="text-xs">Carrito vacío</p>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                                <div className="flex-1 min-w-0 pr-2">
                                    <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                                    <p className="text-[10px] text-blue-600 font-bold">{formatCurrency(item.priceFinalUSD, 'USD')}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center border rounded-md overflow-hidden bg-gray-100">
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-white text-gray-600"><Minus size={12} /></button>
                                        <span className="text-xs font-bold w-6 text-center bg-white">{item.quantity}</span>
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-white text-gray-600"><Plus size={12} /></button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer de Totales y Cobro */}
                <div className="p-3 md:p-4 bg-white border-t border-gray-200">
                    {/* Totales */}
                    <div className="flex justify-between items-end mb-3">
                        <div className="text-left">
                            <p className="text-[10px] text-gray-400 uppercase font-bold">Total a Pagar</p>
                            <p className="text-blue-600 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <p className="text-2xl font-black text-gray-900 leading-none">{formatCurrency(totalUSD, 'USD')}</p>
                    </div>

                    {/* Botones de Acción */}
                    <div className="grid grid-cols-4 gap-2">
                        <button
                            onClick={clearCart}
                            disabled={cart.length === 0}
                            className="col-span-1 flex items-center justify-center p-3 rounded-xl border border-red-100 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                        >
                            <Trash2 size={18} />
                        </button>
                        <button
                            onClick={() => setIsCheckoutModalOpen(true)}
                            disabled={cart.length === 0}
                            className="col-span-3 flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg disabled:opacity-50 disabled:shadow-none"
                        >
                            <DollarSign size={18} /> COBRAR
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MODAL DE COBRO (Overlay) --- */}
            {isCheckoutModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:w-[400px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">

                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-800">Procesar Pago</h3>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="bg-gray-100 p-1 rounded-full text-gray-500"><X size={20} /></button>
                        </div>

                        <div className="space-y-2 mb-6 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                            {paymentMethods.map(method => (
                                <button
                                    key={method.id}
                                    onClick={() => setSelectedPaymentMethod(method.name)}
                                    className={`w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all ${selectedPaymentMethod === method.name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-white text-gray-600'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${selectedPaymentMethod === method.name ? 'bg-blue-200' : 'bg-gray-100'}`}>
                                            <CreditCard size={16} />
                                        </div>
                                        <span className="font-bold text-sm">{method.name}</span>
                                    </div>
                                    {selectedPaymentMethod === method.name && <CheckCircle size={18} className="text-blue-500" />}
                                </button>
                            ))}
                        </div>

                        <div className="bg-gray-900 text-white p-4 rounded-xl mb-4 text-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><DollarSign size={100} /></div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Monto Exacto</p>
                            <p className="text-3xl font-black relative z-10">{formatCurrency(totalUSD, 'USD')}</p>
                            <div className="w-full h-px bg-gray-700 my-2"></div>
                            <p className="text-blue-300 font-bold text-sm">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                        </div>

                        <button onClick={handleCheckout} className="w-full py-4 bg-green-500 text-white font-bold rounded-xl text-lg hover:bg-green-600 shadow-xl shadow-green-200 active:scale-95 transition-transform">
                            ✅ Confirmar Venta
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};