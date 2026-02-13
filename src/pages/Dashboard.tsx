/**
 * @file Dashboard.tsx
 * @description Centro de Comando Completo.
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  AlertTriangle, Wallet, Users, BarChart3, ArrowUpRight, ArrowDownRight, AlertOctagon
} from 'lucide-react';

export const Dashboard = () => {
  const { sales, products, invoices, clients, settings } = useStore();

  // --- 1. FILTROS DE TIEMPO ---
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- 2. LÓGICA DE FECHAS ---
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    if (filterType === 'today') return { start: now, end: now };
    if (filterType === 'week') {
      const day = now.getDay() || 7;
      if (day !== 1) start.setHours(-24 * (day - 1));
      return { start, end };
    }
    if (filterType === 'month') {
      start.setDate(1);
      return { start, end };
    }
    if (filterType === 'custom') {
      return {
        start: customStart ? new Date(customStart) : new Date(0),
        end: customEnd ? new Date(customEnd) : new Date()
      };
    }
    return { start: now, end: now };
  }, [filterType, customStart, customEnd]);

  const isDateInScope = (dateStr: string) => {
    const d = new Date(dateStr);
    const dStr = d.toISOString().split('T')[0];
    const startStr = dateRange.start.toISOString().split('T')[0];
    const endStr = dateRange.end.toISOString().split('T')[0];
    return dStr >= startStr && dStr <= endStr;
  };

  // --- 3. DATOS FILTRADOS ---
  const filteredSales = sales.filter(s => s.status !== 'CANCELLED' && isDateInScope(s.date));
  const totalSalesPeriodUSD = filteredSales.reduce((acc, s) => acc + s.totalUSD, 0);

  // --- 4. KPIs GLOBALES ---
  const totalReceivable = sales
    .filter(s => (s.status === 'PENDING' || s.status === 'PARTIAL'))
    .reduce((acc, s) => acc + (s.totalUSD - s.paidAmountUSD), 0);

  const totalPayable = invoices
    .filter(i => (i.status === 'PENDING' || i.status === 'PARTIAL'))
    .reduce((acc, i) => acc + (i.totalUSD - i.paidAmountUSD), 0);

  // --- 5. ALERTAS DE STOCK ---
  const outOfStock = products.filter(p => p.stock === 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock);

  // --- 6. PROYECCIÓN DE INVENTARIO ---
  const inventoryStats = useMemo(() => {
    let totalInvested = 0;
    let totalRevenuePotential = 0;
    products.forEach(p => {
      const prices = calculatePrices(p, settings);
      totalInvested += p.stock * (p.cost + (p.freight || 0));
      totalRevenuePotential += p.stock * prices.finalPriceUSD;
    });
    return { invested: totalInvested, revenue: totalRevenuePotential, profit: totalRevenuePotential - totalInvested };
  }, [products, settings]);

  // --- 7. ANÁLISIS DE PRODUCTOS (CORREGIDO) ---
  const productPerformance = useMemo(() => {
    const salesMap: Record<string, number> = {};

    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        // CORRECCIÓN: Relacionamos por Nombre, ya que es el dato exacto guardado en la foto de la venta
        if (item.name) {
          salesMap[item.name] = (salesMap[item.name] || 0) + item.quantity;
        }
      });
    });

    // Mapeamos los productos actuales con la cantidad encontrada en el historial
    const ranked = products.map(p => ({
      ...p,
      soldQuantity: salesMap[p.name] || 0
    }));

    return {
      bestSellers: [...ranked].sort((a, b) => b.soldQuantity - a.soldQuantity).slice(0, 5),
      worstSellers: [...ranked].filter(p => p.stock > 0).sort((a, b) => a.soldQuantity - b.soldQuantity).slice(0, 5)
    };
  }, [filteredSales, products]);

  // --- 8. TOP CLIENTES ---
  const topClientsList = useMemo(() => {
    const clientMap: Record<string, number> = {};

    filteredSales.forEach(sale => {
      if (sale.clientId) {
        clientMap[sale.clientId] = (clientMap[sale.clientId] || 0) + sale.totalUSD;
      }
    });

    return Object.entries(clientMap)
      .sort(([, amountA], [, amountB]) => amountB - amountA)
      .slice(0, 5)
      .map(([id, amount]) => ({
        client: clients.find(c => c.id === id),
        amount
      }));
  }, [filteredSales, clients]);

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

      {/* HEADER & CONTROLES */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-black text-gray-800 tracking-tight">Tablero de Control</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold text-gray-400 uppercase">Tasa BCV:</span><span className="font-mono font-bold text-gray-800">Bs. {settings.tasaBCV}</span>
            {settings.showMonitorRate && <><span className="text-gray-300">|</span><span className="text-xs font-bold text-gray-400 uppercase">Monitor:</span><span className="font-mono font-bold text-orange-500">Bs. {settings.tasaTH}</span></>}
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full xl:w-auto">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {['today', 'week', 'month', 'custom'].map((t) => (
              <button key={t} onClick={() => setFilterType(t as any)} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${filterType === t ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'today' ? 'Hoy' : t === 'week' ? 'Semana' : t === 'month' ? 'Mes' : 'Rango'}
              </button>
            ))}
          </div>
          {filterType === 'custom' && (
            <div className="flex gap-2 animate-in slide-in-from-right fade-in">
              <input type="date" className="border rounded-lg px-2 text-xs bg-white font-bold text-gray-600 outline-none focus:ring-2 focus:ring-blue-100" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <input type="date" className="border rounded-lg px-2 text-xs bg-white font-bold text-gray-600 outline-none focus:ring-2 focus:ring-blue-100" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* --- FILA 1: KPIs FINANCIEROS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80} /></div>
          <p className="text-xs text-gray-400 uppercase font-bold mb-1">Ventas ({filterType === 'today' ? 'Hoy' : filterType})</p>
          <h3 className="text-3xl font-black">{formatCurrency(totalSalesPeriodUSD, 'USD')}</h3>
          <p className="text-sm text-gray-400 mt-1">{filteredSales.length} operaciones</p>
        </div>
        <Link to="/accounts-receivable" className="bg-white p-6 rounded-2xl border border-orange-100 shadow-sm hover:shadow-md transition group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-orange-500 group-hover:scale-110 transition"><Wallet size={80} /></div>
          <p className="text-xs text-orange-500 uppercase font-bold mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Por Cobrar</p>
          <h3 className="text-3xl font-black text-gray-800">{formatCurrency(totalReceivable, 'USD')}</h3>
          <p className="text-xs text-gray-400 mt-1">Dinero pendiente</p>
        </Link>
        <Link to="/invoices" className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm hover:shadow-md transition group relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-red-500 group-hover:scale-110 transition"><TrendingDown size={80} /></div>
          <p className="text-xs text-red-500 uppercase font-bold mb-1">Por Pagar</p>
          <h3 className="text-3xl font-black text-gray-800">{formatCurrency(totalPayable, 'USD')}</h3>
          <p className="text-xs text-gray-400 mt-1">Deuda a Proveedores</p>
        </Link>

        {/* Top Cliente */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10 text-blue-500"><Users size={100} /></div>
          <div className="relative z-10">
            <p className="text-xs text-blue-500 uppercase font-bold mb-1">Líder del Periodo</p>
            <h3 className="text-lg font-black text-blue-900 truncate">
              {topClientsList[0]?.client?.name || 'N/A'}
            </h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 self-end relative z-10">
            {topClientsList[0] ? formatCurrency(topClientsList[0].amount, 'USD') : '-'}
          </p>
        </div>
      </div>

      {/* --- FILA 2: PROYECCIÓN INVENTARIO (Azul) --- */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 opacity-10"><Package size={200} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><BarChart3 /> Proyección de Inventario</h3>
            <div className="flex gap-8">
              <div><p className="text-blue-200 text-xs uppercase font-bold mb-1">Costo Invertido</p><p className="text-2xl font-black">{formatCurrency(inventoryStats.invested, 'USD')}</p></div>
              <div><p className="text-green-300 text-xs uppercase font-bold mb-1">Ganancia Estimada</p><p className="text-2xl font-black text-green-300">+{formatCurrency(inventoryStats.profit, 'USD')}</p></div>
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-6 border border-white/10 min-w-[200px] text-center flex flex-col justify-center shadow-inner">
            <p className="text-blue-100 text-xs uppercase font-bold mb-1">Total Venta Potencial</p>
            <p className="text-4xl font-black drop-shadow-md">{formatCurrency(inventoryStats.revenue, 'USD')}</p>
          </div>
        </div>
      </div>

      {/* --- FILA 3: ALERTAS, PRODUCTOS Y CLIENTES --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* COLUMNA 1: ALERTAS DE STOCK */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full ring-2 ring-red-50">
          <div className="p-4 border-b border-red-50 bg-red-50/30 flex items-center justify-between">
            <h4 className="font-bold text-red-800 text-sm flex items-center gap-2"><AlertOctagon size={16} /> Atención Inmediata</h4>
            <Link to="/inventory" className="text-[10px] font-bold text-red-600 hover:underline">Gestionar</Link>
          </div>
          <div className="flex-1 p-0 overflow-y-auto max-h-[300px] custom-scrollbar">
            {outOfStock.length === 0 && lowStock.length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-10">¡Todo en orden! Inventario saludable.</p>
            ) : (
              <>
                {outOfStock.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 border-b border-gray-50 bg-red-50/10">
                    <div className="min-w-0 pr-2"><p className="text-xs font-bold text-gray-700 truncate">{p.name}</p><p className="text-[10px] text-red-500 font-bold">AGOTADO</p></div><span className="text-xs font-mono text-gray-400">{p.sku}</span>
                  </div>
                ))}
                {lowStock.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 border-b border-gray-50 hover:bg-gray-50">
                    <div className="min-w-0 pr-2"><p className="text-xs font-bold text-gray-700 truncate">{p.name}</p><p className="text-[10px] text-orange-500 font-bold">Quedan: {p.stock}</p></div><div className="text-right"><span className="block text-[10px] text-gray-400">Min: {p.minStock}</span></div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* COLUMNA 2: TOP CLIENTES */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-gray-50 flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg"><Users size={16} /></div>
            <h4 className="font-bold text-gray-800 text-sm">Mejores Clientes</h4>
          </div>
          <div className="flex-1 p-2">
            {topClientsList.length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8">Sin ventas a registrados.</p>
            ) : (
              topClientsList.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-blue-50 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">{i + 1}</div>
                    <div>
                      <p className="text-xs font-bold text-gray-700 truncate w-24">{item.client?.name || 'Desc.'}</p>
                      <p className="text-[9px] text-gray-400">{item.client?.rif || 'N/A'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-800">{formatCurrency(item.amount, 'USD')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMNA 3: MÁS VENDIDOS */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-gray-50 flex items-center gap-2">
            <div className="p-1.5 bg-green-100 text-green-700 rounded-lg"><ArrowUpRight size={16} /></div>
            <h4 className="font-bold text-gray-800 text-sm">Más Vendidos</h4>
          </div>
          <div className="flex-1 p-2">
            {productPerformance.bestSellers.filter(p => p.soldQuantity > 0).length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8">Sin datos.</p>
            ) : (
              productPerformance.bestSellers.filter(p => p.soldQuantity > 0).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black text-gray-300 w-3">#{i + 1}</span>
                    <div><p className="text-xs font-bold text-gray-700 truncate w-24">{p.name}</p><p className="text-[9px] text-gray-400">{p.soldQuantity} un.</p></div>
                  </div>
                  <span className="text-xs font-bold text-green-600">{formatCurrency(p.soldQuantity * calculatePrices(p, settings).finalPriceUSD, 'USD')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMNA 4: MENOS VENDIDOS */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-gray-50 flex items-center gap-2">
            <div className="p-1.5 bg-gray-100 text-gray-700 rounded-lg"><ArrowDownRight size={16} /></div>
            <h4 className="font-bold text-gray-800 text-sm">Menos Vendidos</h4>
          </div>
          <div className="flex-1 p-2">
            {productPerformance.worstSellers.length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8">Todo se mueve.</p>
            ) : (
              productPerformance.worstSellers.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-700 truncate w-24">{p.name}</p>
                    <p className="text-[9px] bg-red-50 text-red-600 px-1 rounded inline-block">Stock: {p.stock}</p>
                  </div>
                  <Link to="/inventory" className="text-[9px] font-bold text-blue-600 hover:underline">Ver</Link>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};