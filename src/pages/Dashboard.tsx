/**
 * @file Dashboard.tsx
 * @description Centro de Comando Completo.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency, calculatePrices } from '../utils/pricing';
import { logAudit } from '../utils/audit';
import { Link, useNavigate } from 'react-router-dom';
import { useDarkMode } from '../hooks/useDarkMode';
import toast from 'react-hot-toast';
import { CashFlowCards } from '../components/dashboard/CashFlowCards';
import { ExpectedByMethodTable } from '../components/dashboard/ExpectedByMethodTable';
import { PendingRecurringExpensesCard } from '../components/dashboard/PendingRecurringExpensesCard';
import {
  TrendingDown, DollarSign, Package,
  AlertTriangle, Wallet, Users, BarChart3, ArrowUpRight, ArrowDownRight, AlertOctagon, Award
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { deriveRecurringTemplatesFromExpenses, getPendingRecurringForMonth, loadRecurringTemplates } from '../utils/recurringExpenses';
import { supabase } from '../supabase/client';
import type { RecurringExpense } from '../types';

export const Dashboard = () => {
  const { sales, products, invoices, clients, expenses, cashLedger, paymentMethods, settings, currentUserData, deleteCashMovement } = useStore();
  const { isDark } = useDarkMode();
  const navigate = useNavigate();

  // Colores dinámicos para Recharts (SVG no puede leer clases CSS)
  const chartColors = {
    tick: isDark ? '#6b7280' : '#9ca3af',
    grid: isDark ? '#374151' : '#f3f4f6',
    tooltip: isDark
      ? { background: '#1f2937', border: '#374151', color: '#f9fafb' }
      : { background: '#ffffff', border: 'none', color: '#111827' },
  };

  const userRole = currentUserData?.role || 'VIEWER';
  const isSeller = userRole === 'SELLER';
  const isAdminOrManager = userRole === 'ADMIN' || userRole === 'MANAGER';

  // --- 1. FILTROS DE TIEMPO ---
  const today = new Date();
  const initialDay = String(today.getDate()).padStart(2, '0');
  const initialMonth = String(today.getMonth() + 1).padStart(2, '0');
  const initialYear = String(today.getFullYear());
  const initialISODate = `${initialYear}-${initialMonth}-${initialDay}`;

  const [filterType, setFilterType] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState(initialISODate);
  const [customEnd, setCustomEnd] = useState(initialISODate);
  const [customStartDay, setCustomStartDay] = useState(initialDay);
  const [customStartMonth, setCustomStartMonth] = useState(initialMonth);
  const [customStartYear, setCustomStartYear] = useState(initialYear);
  const [customEndDay, setCustomEndDay] = useState(initialDay);
  const [customEndMonth, setCustomEndMonth] = useState(initialMonth);
  const [customEndYear, setCustomEndYear] = useState(initialYear);
  const [remoteRecurringTemplates, setRemoteRecurringTemplates] = useState<RecurringExpense[]>([]);
  const [remoteRecurringLoaded, setRemoteRecurringLoaded] = useState(false);

  const MAX_CHART_DAYS = 180;

  useEffect(() => {
    let cancelled = false;

    const fetchRecurringTemplates = async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) return;

      const mapped = (data || []).map((row) => ({
        id: row.id as string,
        description: row.description as string,
        category: (row.category as string) || 'Otro',
        amountUSD: Number(row.amount_usd) || 0,
        amountBS: row.amount_bs ? Number(row.amount_bs) : undefined,
        currency: (row.currency as RecurringExpense['currency']) || 'USD',
        paymentMethod: (row.payment_method as string) || 'Efectivo USD',
        dayOfMonth: row.day_of_month ? Number(row.day_of_month) : undefined,
        active: row.is_active !== false,
      } satisfies RecurringExpense));

      setRemoteRecurringTemplates(mapped);
      setRemoteRecurringLoaded(true);
    };

    void fetchRecurringTemplates();

    const recurringChannel = supabase
      .channel('recurring-expenses-dashboard-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_expenses' },
        () => {
          void fetchRecurringTemplates();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(recurringChannel);
    };
  }, []);

  // --- 2. LÓGICA DE FECHAS ---
  const toLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
  const toISODate = (year: string, month: string, day: string) => {
    if (!year || !month || !day) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    return Array.from({ length: 11 }, (_, index) => String(currentYear - 5 + index));
  }, [currentYear]);

  const startDaysInMonth = useMemo(() => {
    const year = Number(customStartYear || currentYear);
    const month = Number(customStartMonth || 1);
    return getDaysInMonth(year, month);
  }, [customStartYear, customStartMonth, currentYear]);

  const endDaysInMonth = useMemo(() => {
    const year = Number(customEndYear || currentYear);
    const month = Number(customEndMonth || 1);
    return getDaysInMonth(year, month);
  }, [customEndYear, customEndMonth, currentYear]);

  const updateStartDateParts = (next: { day?: string; month?: string; year?: string }) => {
    let day = next.day ?? customStartDay;
    const month = next.month ?? customStartMonth;
    const year = next.year ?? customStartYear;

    if (day && month && year) {
      const maxDay = getDaysInMonth(Number(year), Number(month));
      if (Number(day) > maxDay) day = String(maxDay).padStart(2, '0');
    }

    setCustomStartDay(day);
    setCustomStartMonth(month);
    setCustomStartYear(year);
    setCustomStart(toISODate(year, month, day));
  };

  const updateEndDateParts = (next: { day?: string; month?: string; year?: string }) => {
    let day = next.day ?? customEndDay;
    const month = next.month ?? customEndMonth;
    const year = next.year ?? customEndYear;

    if (day && month && year) {
      const maxDay = getDaysInMonth(Number(year), Number(month));
      if (Number(day) > maxDay) day = String(maxDay).padStart(2, '0');
    }

    setCustomEndDay(day);
    setCustomEndMonth(month);
    setCustomEndYear(year);
    setCustomEnd(toISODate(year, month, day));
  };

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
      const safeEnd = customEnd ? new Date(customEnd) : now;
      const safeStart = customStart ? new Date(customStart) : new Date(safeEnd);

      safeStart.setHours(0, 0, 0, 0);
      safeEnd.setHours(0, 0, 0, 0);

      if (safeStart > safeEnd) {
        return { start: safeEnd, end: safeEnd };
      }

      return {
        start: safeStart,
        end: safeEnd
      };
    }
    return { start: now, end: now };
  }, [filterType, customStart, customEnd]);

  const isDateInScope = (dateStr: string) => {
    const d = new Date(dateStr);
    const dStr = toLocalDateKey(d);
    const startStr = toLocalDateKey(dateRange.start);
    const endStr = toLocalDateKey(dateRange.end);
    return dStr >= startStr && dStr <= endStr;
  };

  // --- 3. DATOS FILTRADOS ---
  // Si es SELLER, solo ve SUS ventas. Si no, las ve todas.
  const filteredSales = sales.filter(s => {
    const dateOk = s.status !== 'CANCELLED' && isDateInScope(s.date);
    if (isSeller) return dateOk && s.userId === currentUserData?.id;
    return dateOk;
  });

  const totalSalesPeriodUSD = filteredSales.reduce((acc, s) => acc + s.totalUSD, 0);

  // Comisión del SELLER: solo si el Admin la habilitó y está configurada
  const commissionPct = settings.sellerCommissionPct ?? 5;
  const sellerCommission = isSeller ? totalSalesPeriodUSD * (commissionPct / 100) : 0;

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
  const inventoryStats = (() => {
    let totalInvested = 0;
    let totalRevenuePotential = 0;
    products.forEach(p => {
      const prices = calculatePrices(p, settings);
      totalInvested += p.stock * (p.cost + (p.freight || 0));
      totalRevenuePotential += p.stock * prices.finalPriceUSD;
    });
    return { invested: totalInvested, revenue: totalRevenuePotential, profit: totalRevenuePotential - totalInvested };
  })();

  // --- 7. ANÁLISIS DE PRODUCTOS (CORREGIDO) ---
  const productPerformance = (() => {
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
  })();

  // --- 8. TOP CLIENTES ---
  const topClientsList = (() => {
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
  })();

  // --- 9. DATOS PARA GRÁFICAS (solo Admin/Manager, respetando filtro de fecha) ---
  const chartData = useMemo(() => {
    if (!isAdminOrManager) return [];

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const scopedSales = sales.filter((sale) => {
      const saleDate = new Date(sale.date);
      const saleDateText = toLocalDateKey(saleDate);
      const startText = toLocalDateKey(start);
      const endText = toLocalDateKey(end);
      const dateOk = sale.status !== 'CANCELLED' && saleDateText >= startText && saleDateText <= endText;
      if (isSeller) return dateOk && sale.userId === currentUserData?.id;
      return dateOk;
    });

    const days: { label: string; total: number; date: string }[] = [];
    const cursor = new Date(start);
    let iterations = 0;

    while (cursor <= end && iterations < MAX_CHART_DAYS) {
      const dateStr = toLocalDateKey(cursor);
      const dayTotal = scopedSales
        .filter((sale) => toLocalDateKey(new Date(sale.date)) === dateStr)
        .reduce((acc, sale) => acc + sale.totalUSD, 0);

      days.push({
        label: cursor.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }),
        total: Math.round(dayTotal * 100) / 100,
        date: dateStr,
      });

      cursor.setDate(cursor.getDate() + 1);
      iterations += 1;
    }

    return days;
  }, [isAdminOrManager, dateRange, sales, isSeller, currentUserData?.id, MAX_CHART_DAYS]);

  const expectedCutoffLabel = useMemo(() => {
    return dateRange.end.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [dateRange.end]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const paymentData = (() => {
    if (!isAdminOrManager) return [];
    const methodMap: Record<string, number> = {};
    filteredSales.forEach(s => {
      const m = s.paymentMethod || 'Efectivo';
      methodMap[m] = (methodMap[m] || 0) + s.totalUSD;
    });
    return Object.entries(methodMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  })();

  const filteredCashLedger = useMemo(() => {
    const startText = toLocalDateKey(dateRange.start);
    const endText = toLocalDateKey(dateRange.end);

    return cashLedger.filter((movement) => {
      const movementDate = new Date(movement.date);
      const movementDateText = toLocalDateKey(movementDate);
      return movementDateText >= startText && movementDateText <= endText;
    });
  }, [cashLedger, dateRange]);

  const cashLedgerUntilEndDate = useMemo(() => {
    const endText = toLocalDateKey(dateRange.end);

    return cashLedger.filter((movement) => {
      const movementDate = new Date(movement.date);
      const movementDateText = toLocalDateKey(movementDate);
      return movementDateText <= endText;
    });
  }, [cashLedger, dateRange.end]);

  const cashInPeriod = useMemo(() => {
    return filteredCashLedger
      .filter((movement) => movement.direction === 'IN')
      .reduce((sum, movement) => sum + movement.amountUSD, 0);
  }, [filteredCashLedger]);

  const cashOutPeriod = useMemo(() => {
    return filteredCashLedger
      .filter((movement) => movement.direction === 'OUT')
      .reduce((sum, movement) => sum + movement.amountUSD, 0);
  }, [filteredCashLedger]);

  const netCashFlowPeriod = cashInPeriod - cashOutPeriod;

  const buildExpectedByMethod = useCallback((movements: typeof cashLedger) => {
    const map: Record<string, {
      method: string;
      currency: 'USD' | 'BS';
      grossIn: number;
      commissionableIn: number;
      cashOut: number;
      commissionPct: number;
      commissionCost: number;
      expectedBalance: number;
    }> = {};

    paymentMethods.forEach((method) => {
      map[method.name] = {
        method: method.name,
        currency: method.currency,
        grossIn: 0,
        commissionableIn: 0,
        cashOut: 0,
        commissionPct: Number(method.commissionPct) || 0,
        commissionCost: 0,
        expectedBalance: 0,
      };
    });

    movements.forEach((movement) => {
      const method = movement.paymentMethod || 'N/A';
      if (!map[method]) {
        map[method] = {
          method,
          currency: movement.currency,
          grossIn: 0,
          commissionableIn: 0,
          cashOut: 0,
          commissionPct: 0,
          commissionCost: 0,
          expectedBalance: 0,
        };
      }

      const amountInMethodCurrency = map[method].currency === 'BS'
        ? (movement.amountBS ?? (movement.amountUSD * settings.tasaBCV))
        : movement.amountUSD;

      if (movement.direction === 'IN') {
        map[method].grossIn += amountInMethodCurrency;
        if (movement.kind !== 'AJUSTE') {
          map[method].commissionableIn += amountInMethodCurrency;
        }
      } else {
        map[method].cashOut += amountInMethodCurrency;
      }
    });

    return Object.values(map)
      .map((row) => {
        const commissionCost = row.commissionableIn * (row.commissionPct / 100);
        const expectedBalance = row.grossIn - commissionCost - row.cashOut;
        return {
          ...row,
          commissionCost,
          expectedBalance,
        };
      })
      .sort((a, b) => b.expectedBalance - a.expectedBalance);
  }, [paymentMethods, settings.tasaBCV]);

  const expectedByMethodAccum = useMemo(() => {
    return buildExpectedByMethod(cashLedgerUntilEndDate);
  }, [buildExpectedByMethod, cashLedgerUntilEndDate]);

  const expectedByMethodPeriod = useMemo(() => {
    return buildExpectedByMethod(filteredCashLedger);
  }, [buildExpectedByMethod, filteredCashLedger]);

  const periodImpactMap = useMemo(() => {
    const map: Record<string, number> = {};
    expectedByMethodPeriod.forEach((row) => {
      map[row.method] = row.expectedBalance;
    });
    return map;
  }, [expectedByMethodPeriod]);

  const expectedRowsForView = useMemo(() => {
    return expectedByMethodPeriod.map((periodRow) => {
      const accumRow = expectedByMethodAccum.find((row) => row.method === periodRow.method);
      return {
        ...periodRow,
        expectedBalance: accumRow?.expectedBalance ?? periodRow.expectedBalance,
        periodImpact: periodImpactMap[periodRow.method] ?? periodRow.expectedBalance,
      };
    });
  }, [expectedByMethodAccum, expectedByMethodPeriod, periodImpactMap]);


  const methodsInNegative = useMemo(() => {
    return expectedRowsForView.filter((method) => method.expectedBalance < -0.009);
  }, [expectedRowsForView]);

  const movementsByMethod = useMemo(() => {
    const source = cashLedgerUntilEndDate;
    const map: Record<string, typeof source> = {};

    source.forEach((movement) => {
      const method = movement.paymentMethod || 'N/A';
      if (!map[method]) map[method] = [];
      map[method].push(movement);
    });

    Object.keys(map).forEach((method) => {
      map[method] = map[method].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return map;
  }, [cashLedgerUntilEndDate]);

  const handleAdjustMethod = useCallback((method: string) => {
    navigate('/settings', { state: { cashControlMethod: method } });
  }, [navigate]);

  const handleDeleteMovement = useCallback(async (
    movement: {
      id: string;
      date: string;
      direction: 'IN' | 'OUT';
      amountUSD: number;
      amountBS?: number;
      currency: 'USD' | 'BS';
      kind: string;
      description: string;
    },
    method: string,
  ) => {
    if (currentUserData?.role !== 'ADMIN') {
      toast.error('Solo un administrador puede eliminar movimientos.');
      return;
    }

    if (movement.kind !== 'AJUSTE') {
      toast.error('Solo se pueden eliminar movimientos de tipo ajuste.');
      return;
    }

    const confirmed = window.confirm('Esta acción eliminará el movimiento de caja. ¿Deseas continuar?');
    if (!confirmed) return;

    const deleted = await deleteCashMovement(movement.id);
    if (!deleted) {
      toast.error('No se pudo eliminar el movimiento.');
      return;
    }

    await logAudit({
      action: 'DELETE',
      entity: 'cash_ledger',
      entityId: movement.id,
      changes: {
        method,
        kind: movement.kind,
        direction: movement.direction,
        currency: movement.currency,
        amountUSD: movement.amountUSD,
        amountBS: movement.amountBS ?? null,
        date: movement.date,
        description: movement.description,
      },
    });

    toast.success('Movimiento eliminado y auditado.');
  }, [currentUserData?.role, deleteCashMovement]);


  const pendingRecurringExpenses = useMemo(() => {
    const localTemplates = loadRecurringTemplates();
    const templates = remoteRecurringLoaded
      ? remoteRecurringTemplates
      : (localTemplates.length > 0 ? localTemplates : deriveRecurringTemplatesFromExpenses(expenses));
    return getPendingRecurringForMonth(templates, expenses, new Date())
      .sort((a, b) => {
        const aDay = a.dayOfMonth ?? 99;
        const bDay = b.dayOfMonth ?? 99;
        if (aDay !== bDay) return aDay - bDay;
        return a.description.localeCompare(b.description, 'es', { sensitivity: 'base' });
      });
  }, [expenses, remoteRecurringTemplates, remoteRecurringLoaded]);

  const currentMonthLabel = useMemo(() => {
    return new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  }, []);

  const recurringDueStatus = (dayOfMonth?: number) => {
    if (!dayOfMonth) {
      return {
        label: 'Sin día',
        chipClass: 'bg-gray-100 text-gray-600',
        rowClass: 'bg-gray-50 border-gray-200',
      };
    }

    const todayDay = new Date().getDate();

    if (dayOfMonth === todayDay) {
      return {
        label: 'Vence hoy',
        chipClass: 'bg-red-100 text-red-700',
        rowClass: 'bg-red-50/70 border-red-200',
      };
    }

    if (dayOfMonth < todayDay) {
      return {
        label: 'Vencido',
        chipClass: 'bg-red-200 text-red-800',
        rowClass: 'bg-red-100/70 border-red-300',
      };
    }

    if (dayOfMonth > todayDay && dayOfMonth <= todayDay + 7) {
      return {
        label: 'Esta semana',
        chipClass: 'bg-orange-100 text-orange-700',
        rowClass: 'bg-orange-50/70 border-orange-200',
      };
    }

    return {
      label: 'Después',
      chipClass: 'bg-blue-100 text-blue-700',
      rowClass: 'bg-blue-50/50 border-blue-100',
    };
  };

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
              <button key={t} onClick={() => setFilterType(t as "today" | "week" | "month" | "custom")} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${filterType === t ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'today' ? 'Hoy' : t === 'week' ? 'Semana' : t === 'month' ? 'Mes' : 'Rango'}
              </button>
            ))}
          </div>
          {filterType === 'custom' && (
            <div className="flex gap-2 animate-in slide-in-from-right fade-in">
              <div className="flex items-center gap-1 border rounded-lg px-2 py-1 bg-white">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Desde</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customStartDay} onChange={(e) => updateStartDateParts({ day: e.target.value })}>
                  {Array.from({ length: startDaysInMonth }, (_, index) => {
                    const value = String(index + 1).padStart(2, '0');
                    return <option key={`start-day-${value}`} value={value}>{value}</option>;
                  })}
                </select>
                <span className="text-xs text-gray-400">/</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customStartMonth} onChange={(e) => updateStartDateParts({ month: e.target.value })}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const value = String(index + 1).padStart(2, '0');
                    return <option key={`start-month-${value}`} value={value}>{value}</option>;
                  })}
                </select>
                <span className="text-xs text-gray-400">/</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customStartYear} onChange={(e) => updateStartDateParts({ year: e.target.value })}>
                  {yearOptions.map((year) => (
                    <option key={`start-year-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 border rounded-lg px-2 py-1 bg-white">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Hasta</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customEndDay} onChange={(e) => updateEndDateParts({ day: e.target.value })}>
                  {Array.from({ length: endDaysInMonth }, (_, index) => {
                    const value = String(index + 1).padStart(2, '0');
                    return <option key={`end-day-${value}`} value={value}>{value}</option>;
                  })}
                </select>
                <span className="text-xs text-gray-400">/</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customEndMonth} onChange={(e) => updateEndDateParts({ month: e.target.value })}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const value = String(index + 1).padStart(2, '0');
                    return <option key={`end-month-${value}`} value={value}>{value}</option>;
                  })}
                </select>
                <span className="text-xs text-gray-400">/</span>
                <select className="text-xs font-bold text-gray-700 bg-white outline-none" value={customEndYear} onChange={(e) => updateEndDateParts({ year: e.target.value })}>
                  {yearOptions.map((year) => (
                    <option key={`end-year-${year}`} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- FILA 1: KPIs FINANCIEROS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* VENTA TOTAL (Todos lo ven, pero Seller ve su propio total) */}
        <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80} /></div>
          <p className="text-xs text-gray-400 uppercase font-bold mb-1">{isSeller ? 'Mis Ventas' : 'Ventas Totales'} ({filterType === 'today' ? 'Hoy' : filterType})</p>
          <h3 className="text-3xl font-black">{formatCurrency(totalSalesPeriodUSD, 'USD')}</h3>
          <p className="text-sm text-gray-400 mt-1">{filteredSales.length} operaciones</p>
        </div>

        {/* COMISIÓN ESTIMADA (Solo Seller y si el Admin la habilitó) */}
        {isSeller && settings.showSellerCommission && (
          <div className="bg-green-50 p-6 rounded-2xl border border-green-100 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10 text-green-500"><Award size={100} /></div>
            <div className="relative z-10">
              <p className="text-xs text-green-600 uppercase font-bold mb-1">Comisión Estimada (5%)</p>
              <h3 className="text-3xl font-black text-green-700">{formatCurrency(sellerCommission, 'USD')}</h3>
            </div>
          </div>
        )}

        {/* POR COBRAR y POR PAGAR (Solo Admin/Manager/Viewer) */}
        {!isSeller && (
          <>
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
          </>
        )}

        {/* Top Cliente */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10 text-blue-500"><Users size={100} /></div>
          <div className="relative z-10">
            <p className="text-xs text-blue-500 uppercase font-bold mb-1">Líder del Periodo</p>
            <h3 className="text-lg font-black text-blue-700 dark:text-blue-300 truncate">
              {topClientsList[0]?.client?.name || 'N/A'}
            </h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 self-end relative z-10">
            {topClientsList[0] ? formatCurrency(topClientsList[0].amount, 'USD') : '-'}
          </p>
        </div>
      </div>

      {!isSeller && (
        <CashFlowCards
          cashInPeriod={cashInPeriod}
          cashOutPeriod={cashOutPeriod}
          netCashFlowPeriod={netCashFlowPeriod}
        />
      )}

      {!isSeller && (
        <ExpectedByMethodTable
          expectedByMethod={expectedRowsForView}
          methodsInNegative={methodsInNegative}
          cutoffLabel={expectedCutoffLabel}
          movementsByMethod={movementsByMethod}
          onAdjustMethod={handleAdjustMethod}
          isAdmin={currentUserData?.role === 'ADMIN'}
          onDeleteMovement={handleDeleteMovement}
        />
      )}

      {/* --- FILA 2: PROYECCIÓN INVENTARIO (Azul) - Solo Admin/Manager/Viewer --- */}
      {!isSeller && (
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
      )}

      {/* --- FILA 2.5: GRÁFICAS (Solo Admin/Manager) --- */}
      {isAdminOrManager && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* GRÁFICA DE BARRAS: Ventas últimos 7 días */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg"><BarChart3 size={16} /></div>
              <h4 className="font-bold text-gray-800 text-sm">Ventas — Evolución del Período</h4>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartColors.tick, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: chartColors.tick }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={(value) => [`$${value}`, 'Total USD']}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${chartColors.tooltip.border}`,
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 12,
                    backgroundColor: chartColors.tooltip.background,
                    color: chartColors.tooltip.color,
                  }}
                  labelStyle={{ color: chartColors.tooltip.color, fontWeight: 700 }}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* GRÁFICA DONA: Métodos de Pago */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-green-100 text-green-700 rounded-lg"><DollarSign size={16} /></div>
              <h4 className="font-bold text-gray-800 text-sm">Por Método de Pago</h4>
            </div>
            {paymentData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">Sin ventas en el periodo.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`$${value}`, '']}
                    contentStyle={{
                      borderRadius: 12,
                      border: `1px solid ${chartColors.tooltip.border}`,
                      fontSize: 11,
                      boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.1)',
                      backgroundColor: chartColors.tooltip.background,
                      color: chartColors.tooltip.color,
                    }}
                    labelStyle={{ color: chartColors.tooltip.color }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8, color: chartColors.tick }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* --- FILA 2.7: RECURRENTES PENDIENTES --- */}
      {!isSeller && (
        <PendingRecurringExpensesCard
          pendingRecurringExpenses={pendingRecurringExpenses}
          currentMonthLabel={currentMonthLabel}
          recurringDueStatus={recurringDueStatus}
        />
      )}

      {/* --- FILA 3: ALERTAS, PRODUCTOS Y CLIENTES --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* COLUMNA 1: ALERTAS DE STOCK (Solo Admin/Manager/Viewer) */}
        {!isSeller && (
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
        )}

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