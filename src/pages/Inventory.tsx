/**
 * @file Inventory.tsx
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { exportToCSV } from '../utils/exportCSV';
import { supabase } from '../supabase/client';
import { printInventoryReportA4 } from '../utils/ticketGenerator';
import toast from 'react-hot-toast';
import {
  Search, Plus, Package, Edit, Trash2, FileText, X, CheckCircle,
  Truck, History, AlertTriangle, AlertOctagon, Save, Filter, Download, Upload, Zap, Printer, Wrench
} from 'lucide-react';
import type { Product, IncomingItem, Invoice, CostType, PaymentStatus } from '../types';

export const Inventory = () => {
  const { products, updateProduct, deleteProduct, addInvoice, addProduct, settings, suppliers } = useStore();
  const navigate = useNavigate();

  // Ajuste Manual state
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string; sku: string; stock: number } | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT' | 'SHRINKAGE'>('ADJUSTMENT');
  const [adjustReason, setAdjustReason] = useState('');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [csvPreview, setCsvPreview] = useState<Partial<typeof products[0]>[] | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // --- FILTROS DOBLES ---
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('Todos');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // --- ESTADOS UI DE CREACIÓN ELEGANTE ---
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingSupplierEdit, setIsAddingSupplierEdit] = useState(false);
  const [isAddingSupplierInvoice, setIsAddingSupplierInvoice] = useState(false);

  const initialInvoiceState = {
    number: '', supplier: '', dateIssue: new Date().toISOString().split('T')[0],
    dateDue: new Date().toISOString().split('T')[0], freight: 0, tax: 0, costType: 'BCV' as CostType,
    status: 'PENDING' as PaymentStatus, initialPayment: 0
  };
  const [invoiceHeader, setInvoiceHeader] = useState(initialInvoiceState);
  const [invoiceItems, setInvoiceItems] = useState<IncomingItem[]>([]);
  const [tempItem, setTempItem] = useState({ sku: '', name: '', quantity: 1, cost: 0, minStock: 0 });

  const initialProductState: Product = {
    id: '', sku: '', name: '', category: 'General', stock: 0, minStock: 0,
    cost: 0, freight: 0, costType: 'BCV', supplier: 'General'
  };
  const [productForm, setProductForm] = useState<Product>(initialProductState);

  const categories = useMemo(() => {
    const cats = products.map(p => p.category || 'General');
    return ['Todas', ...Array.from(new Set(cats))].sort();
  }, [products]);

  // Aplicación de ambos filtros
  const filteredProducts = products.filter(p => {
    const matchSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = selectedCategory === 'Todas' || (p.category || 'General') === selectedCategory;
    const matchSupplier = selectedSupplier === 'Todos' || (p.supplier || 'General') === selectedSupplier;
    return matchSearch && matchCategory && matchSupplier;
  });

  const supplierCatalog = useMemo(() => {
    if (!invoiceHeader.supplier) return [];
    const supplier = suppliers.find(s => s.name.toLowerCase() === invoiceHeader.supplier.toLowerCase());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return supplier ? ((supplier as any).catalog || []) as Array<{ sku: string; name: string; lastCost: number }> : [];
  }, [invoiceHeader.supplier, suppliers]);

  const handleScanInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const loadingToast = toast.loading("Analizando factura con Inteligencia Artificial...");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Str = (reader.result as string).split(',')[1];
          const mimeType = file.type;

          const { data, error } = await supabase.functions.invoke('process-invoice', {
            body: { imageBase64: base64Str, mimeType }
          });

          if (error) throw error;
          if (!data?.success) throw new Error(data?.error || "Error desconocido en el servidor");

          const invoiceData = data.data;

          setInvoiceHeader({
            ...invoiceHeader,
            number: invoiceData.number || '',
            supplier: invoiceData.supplierName || '',
            dateIssue: invoiceData.dateIssue || new Date().toISOString().split('T')[0],
            freight: invoiceData.freightTotalUSD || 0,
            tax: invoiceData.taxTotalUSD || 0
          });

          setInvoiceItems(invoiceData.items.map((item: { sku?: string; name?: string; quantity?: number | string; costUnitUSD?: number | string }) => ({
            id: Date.now().toString() + Math.random(),
            sku: item.sku || '',
            name: item.name || '',
            quantity: typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity || '1')) || 1,
            costUnitUSD: typeof item.costUnitUSD === 'number' ? item.costUnitUSD : parseFloat(String(item.costUnitUSD || '0')) || 0,
            minStock: 0
          })));

          toast.success("¡Factura extraída con éxito! ✨ Revisa los datos.");
        } catch (innerError: unknown) {
          toast.error("Error del modelo: " + (innerError as Error).message);
        } finally {
          setIsScanning(false);
          toast.dismiss(loadingToast);
        }
      };
    } catch (err: unknown) {
      toast.error("Error al procesar archivo: " + (err as Error).message);
      setIsScanning(false);
      toast.dismiss(loadingToast);
    } finally {
      e.target.value = ''; // clear input
    }
  };

  const handleInvoiceSubmit = async () => {
    if (!invoiceHeader.number || !invoiceHeader.supplier || invoiceItems.length === 0) {
      toast.error("⚠️ Faltan datos obligatorios (Proveedor, Número o Productos).");
      return;
    }

    const subtotal = invoiceItems.reduce((acc, i) => acc + (i.quantity * i.costUnitUSD), 0);
    const total = subtotal + invoiceHeader.freight + invoiceHeader.tax;
    let finalStatus: PaymentStatus = 'PENDING';
    const finalPaidAmount = invoiceHeader.initialPayment;

    if (invoiceHeader.status === 'PAID' || finalPaidAmount >= (total - 0.01)) finalStatus = 'PAID';
    else if (finalPaidAmount > 0) finalStatus = 'PARTIAL';

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`, number: invoiceHeader.number, supplier: invoiceHeader.supplier,
      dateIssue: invoiceHeader.dateIssue, dateDue: invoiceHeader.status === 'PAID' ? invoiceHeader.dateIssue : invoiceHeader.dateDue,
      status: finalStatus, costType: invoiceHeader.costType, items: invoiceItems, subtotalUSD: subtotal, freightTotalUSD: invoiceHeader.freight, taxTotalUSD: invoiceHeader.tax, totalUSD: total, paidAmountUSD: invoiceHeader.status === 'PAID' ? total : finalPaidAmount,
      payments: (invoiceHeader.status === 'PAID' || finalPaidAmount > 0) ? [{ id: Date.now().toString(), date: invoiceHeader.dateIssue, amountUSD: invoiceHeader.status === 'PAID' ? total : finalPaidAmount, method: 'Inicial', note: invoiceHeader.status === 'PAID' ? 'Pago de Contado' : 'Abono carga inicial' }] : []
    };

    const success = await addInvoice(newInvoice);
    if (success) { setIsInvoiceModalOpen(false); setInvoiceHeader(initialInvoiceState); setInvoiceItems([]); }
  };

  const addLineToInvoice = () => {
    if (!tempItem.sku || !tempItem.name || tempItem.cost <= 0) return alert("Completa los datos del ítem");
    setInvoiceItems([...invoiceItems, {
      id: Date.now().toString() + Math.random(), sku: tempItem.sku, name: tempItem.name, quantity: tempItem.quantity, costUnitUSD: tempItem.cost, minStock: tempItem.minStock
    }]);
    setTempItem({ sku: '', name: '', quantity: 1, cost: 0, minStock: 0 });
  };

  const handleInvoiceItemChange = (index: number, field: keyof IncomingItem, value: string | number) => {
    const newItems = [...invoiceItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setInvoiceItems(newItems);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setProductForm(product);
    setIsAddingCategory(false);
    setIsAddingSupplierEdit(false);
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

  const handleDelete = (id: string) => { if (window.confirm('¿Borrar producto del sistema?')) deleteProduct(id); };
  const handleSkuBlur = () => { const existing = products.find(p => p.sku === tempItem.sku); if (existing) { setTempItem({ ...tempItem, name: existing.name, cost: existing.cost, minStock: existing.minStock }); } };

  const handleExportCSV = () => {
    exportToCSV(
      filteredProducts.map(p => {
        const prices = calculatePrices(p, settings);
        return {
          sku: p.sku,
          nombre: p.name,
          categoria: p.category || 'General',
          proveedor: p.supplier || 'General',
          stock: p.stock,
          stock_min: p.minStock,
          costo_usd: p.cost + (p.freight || 0),
          pvp_usd: prices.finalPriceUSD,
          pvp_bs: prices.finalPriceVED,
          tipo_tasa: p.costType,
        };
      }),
      'inventario',
      [
        { key: 'sku', label: 'SKU' },
        { key: 'nombre', label: 'Nombre' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'stock', label: 'Stock Actual' },
        { key: 'stock_min', label: 'Stock Mínimo' },
        { key: 'costo_usd', label: 'Costo USD' },
        { key: 'pvp_usd', label: 'PVP USD' },
        { key: 'pvp_bs', label: 'PVP Bs' },
        { key: 'tipo_tasa', label: 'Tasa' },
      ]
    );
  };

  // #7 Importar productos desde CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
      if (lines.length < 2) return alert('El CSV debe tener encabezados y al menos una fila.');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const preview = lines.slice(1).map(line => {
        const vals = line.split(',');
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
        return {
          sku: row.sku || row.codigo || '',
          name: row.nombre || row.name || '',
          category: row.categoria || row.category || 'General',
          supplier: row.proveedor || row.supplier || '',
          stock: Number(row.stock) || 0,
          minStock: Number(row.stock_min || row.minstock || row.min_stock) || 0,
          cost: Number(row.costo_usd || row.cost || row.costo) || 0,
          freight: 0,
          costType: 'BCV' as const,
        };
      }).filter(r => r.sku && r.name);
      if (preview.length === 0) return alert('No se encontraron filas válidas (SKU y nombre son obligatorios).');
      setCsvPreview(preview);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!csvPreview) return;
    for (const p of csvPreview) {
      await addProduct({ ...p, id: crypto.randomUUID(), customMargin: undefined, customVAT: undefined } as typeof products[0]);
    }
    setCsvPreview(null);
    alert(`✅ ${csvPreview.length} producto(s) importados exitosamente.`);
  };

  const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 0));
  const outOfStock = products.filter(p => p.stock <= 0);

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full animate-in fade-in duration-300">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Inventario</h2>
          <p className="text-gray-500 font-medium">Gestión de existencias y costos</p>
        </div>
        <div className="flex flex-wrap overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto">
          <label
            className="px-4 py-3 bg-white border-2 border-dashed border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 font-bold flex justify-center items-center gap-2 transition cursor-pointer"
            title="Importar productos desde CSV"
          >
            <Upload size={18} /> Importar
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          </label>
          <button
            onClick={() => printInventoryReportA4(filteredProducts, settings.companyName || 'Glyph Core')}
            className="px-5 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold flex justify-center items-center gap-2 shadow-lg transition active:scale-95"
            title="Generar PDF A4"
          >
            <Printer size={18} /> Imprimir PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="px-5 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold flex justify-center items-center gap-2 shadow-lg transition active:scale-95"
          >
            <Download size={18} /> Exportar CSV
          </button>
          <button
            onClick={() => { setIsInvoiceModalOpen(true); setIsAddingSupplierInvoice(false); }}
            className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold flex justify-center items-center gap-2 shadow-lg hover:shadow-red-200 transition active:scale-95"
          >
            <FileText size={20} /> Cargar Compra
          </button>
        </div>
      </div>

      {/* ALERTAS DE STOCK */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {outOfStock.length > 0 && (
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); setSelectedSupplier('Todos'); }}
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-red-100 transition shadow-sm"
            >
              <AlertOctagon size={16} className="flex-shrink-0" />
              <span><strong>{outOfStock.length}</strong> producto{outOfStock.length !== 1 ? 's' : ''} agotado{outOfStock.length !== 1 ? 's' : ''}</span>
            </button>
          )}
          {lowStock.length > 0 && (
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); setSelectedSupplier('Todos'); }}
              className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-100 transition shadow-sm"
            >
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span><strong>{lowStock.length}</strong> producto{lowStock.length !== 1 ? 's' : ''} con stock bajo</span>
            </button>
          )}
          <div className="flex-1 bg-white border border-gray-100 rounded-xl px-4 py-2.5 text-xs text-gray-400 font-medium flex items-center">
            {outOfStock.map(p => p.name).concat(lowStock.map(p => p.name)).slice(0, 5).join(' • ')}
            {(outOfStock.length + lowStock.length) > 5 && ` … y ${(outOfStock.length + lowStock.length) - 5} más`}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* --- BARRA SUPERIOR CON FILTRO DOBLE --- */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Buscar por nombre o código..." className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition font-medium text-gray-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="relative w-full sm:w-48">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition font-bold text-gray-700 appearance-none cursor-pointer" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {/* FILTRO PROVEEDOR AQUÍ */}
            <div className="relative w-full sm:w-48">
              <Truck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-100 transition font-bold text-gray-700 appearance-none cursor-pointer" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
                <option value="Todos">Todos (Prov.)</option>
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-400 tracking-wider">
              <tr><th className="px-6 py-4">Producto</th><th className="px-6 py-4 text-center">Stock</th><th className="px-6 py-4 text-right">Costo ($)</th><th className="px-6 py-4 text-right text-orange-500" title="Precio base TH antes de la conversión">P. TH ($)</th><th className="px-6 py-4 text-right">PVP ($)</th><th className="px-6 py-4 text-right">PVP (Bs)</th><th className="px-6 py-4 text-center">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((product) => {
                const prices = calculatePrices(product, settings);
                const isOutOfStock = product.stock <= 0;
                const isLowStock = product.stock <= (product.minStock || 0);

                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isOutOfStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{isOutOfStock ? <AlertOctagon size={20} /> : <Package size={20} />}</div>
                        <div>
                          <p className={`font-bold ${isOutOfStock ? 'text-red-600' : 'text-gray-800'}`}>{product.name}</p>
                          <div className="flex gap-2 items-center mt-1">
                            <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
                            <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{product.category || 'General'}</span>
                            <span className="text-[9px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider truncate max-w-[100px]">{product.supplier || 'General'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${isOutOfStock ? 'bg-red-100 text-red-700' : isLowStock ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{product.stock}</span>
                        {isLowStock && !isOutOfStock && <span className="text-[9px] text-orange-500 font-bold flex items-center gap-1"><AlertTriangle size={8} /> Bajo</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{formatCurrency(product.cost + (product.freight || 0), 'USD')}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${product.costType === 'BCV' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{product.costType}</span>
                      </div>
                    </td>
                    {/* Precio TH: solo para productos con tasa Monitor */}
                    <td className="px-6 py-4 text-right">
                      {product.costType === 'TH' ? (
                        <span className="font-semibold text-orange-600" title="Precio base antes de conversión TH→BCV">
                          {formatCurrency(prices.basePrice, 'USD')}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-800">{formatCurrency(prices.finalPriceUSD, 'USD')}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-500 group-hover:text-red-600 transition-colors">
                      Bs. {prices.finalPriceVED.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => navigate(`/inventory/movements?product=${product.id}`)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Ver Movimientos"
                        >
                          <History size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setAdjustTarget({ id: product.id, name: product.name, sku: product.sku, stock: product.stock });
                            setAdjustQty(0);
                            setAdjustReason('');
                            setAdjustType('ADJUSTMENT');
                          }}
                          className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition"
                          title="Ajuste Manual"
                        >
                          <Wrench size={16} />
                        </button>
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
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-800">Editar Producto</h3><button onClick={() => setIsProductModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button></div>
            <form onSubmit={handleProductSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">SKU / Código</label><input required className="w-full border rounded-xl p-3 mt-1 font-mono text-sm bg-gray-50" value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre</label><input required className="w-full border rounded-xl p-3 mt-1" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} /></div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Categoría</label>
                  {isAddingCategory ? (
                    <div className="flex gap-2 mt-1 animate-in slide-in-from-top-1">
                      <input
                        autoFocus
                        className="w-full border rounded-xl p-3 bg-white outline-none focus:ring-2 focus:ring-red-100"
                        placeholder="Nueva categoría..."
                        value={productForm.category || ''}
                        onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                      />
                      <button type="button" onClick={() => { setIsAddingCategory(false); setProductForm({ ...productForm, category: '' }); }} className="bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 p-3 rounded-xl transition" title="Cancelar"><X size={20} /></button>
                    </div>
                  ) : (
                    <select
                      className="w-full border rounded-xl p-3 mt-1 bg-white outline-none focus:ring-2 focus:ring-red-100"
                      value={productForm.category || ''}
                      onChange={e => {
                        if (e.target.value === 'NEW') {
                          setProductForm({ ...productForm, category: '' });
                          setIsAddingCategory(true);
                        } else {
                          setProductForm({ ...productForm, category: e.target.value });
                        }
                      }}
                    >
                      <option value="" disabled>Seleccione...</option>
                      {categories.filter(c => c !== 'Todas').map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="NEW" className="font-bold text-red-600">➕ Crear Nueva Categoría...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Proveedor</label>
                  {isAddingSupplierEdit ? (
                    <div className="flex gap-2 mt-1 animate-in slide-in-from-top-1">
                      <input
                        autoFocus
                        className="w-full border rounded-xl p-3 bg-white outline-none focus:ring-2 focus:ring-red-100"
                        placeholder="Nuevo proveedor..."
                        value={productForm.supplier || ''}
                        onChange={e => setProductForm({ ...productForm, supplier: e.target.value })}
                      />
                      <button type="button" onClick={() => { setIsAddingSupplierEdit(false); setProductForm({ ...productForm, supplier: '' }); }} className="bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 p-3 rounded-xl transition" title="Cancelar"><X size={20} /></button>
                    </div>
                  ) : (
                    <select
                      className="w-full border rounded-xl p-3 mt-1 bg-white outline-none focus:ring-2 focus:ring-red-100"
                      value={productForm.supplier || ''}
                      onChange={e => {
                        if (e.target.value === 'NEW') {
                          setProductForm({ ...productForm, supplier: '' });
                          setIsAddingSupplierEdit(true);
                        } else {
                          setProductForm({ ...productForm, supplier: e.target.value });
                        }
                      }}
                    >
                      <option value="" disabled>Seleccione...</option>
                      {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      <option value="NEW" className="font-bold text-red-600">➕ Crear Nuevo Proveedor...</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div><label className="text-xs font-bold text-gray-500">Costo ($)</label><input type="number" step="0.01" className="w-full border rounded-xl p-2 mt-1" value={productForm.cost} onChange={e => setProductForm({ ...productForm, cost: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                <div><label className="text-xs font-bold text-gray-500">Flete Unit. ($)</label><input type="number" step="0.01" className="w-full border rounded-xl p-2 mt-1" value={productForm.freight} onChange={e => setProductForm({ ...productForm, freight: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                <div><label className="text-xs font-bold text-gray-500">Stock Actual</label><input type="number" className="w-full border rounded-xl p-2 mt-1" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                <div><label className="text-xs font-bold text-red-500">Alerta Mínima</label><input type="number" className="w-full border rounded-xl p-2 mt-1 border-red-100" value={productForm.minStock} onChange={e => setProductForm({ ...productForm, minStock: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1"><label className="text-xs font-bold text-gray-500 block mb-1">Tasa de Origen</label><div className="flex gap-2"><button type="button" onClick={() => setProductForm({ ...productForm, costType: 'BCV' })} className={`flex-1 py-2 rounded-lg font-bold text-xs ${productForm.costType === 'BCV' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-200' : 'bg-gray-100 text-gray-400'}`}>Tasa BCV</button><button type="button" onClick={() => setProductForm({ ...productForm, costType: 'TH' })} className={`flex-1 py-2 rounded-lg font-bold text-xs ${productForm.costType === 'TH' ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>Monitor</button></div></div>
                <div className="flex-1"><label className="text-xs font-bold text-gray-500 block mb-1">Margen Personalizado (%)</label><input type="number" className="w-full border rounded-xl p-2" placeholder="Usar Global" value={productForm.customMargin ?? ''} onChange={e => setProductForm({ ...productForm, customMargin: e.target.value === '' ? undefined : parseFloat(e.target.value) })} /></div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 flex items-center justify-center gap-2 shadow-lg"><Save size={18} /> Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CARGA FACTURA --- */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
              <div><h3 className="text-xl font-black text-gray-800 flex items-center gap-2"><Truck size={24} className="text-red-600" /> Cargar Compra</h3><p className="text-sm text-gray-500">Ingresa la mercancía y la deuda.</p></div>
              <div className="flex items-center gap-3">
                <label className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm ${isScanning ? 'bg-purple-100 text-purple-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-purple-200'}`}>
                  <Zap size={16} fill="currentColor" /> {isScanning ? 'Analizando...' : '✨ Escaneo IA'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleScanInvoice} disabled={isScanning} />
                </label>
                <button onClick={() => setIsInvoiceModalOpen(false)} className="bg-white p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition"><X size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h4 className="text-xs font-bold text-blue-800 uppercase mb-3 flex items-center gap-2"><FileText size={14} /> Datos del Documento</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nº Control</label><input required type="text" className="w-full border rounded-lg p-2 mt-1 font-bold bg-white" value={invoiceHeader.number} onChange={e => setInvoiceHeader({ ...invoiceHeader, number: e.target.value })} /></div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label>
                    {isAddingSupplierInvoice ? (
                      <div className="flex gap-2 mt-1 animate-in slide-in-from-top-1">
                        <input
                          autoFocus
                          className="w-full border rounded-lg p-2 font-bold bg-white outline-none focus:ring-2 focus:ring-red-100"
                          placeholder="Nuevo proveedor..."
                          value={invoiceHeader.supplier || ''}
                          onChange={e => setInvoiceHeader({ ...invoiceHeader, supplier: e.target.value })}
                        />
                        <button type="button" onClick={() => { setIsAddingSupplierInvoice(false); setInvoiceHeader({ ...invoiceHeader, supplier: '' }); }} className="bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 p-2 rounded-lg transition" title="Cancelar"><X size={20} /></button>
                      </div>
                    ) : (
                      <select
                        className="w-full border rounded-lg p-2 mt-1 bg-white font-bold outline-none focus:ring-2 focus:ring-red-100"
                        value={invoiceHeader.supplier || ''}
                        onChange={e => {
                          if (e.target.value === 'NEW') {
                            setInvoiceHeader({ ...invoiceHeader, supplier: '' });
                            setIsAddingSupplierInvoice(true);
                          } else {
                            setInvoiceHeader({ ...invoiceHeader, supplier: e.target.value });
                          }
                        }}
                      >
                        <option value="" disabled>Seleccionar...</option>
                        {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        {/* Si la IA escaneó un proveedor que no está en la base de datos, mostramos su texto como una opción válida temporalmente para evitar que el select devuelva un valor falso */}
                        {invoiceHeader.supplier && !suppliers.some(s => s.name === invoiceHeader.supplier) && invoiceHeader.supplier !== 'NEW' && invoiceHeader.supplier !== '' && (
                          <option value={invoiceHeader.supplier}>{invoiceHeader.supplier} (Escaneado IA)</option>
                        )}
                        <option value="NEW" className="text-red-600 font-bold">➕ Agregar Nuevo Proveedor...</option>
                      </select>
                    )}
                  </div>

                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Tasa de Costo</label><select className="w-full border rounded-lg p-2 mt-1 bg-white font-bold text-gray-700" value={invoiceHeader.costType} onChange={e => setInvoiceHeader({ ...invoiceHeader, costType: e.target.value as CostType })}><option value="BCV">Tasa BCV</option><option value="TH">Tasa Monitor</option></select></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-blue-100">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Fecha Emisión</label><input type="date" className="w-full border rounded-lg p-2 mt-1 bg-white" value={invoiceHeader.dateIssue} onChange={e => setInvoiceHeader({ ...invoiceHeader, dateIssue: e.target.value })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Condición</label><div className="flex bg-white rounded-lg border overflow-hidden mt-1 shadow-sm"><button onClick={() => setInvoiceHeader({ ...invoiceHeader, status: 'PAID' })} className={`flex-1 py-2 text-xs font-bold transition ${invoiceHeader.status === 'PAID' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-50'}`}>CONTADO</button><button onClick={() => setInvoiceHeader({ ...invoiceHeader, status: 'PENDING' })} className={`flex-1 py-2 text-xs font-bold transition ${invoiceHeader.status === 'PENDING' ? 'bg-red-100 text-red-700' : 'text-gray-400 hover:bg-gray-50'}`}>CRÉDITO</button></div></div>
                  {invoiceHeader.status === 'PENDING' && (
                    <><div className="animate-in fade-in"><label className="text-[10px] font-bold text-red-500 uppercase">Vencimiento</label><input type="date" className="w-full border rounded-lg p-2 mt-1 bg-white border-red-200" value={invoiceHeader.dateDue} onChange={e => setInvoiceHeader({ ...invoiceHeader, dateDue: e.target.value })} /></div><div className="animate-in fade-in"><label className="text-[10px] font-bold text-gray-500 uppercase">Abono Inicial ($)</label><input type="number" className="w-full border rounded-lg p-2 mt-1 bg-white font-bold text-green-700" value={invoiceHeader.initialPayment || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, initialPayment: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} placeholder="0.00" /></div></>
                  )}
                </div>
              </div>

              {supplierCatalog.length > 0 && (
                <div className="border rounded-xl p-3 bg-gray-50">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-2 mb-2"><History size={12} /> Comprado a {invoiceHeader.supplier}</h4>
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {supplierCatalog.map((item: { sku: string; name: string; lastCost: number }, idx: number) => (
                      <button key={idx} onClick={() => setTempItem({ sku: item.sku, name: item.name, quantity: 1, cost: item.lastCost, minStock: 0 })} className="flex-shrink-0 bg-white border hover:border-red-400 rounded-lg p-2 text-left min-w-[140px] shadow-sm transition active:scale-95 group"><p className="text-[9px] text-gray-400 font-mono">{item.sku}</p><p className="text-xs font-bold text-gray-700 truncate w-32 group-hover:text-red-600">{item.name}</p><p className="text-[10px] text-green-600 font-bold">${item.lastCost}</p></button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2"><Package size={16} /> Agregar Ítem</h4>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Código / SKU</label><input className="w-full border rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-red-100 outline-none" placeholder="Escanear..." value={tempItem.sku} onChange={e => setTempItem({ ...tempItem, sku: e.target.value })} onBlur={handleSkuBlur} /></div>
                  <div className="md:col-span-2"><label className="text-[10px] font-bold text-gray-500 uppercase">Descripción</label><input className="w-full border rounded-lg p-2 text-sm bg-white" placeholder="Producto..." value={tempItem.name} onChange={e => setTempItem({ ...tempItem, name: e.target.value })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Cant.</label><input type="number" className="w-full border rounded-lg p-2 text-sm text-center font-bold bg-white" value={tempItem.quantity} onChange={e => setTempItem({ ...tempItem, quantity: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-gray-500 uppercase">Costo U. ($)</label><input type="number" step="0.01" className="w-full border rounded-lg p-2 text-sm text-right bg-white" value={tempItem.cost || ''} onChange={e => setTempItem({ ...tempItem, cost: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                  <div><label className="text-[10px] font-bold text-red-500 uppercase">Min. Stock</label><input type="number" className="w-full border rounded-lg p-2 text-sm text-center border-red-100 bg-white" value={tempItem.minStock} onChange={e => setTempItem({ ...tempItem, minStock: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} /></div>
                  <button onClick={addLineToInvoice} className="bg-gray-900 text-white p-2 rounded-lg font-bold hover:bg-black flex justify-center shadow-md active:scale-95 transition"><Plus size={20} /></button>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-bold"><tr><th className="p-3 text-left">Código</th><th className="p-3 text-left">Descripción</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-center text-red-500">Min</th><th className="p-3 text-right">Costo</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoiceItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="p-3"><input className="w-full bg-transparent font-mono text-xs text-gray-500 outline-none" value={item.sku} onChange={e => handleInvoiceItemChange(idx, 'sku', e.target.value)} /></td>
                        <td className="p-3"><input className="w-full bg-transparent font-medium text-gray-700 outline-none focus:ring-1 rounded" value={item.name} onChange={e => handleInvoiceItemChange(idx, 'name', e.target.value)} /></td>
                        <td className="p-3"><input type="number" className="w-full border border-gray-200 rounded p-1 text-center font-bold bg-white" value={item.quantity} onChange={e => handleInvoiceItemChange(idx, 'quantity', e.target.value === '' ? ('' as any) : parseFloat(e.target.value))} /></td>
                        <td className="p-3 text-center text-xs text-red-400 font-bold">{item.minStock}</td>
                        <td className="p-3"><input type="number" step="0.01" className="w-full border border-gray-200 rounded p-1 text-right bg-white" value={item.costUnitUSD} onChange={e => handleInvoiceItemChange(idx, 'costUnitUSD', e.target.value === '' ? ('' as any) : parseFloat(e.target.value))} /></td>
                        <td className="p-3 text-right font-bold text-gray-900">{formatCurrency(item.quantity * item.costUnitUSD, 'USD')}</td>
                        <td className="p-3 text-center"><button onClick={() => setInvoiceItems(invoiceItems.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-600 transition"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    {invoiceItems.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">No has agregado productos a esta factura.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center bg-gray-900 text-white p-4 rounded-xl shadow-lg mt-4 flex-wrap gap-4">
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1"><Truck size={16} /> Flete: <input type="number" className="w-20 bg-gray-800 border-none rounded p-1 font-bold text-white text-right focus:ring-1 focus:ring-gray-500" value={invoiceHeader.freight || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, freight: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} placeholder="0.00" /></span>
                  <span className="flex items-center gap-1"><FileText size={16} /> IVA / Tax: <input type="number" className="w-20 bg-gray-800 border-none rounded p-1 font-bold text-white text-right focus:ring-1 focus:ring-gray-500" value={invoiceHeader.tax || ''} onChange={e => setInvoiceHeader({ ...invoiceHeader, tax: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })} placeholder="0.00" /></span>
                </div>
                <div className="text-right ml-auto">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Factura</p>
                  <p className="text-3xl font-black text-white leading-none">{formatCurrency(invoiceItems.reduce((a, b) => a + (b.quantity * b.costUnitUSD), 0) + invoiceHeader.freight + invoiceHeader.tax, 'USD')}</p>
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

      {/* MODAL PREVIEW IMPORTAR CSV */}
      {csvPreview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-xl text-blue-800 flex items-center gap-2"><Upload size={20} /> Preview de Importación</h3>
                <p className="text-sm text-blue-500">{csvPreview.length} producto(s) encontrados en el CSV</p>
              </div>
              <button onClick={() => setCsvPreview(null)} className="bg-white p-2 rounded-full text-gray-400 hover:text-red-500 transition shadow-sm"><X size={20} /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-right">Costo USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {csvPreview.map((p, i) => (
                    <tr key={i} className="hover:bg-blue-50">
                      <td className="px-4 py-2 font-mono text-gray-500">{p.sku}</td>
                      <td className="px-4 py-2 font-bold text-gray-800">{p.name}</td>
                      <td className="px-4 py-2 text-center">{p.stock}</td>
                      <td className="px-4 py-2 text-right font-bold text-green-600">${Number(p.cost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-5 border-t bg-gray-50 flex gap-3">
              <button onClick={() => setCsvPreview(null)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={confirmImport} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 transition">
                <CheckCircle size={18} /> Confirmar e Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: AJUSTE MANUAL DE STOCK --- */}
      {adjustTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <Wrench size={20} className="text-yellow-500" /> Ajuste Manual
              </h3>
              <button onClick={() => setAdjustTarget(null)} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="font-bold text-gray-800">{adjustTarget.name}</p>
              <p className="text-xs text-gray-400 font-mono">{adjustTarget.sku} · Stock actual: <strong>{adjustTarget.stock}</strong></p>
            </div>
            <div className="flex gap-2 mb-4">
              {(['ADJUSTMENT', 'SHRINKAGE'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setAdjustType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${adjustType === t ? (t === 'ADJUSTMENT' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-purple-500 text-white border-purple-500') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {t === 'ADJUSTMENT' ? '⚙️ Ajuste' : '🗑️ Merma'}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
                Cantidad — {adjustQty >= 0 ? 'Entrada (+)' : 'Salida (-)'}
              </label>
              <input
                type="number"
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-xl font-black text-center outline-none focus:border-yellow-400 transition"
                value={adjustQty}
                onChange={e => setAdjustQty(Number(e.target.value))}
                placeholder="0"
              />
              <p className="text-xs text-gray-400 mt-1 text-center">
                Nuevo stock: <strong>{adjustTarget.stock + adjustQty}</strong>
              </p>
            </div>
            <div className="mb-5">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Motivo <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-yellow-400 transition"
                placeholder="Ej: conteo físico, producto dañado..."
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdjustTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition">Cancelar</button>
              <button
                onClick={async () => {
                  if (!adjustReason.trim()) { toast.error('El motivo es obligatorio'); return; }
                  if (adjustQty === 0) { toast.error('La cantidad no puede ser 0'); return; }
                  const newStock = adjustTarget.stock + adjustQty;
                  if (newStock < 0) { toast.error('El stock no puede ser negativo'); return; }
                  await updateProduct(adjustTarget.id, {
                    stock: newStock,
                    adjustmentReason: adjustReason,
                  } as unknown as Partial<Parameters<typeof updateProduct>[1]>);
                  toast.success(`Stock ajustado: ${adjustTarget.stock} → ${newStock}`);
                  setAdjustTarget(null);
                }}
                className="flex-1 py-3 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 transition flex items-center justify-center gap-2"
              >
                <Save size={16} /> Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
