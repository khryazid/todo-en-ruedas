/**
 * @file Dashboard.tsx
 * @description Panel de Control Principal.
 * Muestra KPIs críticos: Ventas del día, Deudas por pagar, Valor del Inventario y Alertas de Stock.
 */

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

  // --- ESTADOS LOCALES ---
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- 1. CÁLCULOS DE NEGOCIO (KPIs) ---

  // A. Ventas de Hoy (Caja Rápida)
  const todayString = new Date().toLocaleDateString('es-ES');
  const todaysSalesTotal = sales
    .filter(s => new Date(s.date).toLocaleDateString('es-ES') === todayString && s.status !== 'CANCELLED')
    .reduce((acc, s) => acc + s.totalUSD, 0);

  // B. Valoración de Inventario (Costo vs Venta Potencial)
  let inventoryCostUSD = 0;
  let inventorySalePotentialUSD = 0;

  products.forEach(product => {
    const prices = calculatePrices(product, settings);
    // Costo total invertido (Stock * Costo Unitario)
    inventoryCostUSD += (product.cost + (product.freight || 0)) * product.stock;
    // Venta total potencial (Stock * PVP)
    inventorySalePotentialUSD += prices.finalPriceUSD * product.stock;
  });

  const potentialProfit = inventorySalePotentialUSD - inventoryCostUSD;
  // Margen ponderado global del inventario actual
  const marginPercentage = inventoryCostUSD > 0 ? (potentialProfit / inventorySalePotentialUSD) * 100 : 0;

  // C. Cuentas por Pagar (Salud Financiera)
  const totalDebt = invoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);
  const todayDate = new Date();

  // Facturas que vencen este mes o ya están vencidas
  const dueInvoices = invoices.filter(inv => {
    if (inv.status === 'PAID') return false;
    const dueDate = new Date(inv.dateDue);
    // Lógica: Vencidas (Fecha < Hoy) O Vencen este mes
    return (dueDate < todayDate) || (dueDate.getMonth() === todayDate.getMonth() && dueDate.getFullYear() === todayDate.getFullYear());
  }).sort((a, b) => new Date(a.dateDue).getTime() - new Date(b.dateDue).getTime());

  const totalDueThisMonth = dueInvoices.reduce((acc, inv) => acc + (inv.totalUSD - inv.paidAmountUSD), 0);

  // D. Alertas de Stock
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  // E. Indicadores Económicos (Brecha Cambiaria)
  const brecha = settings.tasaBCV > 0 ? ((settings.tasaTH - settings.tasaBCV) / settings.tasaBCV) * 100 : 0;
  const brechaColor = brecha > 20 ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';

  // --- 2. ANALÍTICA AVANZADA (MEMOIZED) ---
  const analyticsData = useMemo(() => {
    const activeSales = sales.filter(s => s.status !== 'CANCELLED');
    const now = new Date();
    let filteredSales: Sale[] = [];
    let chartData: { label: string, value: number, dateFull: string }[] = [];
    let rangeLabel = "";

    // Lógica de Filtrado Temporal
    if (timeRange === 'today') {
      rangeLabel = "Hoy";
      filteredSales = activeSales.filter(s => new Date(s.date).toLocaleDateString('es-ES') === now.toLocaleDateString('es-ES'));
    } else if (timeRange === 'week') {
      rangeLabel = "Última Semana";
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      filteredSales = activeSales.filter(s => new Date(s.date) >= sevenDaysAgo);

      // Agrupar por día para el gráfico
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
    }

    // Totales del periodo
    const totalRevenue = filteredSales.reduce((a, s) => a + s.totalUSD, 0);
    const ticketCount = filteredSales.length;
    const averageTicket = ticketCount > 0 ? totalRevenue / ticketCount : 0;

    // Top Productos
    const productSalesCount: Record<string, number> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const key = item.sku || item.name;
        productSalesCount[key] = (productSalesCount[key] || 0) + item.quantity;
      });
    });

    const topProducts = Object.entries(productSalesCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key, qty]) => {
        const prod = products.find(p => p.sku === key || p.name === key);
        return { name: prod ? prod.name : key, qty, stock: prod ? prod.stock : 0 };
      });

    // Productos Fríos (Sin ventas en el periodo, pero con stock alto)
    const coldProducts = products
      .filter(p => !productSalesCount[p.sku] && !productSalesCount[p.name] && p.stock > 0)
      .sort((a, b) => b.stock - a.stock) // Ordenar por mayor stock estancado
      .slice(0, 5);

    // Métodos de Pago
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

  // --- RENDERIZADO ---
  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 bg-gray-50 min-h-screen w-full animate-in fade-in duration-500">

      {/* 1. ENCABEZADO Y TASAS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Centro de Control</h2>
          <p className="text-gray-500 font-medium">Resumen operativo de <span className="text-red-600 font-bold">Todo en Ruedas</span>.</p>
        </div>

        {/* Widget de Tasas */}
        <div className="flex items-center bg-white p-2 rounded-xl border border-gray-200 shadow-sm gap-4 divide-x divide-gray-100 w-full md:w-auto justify-between md:justify-start">
          <div className="px-4 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa BCV</p>
            <p className="text-lg font-black text-gray-800">Bs. {settings.tasaBCV.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
          </div>
          {settings.showMonitorRate && (
            <>
              <div className="px-4 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monitor</p>
                <p className="text-lg font-bold text-gray-600">Bs. {settings.tasaTH.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className={`px-4 text-center rounded-lg py-1 ${brechaColor}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"><Percent size={10} /> Brecha</p>
                <p className="text-lg font-bold">{brecha.toFixed(2)}%</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. KPI CARDS (TARJETAS PRINCIPALES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">

        {/* Card: Caja Hoy */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group hover:border-red-200 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Caja Hoy</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(todaysSalesTotal, 'USD')}</h3>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-colors">
              <DollarSign size={24} />
            </div>
          </div>
        </div>

        {/* Card: Deuda Global */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 group hover:border-orange-200 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Deuda Global</p>
              <h3 className="text-2xl font-black text-gray-800 mt-1">{formatCurrency(totalDebt, 'USD')}</h3>
              <Link to="/invoices" className="text-xs text-orange-500 font-bold mt-2 block hover:underline">Ver facturas &rarr;</Link>
            </div>
            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-500 group-hover:text-white transition-colors">
              <Wallet size={24} />
            </div>
          </div>
        </div>

        {/* Card: Inventario (Costo) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 group hover:border-blue-200 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inventario (Costo)</p>
              <h3 className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(inventoryCostUSD, 'USD')}</h3>
              <Link to="/inventory" className="text-xs text-blue-500 font-bold mt-2 block hover:underline">Ver inventario &rarr;</Link>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Package size={24} />
            </div>
          </div>
        </div>

        {/* Card: Ganancia Estimada */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 group hover:border-green-200 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ganancia Est.</p>
              <h3 className="text-2xl font-black text-green-600 mt-1">{formatCurrency(potentialProfit, 'USD')}</h3>
              <p className="text-xs text-gray-400 font-bold">{marginPercentage.toFixed(0)}% Margen Promedio</p>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-colors">
              <TrendingUp size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. SECCIONES DE DETALLE (Alertas y Analítica) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* COLUMNA IZQUIERDA: ALERTAS (2/3 del ancho en pantallas grandes) */}
        <div className="lg:col-span-2 space-y-8">

          {/* Analítica de Ventas */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b border-gray-100 pb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                <BarChart3 size={24} className="text-red-600" /> Analítica: <span className="text-red-600 underline">{analyticsData.rangeLabel}</span>
              </h3>

              {/* Filtros de Tiempo */}
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button onClick={() => setTimeRange('today')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'today' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Hoy</button>
                <button onClick={() => setTimeRange('week')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'week' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Semana</button>
                <button onClick={() => setTimeRange('month')} className={`px-4 py-2 text-xs font-bold rounded-lg transition ${timeRange === 'month' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}>Mes</button>
              </div>
            </div>

            {/* Contenido Dinámico */}
            {timeRange === 'today' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-bold uppercase">Tickets</p>
                  <p className="text-2xl font-black text-gray-800">{analyticsData.ticketCount}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-bold uppercase">Ticket Prom.</p>
                  <p className="text-2xl font-black text-gray-800">{formatCurrency(analyticsData.averageTicket, 'USD')}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-bold uppercase">Método Top</p>
                  <p className="text-lg font-bold text-gray-800 truncate">{analyticsData.paymentMethodsStats[0]?.method || '-'}</p>
                </div>
              </div>
            ) : (
              // Gráfico de Barras Simple
              <div className="h-48 flex items-end gap-2 border-b border-gray-100 pb-2">
                {analyticsData.chartData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
                    <div
                      className="w-full bg-red-400 rounded-t-sm hover:bg-red-600 transition-all"
                      style={{ height: `${(d.value / analyticsData.maxChartValue) * 100}%`, minHeight: '4px' }}
                    ></div>
                    <p className="text-center text-[10px] text-gray-400 mt-1 truncate">{d.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Análisis de Inventario */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Ventas */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4 text-orange-600 font-bold uppercase text-xs">
                <Flame size={16} /> Más Vendidos
              </div>
              <ul className="space-y-2">
                {analyticsData.topProducts.map((p, i) => (
                  <li key={i} className="flex justify-between items-center text-sm p-2 hover:bg-gray-50 rounded-lg transition">
                    <span className="text-gray-700 truncate font-medium">{p.name}</span>
                    <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-md">{p.qty}</span>
                  </li>
                ))}
                {analyticsData.topProducts.length === 0 && <p className="text-gray-400 text-xs italic text-center py-4">Sin datos recientes.</p>}
              </ul>
            </div>

            {/* Huesos (Fríos) */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4 text-blue-600 font-bold uppercase text-xs">
                <Snowflake size={16} /> Productos Fríos
              </div>
              <ul className="space-y-2">
                {analyticsData.coldProducts.map((p, i) => (
                  <li key={i} className="flex justify-between items-center text-sm p-2 hover:bg-gray-50 rounded-lg transition">
                    <span className="text-gray-700 truncate font-medium">{p.name}</span>
                    <span className="text-gray-400 text-xs">{p.stock} un.</span>
                  </li>
                ))}
                {analyticsData.coldProducts.length === 0 && <p className="text-gray-400 text-xs italic text-center py-4">Inventario sano.</p>}
              </ul>
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: PENDIENTES */}
        <div className="space-y-6">

          {/* Facturas por Pagar (Urgentes) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Clock size={20} className="text-red-500" /> Compromisos</h3>
              <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">Total: {formatCurrency(totalDueThisMonth, 'USD')}</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 max-h-[400px]">
              {dueInvoices.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">¡Todo al día! 🎉</p>
                </div>
              ) : (
                dueInvoices.map(inv => {
                  const invDate = new Date(inv.dateDue);
                  const isOverdue = invDate < todayDate;
                  return (
                    <div
                      key={inv.id}
                      onClick={() => navigate('/invoices', { state: { openInvoiceId: inv.id } })}
                      className={`p-3 border rounded-xl cursor-pointer transition group ${isOverdue ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-100 hover:bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-800 text-xs group-hover:text-red-700">{inv.supplier}</p>
                          <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isOverdue ? 'text-red-600' : 'text-orange-500'}`}>
                            {isOverdue ? <AlertTriangle size={10} /> : <Calendar size={10} />}
                            {isOverdue ? 'VENCIDA: ' : 'Vence: '} {invDate.toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-gray-900 text-sm">{formatCurrency(inv.totalUSD - inv.paidAmountUSD, 'USD')}</p>
                          <p className="text-[9px] text-gray-400 font-mono">#{inv.number}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Stock Bajo */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><AlertTriangle size={20} className="text-orange-500" /> Reponer Stock</h3>
              <span className="text-xs px-2 py-1 bg-orange-100 text-orange-600 rounded-full font-bold">{lowStockProducts.length}</span>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {lowStockProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className={`w-1.5 h-8 rounded-full ${p.stock === 0 ? 'bg-red-500' : 'bg-orange-400'}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-700 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">Min: {p.minStock}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>{p.stock}</span>
                  </div>
                </div>
              ))}
              {lowStockProducts.length === 0 && <p className="text-center text-gray-400 text-xs py-4">Inventario óptimo.</p>}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};