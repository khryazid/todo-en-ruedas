import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import {
  TrendingUp, Wallet, AlertTriangle, Clock,
  BarChart3, DollarSign, Package, Percent,
  Calendar, Filter, ShoppingBag, CreditCard, Users, ArrowRight, Snowflake, Flame
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Sale } from '../types';

type TimeRange = 'today' | 'week' | 'month' | 'custom';

export const Dashboard = () => {
  const { settings, products, invoices, sales } = useStore();
  const navigate = useNavigate();

  // Estado del Filtro
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- 1. UTILIDADES Y CÁLCULOS GENERALES ---
  const formatDate = (dateString: string) => {
    const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const todayString = new Date().toLocaleDateString('es-ES');
  const todaysSalesTotal = sales
    .filter(s => new Date(s.date).toLocaleDateString('es-ES') === todayString && s.status !== 'CANCELLED')
    .reduce((acc, s) => acc + s.totalUSD, 0);

  let inventoryCostUSD = 0;
  let inventorySalePotentialUSD = 0;
  products.forEach(product => {
    const prices = calculatePrices(product, settings);
    inventoryCostUSD += (product.cost + (product.freight || 0)) * product.stock;
    inventorySalePotentialUSD += prices.finalPriceUSD * product.stock;
  });
  const potentialProfit = inventorySalePotentialUSD - inventoryCostUSD;
  const marginPercentage = inventoryCostUSD > 0 ? (potentialProfit / inventorySalePotentialUSD) * 100 : 0;

  // Deudas
  const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);
  const todayDate = new Date();
  const dueInvoices = invoices.filter(inv => {
    if (inv.status === 'PAID') return false;
    const dueDate = new Date(inv.dateDue);
    return (dueDate.getMonth() === todayDate.getMonth() && dueDate.getFullYear() === todayDate.getFullYear()) || dueDate < todayDate;
  }).sort((a, b) => new Date(a.dateDue).getTime() - new Date(b.dateDue).getTime());
  const totalDueThisMonth = dueInvoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);

  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  // Tasas
  const brecha = settings.tasaBCV > 0 ? ((settings.tasaTH - settings.tasaBCV) / settings.tasaBCV) * 100 : 0;
  const brechaColor = brecha > 20 ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';

  // --- 2. ANALÍTICA INTELIGENTE ---
  const analyticsData = useMemo(() => {
    const activeSales = sales.filter(s => s.status !== 'CANCELLED');
    const now = new Date();
    let filteredSales: Sale[] = [];
    let chartData: { label: string, value: number, dateFull: string }[] = [];
    let rangeLabel = "";

    // --- FILTRADO ---
    if (timeRange === 'today') {
      rangeLabel = "Hoy";
      filteredSales = activeSales.filter(s => new Date(s.date).toLocaleDateString('es-ES') === now.toLocaleDateString('es-ES'));
      // NO generamos chartData aquí porque "Hoy" no usa gráfico de barras
    } else if (timeRange === 'week') {
      rangeLabel = "Última Semana";
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      filteredSales = activeSales.filter(s => new Date(s.date) >= sevenDaysAgo);

      const map = new Map<string, number>();
      filteredSales.forEach(s => {
        const d = new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
        map.set(d, (map.get(d) || 0) + s.totalUSD);
      });
      chartData = Array.from(map.entries()).map(([label, value]) => ({ label, value, dateFull: label }));
    } else if (timeRange === 'month') {
      rangeLabel = "Este Mes";
      filteredSales = activeSales.filter(s => {
        const d = new Date(s.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const map = new Map<string, number>();
      filteredSales.forEach(s => {
        const d = new Date(s.date).getDate().toString();
        map.set(d, (map.get(d) || 0) + s.totalUSD);
      });
      chartData = Array.from(map.entries()).map(([label, value]) => ({ label, value, dateFull: `Día ${label}` }));
    } else if (timeRange === 'custom') {
      rangeLabel = "Período Personalizado";
      const start = customStart ? new Date(customStart) : new Date(0);
      const end = customEnd ? new Date(customEnd) : new Date();
      end.setHours(23, 59, 59);
      filteredSales = activeSales.filter(s => { const d = new Date(s.date); return d >= start && d <= end; });

      const map = new Map<string, number>();
      filteredSales.forEach(s => {
        const label = new Date(s.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        map.set(label, (map.get(label) || 0) + s.totalUSD);
      });
      chartData = Array.from(map.entries()).map(([label, value]) => ({ label, value, dateFull: label }));
    }

    // --- ESTADÍSTICAS ---
    const totalRevenue = filteredSales.reduce((a, s) => a + s.totalUSD, 0);
    const ticketCount = filteredSales.length;
    const averageTicket = ticketCount > 0 ? totalRevenue / ticketCount : 0;

    // Desglose de Productos Vendidos en este periodo
    const productSalesCount: Record<string, number> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const key = item.sku || item.name;
        productSalesCount[key] = (productSalesCount[key] || 0) + item.quantity;
      });
    });

    // Top Productos del Periodo
    const topProducts = Object.entries(productSalesCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key, qty]) => {
        const prod = products.find(p => p.sku === key || p.name === key);
        return { name: prod ? prod.name : key, qty, stock: prod ? prod.stock : 0 };
      });

    // Productos Fríos (Global vs ventas del periodo)
    const coldProducts = products
      .filter(p => !productSalesCount[p.sku] && !productSalesCount[p.name] && p.stock > 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 5);

    // Desglose de Métodos de Pago
    const methodMap = new Map<string, number>();
    filteredSales.forEach(sale => {
      const method = sale.paymentMethod || 'Efectivo';
      methodMap.set(method, (methodMap.get(method) || 0) + sale.totalUSD);
    });
    const paymentMethodsStats = Array.from(methodMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([method, amount]) => ({ method, amount }));

    const maxChartValue = Math.max(...chartData.map(d => d.value), 1);

    return { totalRevenue, ticketCount, averageTicket, chartData, maxChartValue, topProducts, coldProducts, paymentMethodsStats, rangeLabel };
  }, [sales, timeRange, customStart, customEnd, products]);

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 bg-gray-50 min-h-screen w-full">

      {/* 1. ENCABEZADO Y TASAS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div><h2 className="text-2xl font-bold text-gray-800">Centro de Control</h2><p className="text-gray-500">Resumen operativo del negocio.</p></div>
        <div className="flex items-center bg-white p-2 rounded-xl border border-gray-200 shadow-sm gap-4 divide-x divide-gray-100 w-full md:w-auto justify-between md:justify-start">
          <div className="px-4 text-center"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa BCV</p><p className="text-lg font-bold text-gray-800">Bs. {settings.tasaBCV.toFixed(2)}</p></div>
          {settings.showMonitorRate && (
            <>
              <div className="px-4 text-center"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monitor</p><p className="text-lg font-bold text-gray-600">Bs. {settings.tasaTH.toFixed(2)}</p></div>
              <div className={`px-4 text-center rounded-lg py-1 ${brechaColor}`}><p className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"><Percent size={10} /> Brecha</p><p className="text-lg font-bold">{brecha.toFixed(2)}%</p></div>
            </>
          )}
        </div>
      </div>

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Caja Hoy</p><h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(todaysSalesTotal, 'USD')}</h3></div><div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><DollarSign size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Deuda Global</p><h3 className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebt, 'USD')}</h3><Link to="/invoices" className="text-xs text-red-400 font-bold mt-2 block hover:underline">Ver facturas &rarr;</Link></div><div className="p-3 bg-red-50 text-red-600 rounded-xl"><Wallet size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inventario (Costo)</p><h3 className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(inventoryCostUSD, 'USD')}</h3><Link to="/inventory" className="text-xs text-purple-500 font-bold mt-2 block hover:underline">Ver inventario &rarr;</Link></div><div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Package size={24} /></div></div></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ganancia Est.</p><h3 className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(potentialProfit, 'USD')}</h3><p className="text-xs text-gray-400 font-bold">{marginPercentage.toFixed(0)}% Margen</p></div><div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div></div></div>
      </div>

      {/* 3. ANALÍTICA DE VENTAS (CONDICIONAL: HOY = DETALLE / SEMANA = GRÁFICO) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">

        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-gray-100 pb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg"><BarChart3 size={24} className="text-blue-600" /> Analítica: <span className="text-blue-600 underline">{analyticsData.rangeLabel}</span></h3>

          <div className="flex flex-col md:flex-row gap-2 items-center">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setTimeRange('today')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'today' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Hoy</button>
              <button onClick={() => setTimeRange('week')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'week' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Semana</button>
              <button onClick={() => setTimeRange('month')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'month' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Mes</button>
              <button onClick={() => setTimeRange('custom')} className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center gap-1 ${timeRange === 'custom' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Filter size={12} /> Personalizado</button>
            </div>
            {timeRange === 'custom' && (
              <div className="flex items-center gap-2 bg-blue-50 p-1.5 rounded-xl border border-blue-100">
                <input type="date" className="bg-white border-none rounded-lg px-2 py-1 text-xs font-bold text-gray-600 outline-none" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <ArrowRight size={12} className="text-blue-400" />
                <input type="date" className="bg-white border-none rounded-lg px-2 py-1 text-xs font-bold text-gray-600 outline-none" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* CONTENIDO CAMBIANTE SEGÚN FILTRO */}
        {timeRange === 'today' ? (
          // --- VISTA HOY: DETALLE (SIN GRÁFICO) ---
          <div className="animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-4">
                <div className="p-3 bg-white text-blue-600 rounded-full shadow-sm"><DollarSign size={20} /></div>
                <div><p className="text-xs text-blue-500 font-bold uppercase">Venta Hoy</p><p className="text-2xl font-black text-gray-800">{formatCurrency(analyticsData.totalRevenue, 'USD')}</p></div>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex items-center gap-4">
                <div className="p-3 bg-white text-purple-600 rounded-full shadow-sm"><Users size={20} /></div>
                <div><p className="text-xs text-purple-500 font-bold uppercase">Tickets</p><p className="text-2xl font-black text-gray-800">{analyticsData.ticketCount}</p></div>
              </div>
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-center gap-4">
                <div className="p-3 bg-white text-green-600 rounded-full shadow-sm"><Percent size={20} /></div>
                <div><p className="text-xs text-green-500 font-bold uppercase">Ticket Prom.</p><p className="text-2xl font-black text-gray-800">{formatCurrency(analyticsData.averageTicket, 'USD')}</p></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-gray-100 rounded-xl p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm uppercase"><CreditCard size={16} className="text-green-600" /> Desglose Pagos (Hoy)</h4>
                {analyticsData.paymentMethodsStats.length === 0 ? <p className="text-xs text-gray-400 italic">Sin pagos.</p> :
                  <ul className="space-y-2">{analyticsData.paymentMethodsStats.map((m, i) => (
                    <li key={i} className="flex justify-between items-center text-sm border-b border-gray-50 pb-1"><span className="text-gray-600">{m.method}</span><span className="font-bold text-gray-900">{formatCurrency(m.amount, 'USD')}</span></li>
                  ))}</ul>
                }
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2 text-sm uppercase"><ShoppingBag size={16} className="text-orange-600" /> Vendido Hoy</h4>
                {analyticsData.topProducts.length === 0 ? <p className="text-xs text-gray-400 italic">Sin salidas.</p> :
                  <ul className="space-y-2">{analyticsData.topProducts.map((p, i) => (
                    <li key={i} className="flex justify-between items-center text-sm"><span className="text-gray-600 truncate max-w-[70%]">{p.name}</span><span className="font-bold bg-orange-100 text-orange-800 px-2 rounded text-xs">{p.qty}</span></li>
                  ))}</ul>
                }
              </div>
            </div>
          </div>
        ) : (
          // --- VISTA PERIODO: GRÁFICO ---
          <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl mb-4">
              <div><p className="text-xs text-gray-500 uppercase font-bold">Total Facturado</p><p className="text-2xl font-black text-gray-800">{formatCurrency(analyticsData.totalRevenue, 'USD')}</p></div>
              <div className="text-right"><p className="text-xs text-gray-500 uppercase font-bold">Promedio Diario</p><p className="text-lg font-bold text-blue-600">{formatCurrency(analyticsData.ticketCount > 0 ? analyticsData.totalRevenue / analyticsData.chartData.length : 0, 'USD')}</p></div>
            </div>
            <div className="h-48 flex items-end gap-2 md:gap-4 pb-2 border-b border-gray-100 overflow-x-auto custom-scrollbar px-2">
              {analyticsData.chartData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2"><BarChart3 size={32} className="opacity-20" /><p className="text-sm font-medium">Sin datos en este rango</p></div>
              ) : (
                analyticsData.chartData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full group relative min-w-[30px]">
                    <div className="w-full bg-blue-500 rounded-t-sm relative transition-all duration-500 group-hover:bg-blue-600 shadow-sm" style={{ height: `${(d.value / analyticsData.maxChartValue) * 100}%`, minHeight: '4px' }}>
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-20 shadow-xl pointer-events-none">
                        {d.dateFull} • {formatCurrency(d.value, 'USD')}
                      </div>
                    </div>
                    <p className="text-center text-[9px] text-gray-400 mt-2 uppercase font-bold truncate">{d.label}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. SECCIÓN NUEVA: ANÁLISIS DE INVENTARIO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg mb-6"><ShoppingBag size={24} className="text-purple-600" /> ANÁLISIS DE INVENTARIO</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* 4.1. TOP VENTAS (Del periodo seleccionado) */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-orange-50 p-3 border-b border-orange-100 flex justify-between items-center">
              <h4 className="font-bold text-orange-800 flex items-center gap-2"><Flame size={18} /> Top Más Vendidos</h4>
              <span className="text-[10px] text-orange-600 font-bold bg-white px-2 py-1 rounded-lg shadow-sm">En este periodo</span>
            </div>
            <div className="p-2">
              {analyticsData.topProducts.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm italic">No hubo ventas.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {analyticsData.topProducts.map((p, i) => (
                    <li key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>#{i + 1}</span>
                        <div><p className="text-sm font-bold text-gray-800 leading-tight">{p.name}</p><p className="text-[10px] text-gray-400">Stock actual: {p.stock}</p></div>
                      </div>
                      <span className="font-bold text-gray-900 bg-white border border-gray-200 px-2 py-1 rounded-md text-xs shadow-sm">{p.qty} un.</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 4.2. PRODUCTOS FRÍOS */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-blue-50 p-3 border-b border-blue-100 flex justify-between items-center">
              <h4 className="font-bold text-blue-800 flex items-center gap-2"><Snowflake size={18} /> Productos Fríos (Huesos)</h4>
              <span className="text-[10px] text-blue-600 font-bold bg-white px-2 py-1 rounded-lg shadow-sm">Con stock • Sin venta</span>
            </div>
            <div className="p-2">
              {analyticsData.coldProducts.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm italic">¡Todo se está moviendo! 🚀</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {analyticsData.coldProducts.map((p, i) => (
                    <li key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition group cursor-pointer" title="Sugerencia: Crear Promoción">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-1.5 rounded-lg text-blue-500"><AlertTriangle size={14} /></div>
                        <div><p className="text-sm font-bold text-gray-700 leading-tight">{p.name}</p><p className="text-[10px] text-gray-400 font-mono">{p.sku}</p></div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-red-500">{p.stock} un. paradas</p>
                        <p className="text-[10px] text-gray-400 group-hover:text-blue-600 group-hover:underline">¡Rematar!</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. SECCIONES INFERIORES (ALERTAS Y DEUDAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Clock size={20} className="text-orange-500" /> Compromisos del Mes</h3><span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full">Total: {formatCurrency(totalDueThisMonth, 'USD')}</span></div>
          {dueInvoices.length === 0 ? (<div className="p-4 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">¡Todo al día este mes! ✅</div>) : (<div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">{dueInvoices.map(inv => { const invDate = new Date(inv.dateDue); const isOverdue = invDate < todayDate; return (<div key={inv.id} onClick={() => navigate('/invoices', { state: { openInvoiceId: inv.id } })} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition cursor-pointer group"><div><p className="font-bold text-gray-800 text-xs group-hover:text-blue-700">{inv.supplier}</p><p className={`text-[10px] font-bold flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-orange-500'}`}>{isOverdue ? <AlertTriangle size={10} /> : <Calendar size={10} />} {isOverdue ? 'VENCIDA: ' : 'Vence: '} {formatDate(inv.dateDue)}</p></div><div className="text-right"><p className="font-bold text-gray-900 text-sm group-hover:text-blue-700">{formatCurrency(inv.totalUSD - inv.paidAmountUSD, 'USD')}</p><p className="text-[9px] text-gray-400 font-mono">#{inv.number}</p></div></div>); })}</div>)}
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-800 flex items-center gap-2"><AlertTriangle size={20} className="text-red-500" /> Stock Bajo</h3><span className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded-full font-bold">{lowStockProducts.length}</span></div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">{lowStockProducts.length === 0 ? (<p className="text-center text-gray-400 text-sm py-10">Inventario sano 📦</p>) : (lowStockProducts.map(p => (<div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"><div className={`w-1.5 h-8 rounded-full ${p.stock === 0 ? 'bg-red-500' : 'bg-orange-400'}`}></div><div className="flex-1 min-w-0"><p className="text-xs font-bold text-gray-700 truncate">{p.name}</p><p className="text-[10px] text-gray-400">Min: {p.minStock}</p></div><div className="text-right"><span className={`text-sm font-bold ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>{p.stock}</span></div></div>)))}</div>
        </div>
      </div>
    </div>
  );
};