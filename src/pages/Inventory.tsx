import { useState } from 'react';
import { useStore } from '../store/useStore';
import { calculatePrices, formatCurrency } from '../utils/pricing';
import {
  Plus, Search, Trash2, Package, Truck,
  FileText, Calendar, Building2, Save, ShoppingBag, DollarSign,
  Edit, X
} from 'lucide-react';
import type { IncomingItem, PaymentStatus, CostType, Product } from '../types';

export const Inventory = () => {
  const { products, suppliers, settings, addInvoice, deleteProduct, updateProduct } = useStore();

  const [activeTab, setActiveTab] = useState<'view' | 'invoice'>('view');
  const [searchTerm, setSearchTerm] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [invoiceHeader, setInvoiceHeader] = useState({
    supplier: '',
    number: '',
    dateIssue: new Date().toISOString().split('T')[0],
    dateDue: '',
    status: 'PENDING' as PaymentStatus,
    costType: 'BCV' as CostType,
    freightTotal: 0,
  });

  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    quantity: 1,
    costUnitUSD: 0,
    minStock: 5, // Valor por defecto visual
  });

  const [incomingItems, setIncomingItems] = useState<IncomingItem[]>([]);

  const currentSupplier = suppliers.find(s => s.name === invoiceHeader.supplier);

  const handleSelectCatalogItem = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sku = e.target.value;
    if (!sku || !currentSupplier) return;
    const catalogItem = currentSupplier.catalog.find(i => i.sku === sku);
    if (catalogItem) {
      setNewItem({ ...newItem, sku: catalogItem.sku, name: catalogItem.name, costUnitUSD: catalogItem.lastCost });
    }
  };

  const handleEditClick = (product: Product) => { setEditingProduct(product); setIsEditModalOpen(true); };
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct) { updateProduct(editingProduct.id, editingProduct); setIsEditModalOpen(false); setEditingProduct(null); }
  };

  const handleAddItem = () => {
    if (!newItem.sku || !newItem.name || newItem.costUnitUSD <= 0) return;
    setIncomingItems([...incomingItems, { ...newItem, id: Date.now().toString() }]);
    // Reset, manteniendo un minStock por defecto razonable
    setNewItem({ sku: '', name: '', quantity: 1, costUnitUSD: 0, minStock: 5 });
    document.getElementById('input-sku')?.focus();
  };

  const removeIncomingItem = (id: string) => { setIncomingItems(incomingItems.filter(i => i.id !== id)); };

  const handleProcessInvoice = () => {
    if (!invoiceHeader.supplier || incomingItems.length === 0) { alert("Faltan datos."); return; }
    const subtotal = incomingItems.reduce((acc, item) => acc + (item.quantity * item.costUnitUSD), 0);
    const total = subtotal + invoiceHeader.freightTotal;

    addInvoice({
      id: Date.now().toString(),
      ...invoiceHeader,
      items: incomingItems,
      subtotalUSD: subtotal,
      freightTotalUSD: invoiceHeader.freightTotal,
      totalUSD: total,
      paidAmountUSD: invoiceHeader.status === 'PAID' ? total : 0,
      payments: []
    });
    alert("¡Factura procesada!");
    setIncomingItems([]);
    setInvoiceHeader({ ...invoiceHeader, number: '', freightTotal: 0 });
    setActiveTab('view');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.supplier && p.supplier.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-8 space-y-6 ml-64 bg-gray-50 min-h-screen relative">
      <div className="flex justify-between items-center mb-6">
        <div><h2 className="text-2xl font-bold text-gray-800">Gestión de Inventario</h2><p className="text-gray-500">Administra productos y compras</p></div>
        <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
          <button onClick={() => setActiveTab('view')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'view' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}><Package size={18} /> Inventario</button>
          <button onClick={() => setActiveTab('invoice')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${activeTab === 'invoice' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><FileText size={18} /> Cargar Factura</button>
        </div>
      </div>

      {activeTab === 'view' && (
        <>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} /><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500"><tr><th className="px-6 py-4">Producto</th><th className="px-6 py-4">Stock</th><th className="px-6 py-4">Costos</th><th className="px-6 py-4 text-right">PVP (USD)</th><th className="px-6 py-4 text-center">Acciones</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{filteredProducts.map((product) => { const prices = calculatePrices(product, settings); return (<tr key={product.id} className="hover:bg-gray-50"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="p-2 bg-gray-100 rounded-lg text-gray-400"><Package size={20} /></div><div><p className="font-bold text-gray-800">{product.name}</p><p className="text-xs text-gray-400 font-mono">SKU: {product.sku}</p>{product.supplier && <p className="text-[10px] text-blue-500 font-medium flex items-center gap-1 mt-1"><Building2 size={10} /> {product.supplier}</p>}</div></div></td><td className="px-6 py-4 font-bold text-gray-700">{product.stock}</td><td className="px-6 py-4 text-xs"><div className="font-bold text-gray-800 flex items-center gap-1">${(product.cost + (product.freight || 0)).toFixed(2)}{settings.showMonitorRate && <span className={`px-1 rounded text-[10px] ${product.costType === 'BCV' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{product.costType}</span>}</div><div className="text-gray-400">Base: ${product.cost} + Flete: ${product.freight?.toFixed(2)}</div></td><td className="px-6 py-4 text-right font-bold text-gray-800">{formatCurrency(prices.finalPriceUSD, 'USD')}</td><td className="px-6 py-4 text-center"><div className="flex justify-center gap-2"><button onClick={() => handleEditClick(product)} className="text-gray-400 hover:text-blue-500 transition"><Edit size={18} /></button><button onClick={() => { if (window.confirm('¿Seguro?')) deleteProduct(product.id) }} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={18} /></button></div></td></tr>); })}</tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'invoice' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proveedor</label><div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input list="suppliers-list" type="text" placeholder="Buscar o crear..." className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={invoiceHeader.supplier} onChange={e => setInvoiceHeader({ ...invoiceHeader, supplier: e.target.value })} /><datalist id="suppliers-list">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist></div></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nº Factura</label><input type="text" className="w-full px-4 py-2 border rounded-lg" value={invoiceHeader.number} onChange={e => setInvoiceHeader({ ...invoiceHeader, number: e.target.value })} /></div></div>
            <div className="space-y-4"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Emisión</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="date" className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={invoiceHeader.dateIssue} onChange={e => setInvoiceHeader({ ...invoiceHeader, dateIssue: e.target.value })} /></div></div>{settings.showMonitorRate && (<div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Moneda</label><div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><select className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={invoiceHeader.costType} onChange={e => setInvoiceHeader({ ...invoiceHeader, costType: e.target.value as CostType })}><option value="BCV">BCV</option><option value="TH">TH</option></select></div></div>)}</div>
            <div className="space-y-4"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estado</label><select className="w-full px-4 py-2 border rounded-lg outline-none" value={invoiceHeader.status} onChange={e => setInvoiceHeader({ ...invoiceHeader, status: e.target.value as PaymentStatus })}><option value="PAID">Pagada</option><option value="PENDING">Pendiente</option></select></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Flete ($)</label><div className="relative"><Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="number" className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={invoiceHeader.freightTotal || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, freightTotal: parseFloat(e.target.value) || 0 })} /></div></div></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
            <div className="p-6 bg-gray-50 border-r border-gray-100 md:w-1/3 space-y-4">
              <div className="flex justify-between items-center"><h3 className="font-bold text-gray-700 flex items-center gap-2"><ShoppingBag size={20} /> Nuevo Ítem</h3>{currentSupplier && currentSupplier.catalog.length > 0 && (<div className="relative"><select className="bg-blue-50 text-blue-600 text-xs font-bold py-1 px-2 rounded-lg border-none outline-none cursor-pointer max-w-[150px]" onChange={handleSelectCatalogItem} defaultValue=""><option value="" disabled>📂 Historial</option>{currentSupplier.catalog.map(item => (<option key={item.sku} value={item.sku}>{item.name}</option>))}</select></div>)}</div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">SKU</label><input id="input-sku" type="text" className="w-full border p-2 rounded-lg" value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Descripción</label><input type="text" className="w-full border p-2 rounded-lg" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Cant.</label><input type="number" className="w-full border p-2 rounded-lg" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Costo ($)</label><input type="number" step="0.01" className="w-full border p-2 rounded-lg" value={newItem.costUnitUSD || ''} onChange={e => setNewItem({ ...newItem, costUnitUSD: parseFloat(e.target.value) || 0 })} /></div>
              </div>

              {/* CAMPO NUEVO: MÍNIMO DE ALERTA */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mín. Alerta (Opcional)</label>
                <input
                  type="number" className="w-full border p-2 rounded-lg"
                  placeholder="Ej: 5"
                  value={newItem.minStock}
                  onChange={e => setNewItem({ ...newItem, minStock: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <button onClick={handleAddItem} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"><Plus size={20} /> Agregar</button>
            </div>
            <div className="flex-1 overflow-x-auto"><table className="w-full text-left text-sm text-gray-600"><thead className="bg-white border-b border-gray-100 text-xs uppercase font-semibold text-gray-500"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Desc.</th><th className="px-4 py-3">Cant.</th><th className="px-4 py-3">Costo</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-gray-50">{incomingItems.map(item => (<tr key={item.id}><td className="px-4 py-3 font-mono text-xs">{item.sku}</td><td className="px-4 py-3">{item.name}</td><td className="px-4 py-3 font-bold">{item.quantity}</td><td className="px-4 py-3">${item.costUnitUSD.toFixed(2)}</td><td className="px-4 py-3"><button onClick={() => removeIncomingItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>))}</tbody></table></div>
          </div>
          <div className="flex justify-end pt-4"><button onClick={handleProcessInvoice} disabled={incomingItems.length === 0} className="px-8 py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 flex items-center gap-3 disabled:bg-gray-300"><Save size={24} /> Procesar Factura</button></div>
        </div>
      )}

      {/* MODAL EDICIÓN CON CAMPO MIN. STOCK */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50"><h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Edit size={20} className="text-blue-600" /> Editar Producto</h3><button onClick={() => setIsEditModalOpen(false)}><X size={24} className="text-gray-400" /></button></div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4"><div className="col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">SKU</label><input type="text" className="w-full border p-2 rounded-lg bg-gray-50" value={editingProduct.sku} onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })} /></div><div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label><input type="text" className="w-full border p-2 rounded-lg font-bold" value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} /></div></div>

              {/* FILA DE STOCK Y MÍNIMO */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Stock</label><input type="number" className="w-full border p-2 rounded-lg font-bold text-blue-600" value={editingProduct.stock} onChange={e => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Mín. Alerta</label><input type="number" className="w-full border p-2 rounded-lg" value={editingProduct.minStock} onChange={e => setEditingProduct({ ...editingProduct, minStock: Number(e.target.value) })} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Costo Base ($)</label><input type="number" step="0.01" className="w-full border p-2 rounded-lg" value={editingProduct.cost} onChange={e => setEditingProduct({ ...editingProduct, cost: Number(e.target.value) })} /></div>
              </div>

              <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancelar</button><button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Guardar</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};