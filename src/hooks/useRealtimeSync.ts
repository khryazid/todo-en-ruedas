import { useEffect, useRef } from 'react';
import { supabase } from '../supabase/client';
import { useStore } from '../store/useStore';

const HIGH_PRIORITY_TABLES = new Set<string>([
  'sales',
  'sale_items',
  'payments',
  'products',
]);

const ALLOWED_WHEN_PAUSED_TABLES = new Set<string>([
  'products',
]);

const REALTIME_TABLES = [
  'products',
  'clients',
  'sales',
  'sale_items',
  'payments',
  'suppliers',
  'invoices',
  'payment_methods',
  'quotes',
  'returns',
  'stock_movements',
  'expenses',
  'recurring_expenses',
  'cash_ledger',
  'settings',
  'users',
] as const;

export const useRealtimeSync = () => {
  const user = useStore((s) => s.user);
  const isRealtimeSyncPaused = useStore((s) => s.isRealtimeSyncPaused);
  const fetchInitialData = useStore((s) => s.fetchInitialData);
  const fetchProducts = useStore((s) => s.fetchProducts);
  const fetchClients = useStore((s) => s.fetchClients);
  const fetchSettingsData = useStore((s) => s.fetchSettingsData);
  const fetchSuppliers = useStore((s) => s.fetchSuppliers);
  const fetchInvoices = useStore((s) => s.fetchInvoices);
  const fetchSales = useStore((s) => s.fetchSales);
  const fetchQuotes = useStore((s) => s.fetchQuotes);
  const fetchExpenses = useStore((s) => s.fetchExpenses);
  const fetchCashLedger = useStore((s) => s.fetchCashLedger);
  const fetchReturns = useStore((s) => s.fetchReturns);
  const fetchStockMovements = useStore((s) => s.fetchStockMovements);
  const fetchUsers = useStore((s) => s.fetchUsers);
  const fetchCurrentUserData = useStore((s) => s.fetchCurrentUserData);

  const highPriorityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalPriorityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHighTablesRef = useRef<Set<string>>(new Set());
  const pendingNormalTablesRef = useRef<Set<string>>(new Set());
  const pausedRef = useRef(isRealtimeSyncPaused);
  const isSyncingRef = useRef(false);
  const pendingRef = useRef(false);
  const triggerSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pausedRef.current = isRealtimeSyncPaused;
  }, [isRealtimeSyncPaused]);

  useEffect(() => {
    if (!user) return;

    const runTargetedSync = async (table: string) => {
      switch (table) {
        case 'quotes':
          await fetchQuotes();
          return;
        case 'sales':
        case 'sale_items':
        case 'payments':
          await Promise.all([fetchSales(), fetchProducts()]);
          return;
        case 'products':
          await fetchProducts();
          return;
        case 'clients':
          await fetchClients();
          return;
        case 'settings':
        case 'payment_methods':
          await fetchSettingsData();
          return;
        case 'suppliers':
          await fetchSuppliers();
          await fetchInvoices();
          return;
        case 'invoices':
          await fetchInvoices();
          return;
        case 'expenses':
          await fetchExpenses();
          return;
        case 'cash_ledger':
          await fetchCashLedger();
          return;
        case 'returns':
          await fetchReturns();
          return;
        case 'stock_movements':
          await fetchStockMovements();
          return;
        case 'users':
          await Promise.all([fetchUsers(), fetchCurrentUserData()]);
          return;
        case 'recurring_expenses':
          // Se maneja por suscripciones dedicadas en pages/Expenses y pages/Dashboard.
          return;
        default:
          await fetchInitialData();
          await fetchReturns();
      }
    };

    const runSyncBatch = async (tables: string[]) => {

      if (tables.length === 0) return;

      for (const table of tables) {
        await runTargetedSync(table);
      }
    };

    const runSync = async () => {
      if (isSyncingRef.current) {
        pendingRef.current = true;
        return;
      }

      isSyncingRef.current = true;
      try {
        const queuedTables = [
          ...Array.from(pendingHighTablesRef.current),
          ...Array.from(pendingNormalTablesRef.current),
        ];

        let tablesToSync = Array.from(new Set(queuedTables));

        if (pausedRef.current) {
          tablesToSync = tablesToSync.filter((table) => ALLOWED_WHEN_PAUSED_TABLES.has(table));
          if (tablesToSync.length === 0) {
            pendingRef.current = true;
            return;
          }
        }

        tablesToSync.forEach((table) => {
          pendingHighTablesRef.current.delete(table);
          pendingNormalTablesRef.current.delete(table);
        });

        await runSyncBatch(tablesToSync);
      } catch (error) {
        console.warn('Realtime sync error:', error);
      } finally {
        isSyncingRef.current = false;

        if (pendingRef.current) {
          pendingRef.current = false;
          void runSync();
        }
      }
    };

    triggerSyncRef.current = () => {
      if (pausedRef.current && pendingHighTablesRef.current.size === 0) return;
      if (highPriorityTimerRef.current) clearTimeout(highPriorityTimerRef.current);
      highPriorityTimerRef.current = setTimeout(() => {
        void runSync();
      }, 50);
    };

    const scheduleHighPrioritySync = (allowWhenPaused = false) => {
      if (pausedRef.current && !allowWhenPaused) return;
      if (highPriorityTimerRef.current) clearTimeout(highPriorityTimerRef.current);
      highPriorityTimerRef.current = setTimeout(() => {
        void runSync();
      }, 250);
    };

    const scheduleNormalPrioritySync = () => {
      if (pausedRef.current) return;
      if (normalPriorityTimerRef.current) clearTimeout(normalPriorityTimerRef.current);
      normalPriorityTimerRef.current = setTimeout(() => {
        void runSync();
      }, 1200);
    };

    const scheduleSync = (table: string) => {
      if (HIGH_PRIORITY_TABLES.has(table)) {
        pendingHighTablesRef.current.add(table);
        scheduleHighPrioritySync(ALLOWED_WHEN_PAUSED_TABLES.has(table));
        return;
      }

      pendingNormalTablesRef.current.add(table);
      scheduleNormalPrioritySync();
    };

    const channel = supabase.channel(`global-sync-${user.id}`);

    REALTIME_TABLES.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          scheduleSync(table);
        }
      );
    });

    channel.subscribe();

    if (!pausedRef.current && (pendingHighTablesRef.current.size > 0 || pendingNormalTablesRef.current.size > 0)) {
      if (highPriorityTimerRef.current) clearTimeout(highPriorityTimerRef.current);
      highPriorityTimerRef.current = setTimeout(() => {
        void runSync();
      }, 100);
    }

    return () => {
      if (highPriorityTimerRef.current) {
        clearTimeout(highPriorityTimerRef.current);
        highPriorityTimerRef.current = null;
      }
      if (normalPriorityTimerRef.current) {
        clearTimeout(normalPriorityTimerRef.current);
        normalPriorityTimerRef.current = null;
      }
      pendingHighTablesRef.current.clear();
      pendingNormalTablesRef.current.clear();
      triggerSyncRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [
    user,
    fetchInitialData,
    fetchProducts,
    fetchClients,
    fetchSettingsData,
    fetchSuppliers,
    fetchInvoices,
    fetchSales,
    fetchQuotes,
    fetchExpenses,
    fetchCashLedger,
    fetchReturns,
    fetchStockMovements,
    fetchUsers,
    fetchCurrentUserData,
  ]);

  useEffect(() => {
    if (isRealtimeSyncPaused) return;

    const hasPending = pendingHighTablesRef.current.size > 0 || pendingNormalTablesRef.current.size > 0;
    if (hasPending && triggerSyncRef.current) {
      triggerSyncRef.current();
    }
  }, [isRealtimeSyncPaused]);
};
