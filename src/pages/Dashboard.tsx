import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import {
  TrendingUp, Wallet, AlertTriangle, Clock,
  BarChart3, DollarSign, Package,
  RefreshCw, Percent
} from 'lucide-react';

export const Dashboard = () => {
  const { settings, products, invoices } = useStore();

  const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);

  let inventoryCostUSD = 0;
  let inventorySalePotentialUSD = 0;

  products.forEach(product => {
    const prices = calculatePrices(product, settings);
    inventoryCostUSD += (product.cost + (product.freight || 0)) * product.stock;
    inventorySalePotentialUSD += prices.finalPriceUSD * product.stock;
  });

  const potentialProfit = inventorySalePotentialUSD - inventoryCostUSD;
  const marginPercentage = inventoryCostUSD > 0 ? (potentialProfit / inventorySalePotentialUSD) * 100 : 0;
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  const today = new Date();
  const dueInvoices = invoices.filter(inv => {
    if (inv.status === 'PAID') return false;
    const dueDate = new Date(inv.dateDue);
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  });

  const brecha = settings.tasaBCV > 0
    ? ((settings.tasaTH - settings.tasaBCV) / settings.tasaBCV) * 100
    : 0;
  const brechaColor = brecha > 20 ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';
  const dailySales = 0;

  return (
    <div className="p-8 space-y-8 ml-64 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div><h2 className="text-2xl font-bold text-gray-800">Centro de Control</h2><p className="text-gray-500">Resumen financiero y operativo.</p></div>
        <div className="flex items-center bg-white p-2 rounded-xl border border-gray-200 shadow-sm gap-4 divide-x divide-gray-100">
          <div className="px-4 text-center"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa BCV</p><p className="text-lg font-bold text-gray-800">Bs. {settings.tasaBCV.toFixed(2)}</p></div>
          {settings.showMonitorRate && (<><div className="px-4 text-center"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monitor</p><p className="text-lg font-bold text-gray-600">Bs. {settings.tasaTH.toFixed(2)}</p></div><div className={`px-4 text-center rounded-lg py-1 ${brechaColor}`}><p className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"><Percent size={10} /> Brecha</p><p className="text-lg font-bold">{brecha.toFixed(2)}%</p></div></>)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ventas de Hoy</p><h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(dailySales, 'USD')}</h3></div><div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><DollarSign size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Por Pagar</p><h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalDebt, 'USD')}</h3></div><div className="p-3 bg-red-50 text-red-600 rounded-xl"><Wallet size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inventario</p><h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(inventoryCostUSD, 'USD')}</h3></div><div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Package size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ganancia</p><h3 className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(potentialProfit, 'USD')}</h3><p className="text-xs text-gray-400 mt-2 font-bold">{marginPercentage.toFixed(1)}%</p></div><div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div></div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-center mb-6"><h3 className="font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={20} className="text-gray-400" /> Flujo de Caja</h3></div><div className="h-48 flex items-end justify-between gap-2 px-2 border-b border-gray-100 pb-2">{[40, 65, 30, 80, 55, 90, 45].map((height, i) => (<div key={i} className="w-full bg-gray-50 rounded-t-lg relative group overflow-hidden"><div className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg" style={{ height: `${height}%` }}></div></div>))}</div></div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Clock size={20} className="text-orange-500" /> Facturas Próximas a Vencer</h3>{dueInvoices.length === 0 ? (<div className="p-4 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">Todo al día.</div>) : (<div className="space-y-3">{dueInvoices.map(inv => (<div key={inv.id} className="flex justify-between items-center p-4 border border-gray-100 rounded-xl hover:bg-red-50 transition-colors"><div><p className="font-bold text-gray-800 text-sm">{inv.supplier}</p><p className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertTriangle size={10} /> Vence: {inv.dateDue}</p></div><div className="text-right"><p className="font-bold text-gray-900">{formatCurrency(inv.totalUSD - inv.paidAmountUSD, 'USD')}</p></div></div>))}</div>)}</div>
        </div>
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-800 flex items-center gap-2"><AlertTriangle size={20} className="text-red-500" /> Stock Bajo</h3><span className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded-full font-bold">{lowStockProducts.length}</span></div><div className="space-y-3 max-h-[400px] overflow-y-auto">{lowStockProducts.map(p => (<div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"><div className="flex-1"><p className="text-xs font-bold text-gray-700">{p.name}</p></div><div className="text-right"><span className="text-sm font-bold text-red-600">{p.stock}</span></div></div>))}</div></div>
          <div className="bg-gray-900 p-6 rounded-2xl shadow-lg text-white"><h3 className="font-bold mb-2 flex items-center gap-2"><RefreshCw size={18} className="text-blue-400" /> Operaciones</h3><div className="grid grid-cols-2 gap-3"><button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold flex flex-col items-center gap-2"><TrendingUp size={18} className="text-green-400" /> Ver Ventas</button><button className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold flex flex-col items-center gap-2"><DollarSign size={18} className="text-yellow-400" /> Cerrar Caja</button></div></div>
        </div>
      </div>
    </div>
  );
};