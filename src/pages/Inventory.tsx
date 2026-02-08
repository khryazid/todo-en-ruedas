/**
 * @file Inventory.tsx
 * @description Gestión de Inventario y Carga de Compras.
 * Permite ver el stock, editar productos y procesar facturas de proveedores (entradas).
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import {
  Search, Plus, Package, Edit, Trash2, FileText, X, CheckCircle,
  Truck, History, RefreshCw, AlertTriangle, AlertOctagon, Save
} from 'lucide-react';
import type { Product, Invoice, IncomingItem, CostType, PaymentStatus } from '../types';

export const Inventory = () => {
  const { products, updateProduct, deleteProduct, addInvoice, settings, suppliers } = useStore();

  // --- ESTADOS DE UI ---
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Estado para edición rápida
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // --- ESTADOS PARA CARGA DE FACTURA (NUEVA COMPRA) ---
  const initialInvoiceState = {
    number: '',
    supplier: '',
    dateIssue: new Date().toISOString().split('T')[0],
    dateDue: new Date().toISOString().split('T')[0],
    freight: 0,
    costType: 'BCV' as CostType,
    status: 'PENDING' as PaymentStatus,
    initialPayment: 0
  };
  const [invoiceHeader, setInvoiceHeader] = useState(initialInvoiceState);
  const [invoiceItems, setInvoiceItems] = useState<IncomingItem[]>([]);

  // Ítem temporal (el que se está escribiendo antes de agregar a la lista)
  const [tempItem, setTempItem] = useState({ sku: '', name: '', quantity: 1, cost: 0, minStock: 5 });

  // --- ESTADO PARA EDICIÓN DE PRODUCTO INDIVIDUAL ---
  const initialProductState: Product = {
    id: '', sku: '', name: '', category: 'General', stock: 0, minStock: 5,
    cost: 0, freight: 0, costType: 'BCV', supplier: 'General'
  };
  const [productForm, setProductForm] = useState<Product>(initialProductState);

  // --- FILTRADO ---
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- LÓGICA DE FACTURACIÓN ---

  // Historial inteligente: Si seleccionas un proveedor, muestra qué le has comprado antes
  const supplierCatalog = useMemo(() => {
    if (!invoiceHeader.supplier) return [];
    const supplier = suppliers.find(s => s.name.toLowerCase() === invoiceHeader.supplier.toLowerCase());
    return supplier ? supplier.catalog : [];
  }, [invoiceHeader.supplier, suppliers]);

  const handleInvoiceSubmit = () => {
    if (!invoiceHeader.number || !invoiceHeader.supplier || invoiceItems.length === 0) {
      return alert("⚠️ Faltan datos obligatorios (Proveedor, Número o Productos).");
    }

    const subtotal = invoiceItems.reduce((acc, i) => acc + (i.quantity * i.costUnitUSD), 0);
    const total = subtotal + invoiceHeader.freight;

    // Determinar estado inicial del pago
    let finalStatus: PaymentStatus = 'PENDING';
    const finalPaidAmount = invoiceHeader.initialPayment;

    if (invoiceHeader.status === 'PAID') {
      // Si marcó contado, se asume pagado total
      finalStatus = 'PAID';
    } else if (finalPaidAmount >= (total - 0.01)) {
      finalStatus = 'PAID';
    } else if (finalPaidAmount > 0) {
      finalStatus = 'PARTIAL';
    }

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      number: invoiceHeader.number,
      supplier: invoiceHeader.supplier,
      dateIssue: invoiceHeader.dateIssue,
      dateDue: invoiceHeader.dateDue,
      status: finalStatus,
      costType: invoiceHeader.costType,
      items: invoiceItems,
      subtotalUSD: subtotal,
      freightTotalUSD: invoiceHeader.freight,
      totalUSD: total,
      paidAmountUSD: invoiceHeader.status === 'PAID' ? total : finalPaidAmount,
      payments: finalPaidAmount > 0 ? [{
        id: Date.now().toString(),
        date: invoiceHeader.dateIssue,
        amountUSD: finalPaidAmount,
        method: 'Inicial',
        note: 'Abono carga inicial'
      }] : []
    };

    if (addInvoice(newInvoice)) {
      alert(`✅ Compra procesada exitosamente.\nInventario actualizado.`);
      setIsInvoiceModalOpen(false);
      setInvoiceHeader(initialInvoiceState);
      setInvoiceItems([]);
    }
  };

  // Agregar línea a la factura temporal
  const addLineToInvoice = () => {
    if (!tempItem.sku || !tempItem.name || tempItem.cost <= 0) return alert("Completa los datos del ítem");
    setInvoiceItems([...invoiceItems, {
      id: Date.now().toString() + Math.random(),
      sku: tempItem.sku,
      name: tempItem.name,
      quantity: tempItem.quantity,
      costUnitUSD: tempItem.cost,
      minStock: tempItem.minStock
    }]);
    // Resetear solo campos variables, mantener SKU/Nombre si quiere cargar variantes? No, mejor limpiar todo.
    setTempItem({ sku: '', name: '', quantity: 1, cost: 0, minStock: 5 });
  };

  // --- LÓGICA DE PRODUCTOS ---
  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setProductForm(product);
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      updateProduct(editingProduct.id, productForm);
      setIsProductModalOpen(false);
      setEditingProduct(null);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Borrar producto del sistema? Esta acción no se puede deshacer.')) deleteProduct(id);
  };

  // Autocompletar datos si el SKU ya existe en sistema
  const handleSkuBlur = () => {
    const existing = products.find(p => p.sku === tempItem.sku);
    if (existing) {
      setTempItem({ ...tempItem, name: existing.name, cost: existing.cost, minStock: existing.minStock });
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full animate-in fade-in duration-300">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Inventario</h2>
          <p className="text-gray-500 font-medium">Gestión de existencias y costos</p>
        </div>
        <div className="w-full md:w-auto">
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="w-full md:w-auto px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold flex justify-center items-center gap-2 shadow-lg hover:shadow-red-200 transition transform active:scale-95"
          >
            <FileText size={20} /> Cargar Compra
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, código o proveedor..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition font-medium text-gray-700"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-400 tracking-wider">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4 text-center">Stock</th>
                <th className="px-6 py-4 text-right">Costo ($)</th>
                <th className="px-6 py-4 text-right">PVP ($)</th>
                <th className="px-6 py-4 text-right">PVP (Bs)</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((product) => {
                const prices = calculatePrices(product, settings);
                const isOutOfStock = product.stock === 0;
                const isLowStock = product.stock <= (product.minStock || 5);

                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isOutOfStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                          {isOutOfStock ? <AlertOctagon size={20} /> : <Package size={20} />}
                        </div>
                        <div>
                          <p className={`font-bold ${isOutOfStock ? 'text-red-600' : 'text-gray-800'}`}>{product.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${isOutOfStock ? 'bg-red-100 text-red-700' : isLowStock ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {product.stock}
                        </span>
                        {isLowStock && !isOutOfStock && <span className="text-[9px] text-orange-500 font-bold flex items-center gap-1"><AlertTriangle size={8} /> Bajo</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{formatCurrency(product.cost + (product.freight || 0), 'USD')}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${product.costType === 'BCV' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                          {product.costType}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-800">{formatCurrency(prices.finalPriceUSD, 'USD')}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-500 group-hover:text-red-600 transition-colors">Bs. {prices.priceVED_BCV.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEdit(product)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit size={18} /></button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && <div className="text-center py-10 text-gray-400">No se encontraron productos.</div>}
        </div>
      </div>

      {/* --- MODAL 1: EDICIÓN RÁPIDA --- */}
      {isProductModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Editar Producto</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
            </div>

            <form onSubmit={handleProductSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">SKU / Código</label><input required className="w-full border rounded-xl p-3 mt-1 font-mono text-sm bg-gray-50" value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre</label><input required className="w-full border rounded-xl p-3 mt-1" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Categoría</label><input className="w-full border rounded-xl p-3 mt-1" value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Proveedor</label>
                  <input list="supplier-list-edit" className="w-full border rounded-xl p-3 mt-1" value={productForm.supplier || ''} onChange={e => setProductForm({ ...productForm, supplier: e.target.value })} />
                  <datalist id="supplier-list-edit">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div><label className="text-xs font-bold text-gray-500">Costo ($)</label><input type="number" step="0.01" className="w-full border rounded-xl p-2 mt-1" value={productForm.cost} onChange={e => setProductForm({ ...productForm, cost: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-xs font-bold text-gray-500">Flete Unit. ($)</label><input type="number" step="0.01" className="w-full border rounded-xl p-2 mt-1" value={productForm.freight} onChange={e => setProductForm({ ...productForm, freight: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-xs font-bold text-gray-500">Stock Actual</label><input type="number" className="w-full border rounded-xl p-2 mt-1" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-xs font-bold text-red-500">Alerta Mínima</label><input type="number" className="w-full border rounded-xl p-2 mt-1 border-red-100" value={productForm.minStock} onChange={e => setProductForm({ ...productForm, minStock: parseFloat(e.target.value) || 0 })} /></div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Tasa de Origen</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setProductForm({ ...productForm, costType: 'BCV' })} className={`flex-1 py-2 rounded-lg font-bold text-xs ${productForm.costType === 'BCV' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-200' : 'bg-gray-100 text-gray-400'}`}>Tasa BCV</button>
                    <button type="button" onClick={() => setProductForm({ ...productForm, costType: 'TH' })} className={`flex-1 py-2 rounded-lg font-bold text-xs ${productForm.costType === 'TH' ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>Monitor</button>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Margen Personalizado (%)</label>
                  <input type="number" className="w-full border rounded-xl p-2" placeholder="Usar Global" value={productForm.customMargin ?? ''} onChange={e => setProductForm({ ...productForm, customMargin: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 flex items-center justify-center gap-2 shadow-lg"><Save size={18} /> Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CARGA FACTURA (COMPLEJA) --- */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
            {/* Header Modal Invoice */}
            <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-gray-800 flex items-center gap-2"><Truck size={24} className="text-red-600" /> Cargar Compra</h3>
                <p className="text-sm text-gray-500">Ingresa la mercancía y la deuda asociada.</p>
              </div>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="bg-white p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

              {/* Sección 1: Datos de Factura */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 className="text-xs font-bold text-blue-800 uppercase mb-3 flex items-center gap-2"><FileText size={14} /> Datos del Documento</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nº Control</label><input required type="text" className="w-full border rounded-lg p-2 mt-1 font-bold bg-white" value={invoiceHeader.number} onChange={e => setInvoiceHeader({ ...invoiceHeader, number: e.target.value })} /></div>
                  <div className="md:col-span-2"><label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label><input list="supplier-list-invoice" className="w-full border rounded-lg p-2 mt-1 bg-white font-bold" placeholder="Selecciona o Escribe..." value={invoiceHeader.supplier} onChange={e => setInvoiceHeader({ ...invoiceHeader, supplier: e.target.value })} /><datalist id="supplier-list-invoice">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Tasa de Costo</label><select className="w-full border rounded-lg p-2 mt-1 bg-white font-bold text-gray-700" value={invoiceHeader.costType} onChange={e => setInvoiceHeader({ ...invoiceHeader, costType: e.target.value as CostType })}><option value="BCV">Tasa BCV</option><option value="TH">Tasa Monitor</option></select></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-blue-100">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Fecha Emisión</label><input type="date" className="w-full border rounded-lg p-2 mt-1 bg-white" value={invoiceHeader.dateIssue} onChange={e => setInvoiceHeader({ ...invoiceHeader, dateIssue: e.target.value })} /></div>
                  <div><label className="text-[10px] font-bold text-red-500 uppercase">Vencimiento</label><input type="date" className="w-full border rounded-lg p-2 mt-1 bg-white border-red-200" value={invoiceHeader.dateDue} onChange={e => setInvoiceHeader({ ...invoiceHeader, dateDue: e.target.value })} /></div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Condición</label>
                    <div className="flex bg-white rounded-lg border overflow-hidden mt-1 shadow-sm">
                      <button onClick={() => setInvoiceHeader({ ...invoiceHeader, status: 'PAID' })} className={`flex-1 py-2 text-xs font-bold transition ${invoiceHeader.status === 'PAID' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-50'}`}>CONTADO</button>
                      <button onClick={() => setInvoiceHeader({ ...invoiceHeader, status: 'PENDING' })} className={`flex-1 py-2 text-xs font-bold transition ${invoiceHeader.status === 'PENDING' ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-gray-50'}`}>CRÉDITO</button>
                    </div>
                  </div>
                  {invoiceHeader.status === 'PENDING' && (
                    <div className="animate-in fade-in">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Abono Inicial ($)</label>
                      <input type="number" className="w-full border rounded-lg p-2 mt-1 bg-white font-bold text-green-700" value={invoiceHeader.initialPayment || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, initialPayment: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                    </div>
                  )}
                </div>
              </div>

              {/* Historial de Proveedor */}
              {supplierCatalog.length > 0 && (
                <div className="border rounded-xl p-3 bg-gray-50">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-2 mb-2"><History size={12} /> Comprado anteriormente a {invoiceHeader.supplier}</h4>
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {supplierCatalog.map((item, idx) => (
                      <button key={idx} onClick={() => setTempItem({ sku: item.sku, name: item.name, quantity: 1, cost: item.lastCost, minStock: 5 })} className="flex-shrink-0 bg-white border hover:border-red-400 rounded-lg p-2 text-left min-w-[140px] shadow-sm transition active:scale-95 group">
                        <p className="text-[9px] text-gray-400 font-mono">{item.sku}</p>
                        <p className="text-xs font-bold text-gray-700 truncate w-32 group-hover:text-red-600">{item.name}</p>
                        <p className="text-[10px] text-green-600 font-bold">${item.lastCost}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sección 2: Carga de Productos */}
              <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2"><Package size={16} /> Agregar Ítem</h4>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Código / SKU</label><input className="w-full border rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-red-100 outline-none" placeholder="Escanear..." value={tempItem.sku} onChange={e => setTempItem({ ...tempItem, sku: e.target.value })} onBlur={handleSkuBlur} /></div>
                  <div className="md:col-span-2"><label className="text-[10px] font-bold text-gray-500 uppercase">Descripción</label><input className="w-full border rounded-lg p-2 text-sm bg-white" placeholder="Producto..." value={tempItem.name} onChange={e => setTempItem({ ...tempItem, name: e.target.value })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Cant.</label><input type="number" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-white" value={tempItem.quantity} onChange={e => setTempItem({ ...tempItem, quantity: parseFloat(e.target.value) || 0 })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Costo U. ($)</label><input type="number" step="0.01" className="w-full border rounded-lg p-2 text-sm text-right bg-white" value={tempItem.cost || ''} onChange={e => setTempItem({ ...tempItem, cost: parseFloat(e.target.value) || 0 })} /></div>
                  <div><label className="text-[10px] font-bold text-red-500 uppercase">Min. Stock</label><input type="number" className="w-full border rounded-lg p-2 text-sm text-center border-red-100 bg-white" value={tempItem.minStock} onChange={e => setTempItem({ ...tempItem, minStock: parseFloat(e.target.value) || 0 })} /></div>
                  <button onClick={addLineToInvoice} className="bg-gray-900 text-white p-2 rounded-lg font-bold hover:bg-black flex justify-center shadow-md active:scale-95 transition"><Plus size={20} /></button>
                </div>
              </div>

              {/* Tabla de ítems cargados */}
              <div className="border rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-bold"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Descripción</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-center text-red-500">Min</th><th className="p-3 text-right">Costo</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoiceItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs text-gray-500">{item.sku}</td>
                        <td className="p-3 font-medium text-gray-700">{item.name}</td>
                        <td className="p-3 text-center font-bold bg-gray-50">{item.quantity}</td>
                        <td className="p-3 text-center text-xs text-red-400 font-bold">{item.minStock}</td>
                        <td className="p-3 text-right">{formatCurrency(item.costUnitUSD, 'USD')}</td>
                        <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(item.quantity * item.costUnitUSD, 'USD')}</td>
                        <td className="p-3 text-center"><button onClick={() => setInvoiceItems(invoiceItems.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-600 transition"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    {invoiceItems.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">No has agregado productos a esta factura.</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Footer Total Factura */}
              <div className="flex justify-between items-center bg-gray-900 text-white p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Truck size={16} /> Flete Global ($):
                  <input type="number" className="w-24 bg-gray-800 border-none rounded p-1 font-bold text-white ml-2 text-right focus:ring-1 focus:ring-gray-500" value={invoiceHeader.freight || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, freight: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Factura</p>
                  <p className="text-3xl font-black text-white leading-none">
                    {formatCurrency(invoiceItems.reduce((a, b) => a + (b.quantity * b.costUnitUSD), 0) + invoiceHeader.freight, 'USD')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t bg-white flex justify-end gap-3">
              <button onClick={() => setIsInvoiceModalOpen(false)} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition">Cancelar</button>
              <button onClick={handleInvoiceSubmit} className="px-8 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 flex items-center gap-2 transition active:scale-95"><CheckCircle size={20} /> Procesar Compra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};