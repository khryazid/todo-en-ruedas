-- ============================================================
-- TABLA PLANTILLAS DE GASTOS RECURRENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description    TEXT NOT NULL,
    category       TEXT NOT NULL,
    amount_usd     NUMERIC(10,2) NOT NULL,
    amount_bs      NUMERIC(10,2),
    currency       TEXT DEFAULT 'USD' CHECK (currency IN ('USD','BS')),
    payment_method TEXT NOT NULL,
    day_of_month   INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
    is_active      BOOLEAN DEFAULT true,
    created_by     UUID,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active
    ON public.recurring_expenses(is_active);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_day_of_month
    ON public.recurring_expenses(day_of_month);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'recurring_expenses'
          AND policyname = 'Allow authenticated users full access on recurring_expenses'
    ) THEN
        CREATE POLICY "Allow authenticated users full access on recurring_expenses"
            ON public.recurring_expenses
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;
