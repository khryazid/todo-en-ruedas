-- ============================================================
-- PUBLICACION REALTIME PARA SINCRONIZACION ENTRE USUARIOS
-- ============================================================
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
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
    'users'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY tables LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END;
$$;
