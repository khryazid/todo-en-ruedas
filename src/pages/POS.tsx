import { useState } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, FileText } from 'lucide-react';

export const POS = () => {
    const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, settings } = useStore();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Cálculos del Carrito
    const totalBaseUSD = cart.reduce((acc, item) => acc + (item.priceBaseUSD * item.quantity), 0);
    const totalTaxUSD = cart.reduce((acc, item) => acc + (item.priceTaxUSD * item.quantity), 0);
    const totalFinalUSD = totalBaseUSD + totalTaxUSD;
    const totalBs = totalFinalUSD * settings.tasaBCV;

    return (
        <div className="flex h-screen bg-gray-100 ml-64 overflow-hidden">

            {/* SECCIÓN IZQUIERDA: PRODUCTOS */}
            <div className="w-2/3 p-6 flex flex-col h-full">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Punto de Venta</h2>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Escanear código o buscar producto..."
                            className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-red-500 outline-none text-lg"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                    {filteredProducts.map((product) => (
                        <button
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="bg-white p-4 rounded-xl border border-gray-200 hover:shadow-md hover:border-red-300 transition text-left flex flex-col justify-between group h-32"
                        >
                            <div>
                                <h3 className="font-bold text-gray-800 line-clamp-2">{product.name}</h3>
                                <p className="text-xs text-gray-400 font-mono mt-1">{product.sku}</p>
                            </div>
                            <div className="mt-2 flex justify-between items-end">
                                <div className={`text-xs px-2 py-1 rounded font-bold ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    Stock: {product.stock}
                                </div>
                                <div className="bg-gray-50 p-2 rounded-full group-hover:bg-red-600 group-hover:text-white transition">
                                    <Plus size={16} />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* SECCIÓN DERECHA: TICKET / FACTURA */}
            <div className="w-1/3 bg-white border-l border-gray-200 flex flex-col h-full shadow-xl">

                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                            <FileText size={20} />
                            Detalle Factura
                        </h3>
                        <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700 font-medium underline">
                            Vaciar
                        </button>
                    </div>
                </div>

                {/* LISTA DE ITEMS (CON ESTADO VACÍO CORREGIDO) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                            {/* AQUÍ USAMOS EL SHOPPINGCART PARA QUE NO DE ERROR */}
                            <ShoppingCart size={48} className="opacity-20" />
                            <p className="text-sm font-medium">Carrito vacío</p>
                        </div>
                    ) : (
                        cart.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                                <div className="flex-1">
                                    <p className="font-bold text-sm text-gray-800 line-clamp-1">{item.name}</p>
                                    <div className="text-xs text-gray-500 flex gap-2">
                                        <span>{formatCurrency(item.priceFinalUSD, 'USD')}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center bg-white border border-gray-200 rounded-lg">
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="p-1 hover:bg-gray-100 text-gray-600"><Minus size={14} /></button>
                                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                                        <button onClick={() => updateCartQuantity(item.id, item.quantity + 1)} className="p-1 hover:bg-gray-100 text-gray-600"><Plus size={14} /></button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* RESUMEN DETALLADO */}
                <div className="p-6 bg-gray-50 border-t border-gray-200 space-y-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Datos para Factura</h4>

                    <div className="flex justify-between text-gray-700 text-sm">
                        <span>Base Imponible</span>
                        <span className="font-mono">{formatCurrency(totalBaseUSD, 'USD')}</span>
                    </div>

                    <div className="flex justify-between text-gray-700 text-sm">
                        <span>IVA ({settings.defaultVAT}%)</span>
                        <span className="font-mono">{formatCurrency(totalTaxUSD, 'USD')}</span>
                    </div>

                    <div className="border-t border-gray-300 border-dashed my-3"></div>

                    <div className="flex justify-between items-end">
                        <span className="font-bold text-xl text-gray-800">Total USD</span>
                        <span className="font-bold text-xl text-gray-900">{formatCurrency(totalFinalUSD, 'USD')}</span>
                    </div>
                    <div className="flex justify-between items-end mt-1">
                        <span className="font-bold text-sm text-gray-500">Total Bs (BCV)</span>
                        <span className="font-bold text-xl text-blue-600">{formatCurrency(totalBs, 'VED')}</span>
                    </div>

                    <button
                        disabled={cart.length === 0}
                        className="w-full py-4 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                    >
                        <CreditCard size={20} />
                        Cobrar
                    </button>
                </div>
            </div>
        </div>
    );
};