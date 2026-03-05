-- Atomic stock delta update to avoid stale absolute writes in concurrent flows.
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id uuid,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock numeric;
  v_new_stock numeric;
BEGIN
  SELECT stock INTO v_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_product_id;
  END IF;

  v_new_stock := v_stock + coalesce(p_delta, 0);

  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'STOCK_NEGATIVO:%:actual=%,delta=%', p_product_id, v_stock, p_delta;
  END IF;

  UPDATE public.products
  SET stock = v_new_stock
  WHERE id = p_product_id;

  RETURN v_new_stock;
END;
$$;
