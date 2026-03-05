-- ============================================================
-- RPC TRANSACCIONAL PARA VENTAS (ANTI-SOBREVENTA)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_sale_atomic(
  p_client_id uuid,
  p_payment_method text,
  p_paid_amount_usd numeric,
  p_status text,
  p_total_usd numeric,
  p_total_ved numeric,
  p_is_credit boolean,
  p_user_id uuid,
  p_seller_name text,
  p_items jsonb
)
RETURNS TABLE (sale_id uuid, local_id integer, sale_date timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  v_sale_id uuid;
  v_local_id integer;
  v_sale_date timestamptz;
  v_product_id uuid;
  v_quantity numeric;
  v_stock numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito esta vacio';
  END IF;

  INSERT INTO public.sales (
    client_id,
    total_usd,
    total_ved,
    payment_method,
    status,
    paid_amount_usd,
    is_credit,
    user_id,
    seller_name,
    date
  ) VALUES (
    p_client_id,
    p_total_usd,
    p_total_ved,
    p_payment_method,
    p_status,
    p_paid_amount_usd,
    p_is_credit,
    p_user_id,
    p_seller_name,
    now()
  )
  RETURNING id, sales.local_id, sales.date
  INTO v_sale_id, v_local_id, v_sale_date;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (item ->> 'product_id')::uuid;
    v_quantity := (item ->> 'quantity')::numeric;

    SELECT stock INTO v_stock
    FROM public.products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;

    IF v_stock < v_quantity THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%:disponible=%,solicitado=%', v_product_id, v_stock, v_quantity;
    END IF;

    UPDATE public.products
    SET stock = stock - v_quantity
    WHERE id = v_product_id;

    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      sku,
      product_name_snapshot,
      quantity,
      unit_price_usd,
      cost_unit_usd
    ) VALUES (
      v_sale_id,
      v_product_id,
      item ->> 'sku',
      item ->> 'product_name',
      v_quantity,
      (item ->> 'unit_price_usd')::numeric,
      (item ->> 'cost_unit_usd')::numeric
    );
  END LOOP;

  IF p_paid_amount_usd > 0 THEN
    INSERT INTO public.payments (sale_id, amount_usd, method, note)
    VALUES (v_sale_id, p_paid_amount_usd, p_payment_method, 'Pago Inicial');
  END IF;

  RETURN QUERY
  SELECT v_sale_id, v_local_id, v_sale_date;
END;
$$;
