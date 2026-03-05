-- ====================================================================
-- MIGRACION: sincronizar auth.users -> public.users
-- Fecha: 2026-03-04
-- Objetivo:
--   1) Evitar sesiones con usuario sin fila en public.users.
--   2) Autocrear/sincronizar perfil al crear o actualizar auth.users.
--   3) Backfill de usuarios ya existentes en Auth.
-- ====================================================================

BEGIN;

-- Crea o actualiza la fila espejo en public.users usando metadata de Auth.
CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role text;
  resolved_name text;
BEGIN
  resolved_role := upper(coalesce(NEW.raw_user_meta_data ->> 'role', 'VIEWER'));
  IF resolved_role NOT IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER') THEN
    resolved_role := 'VIEWER';
  END IF;

  resolved_name := coalesce(
    nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(NEW.email, ''), '@', 1),
    'Usuario'
  );

  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    is_active,
    updated_at
  )
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    resolved_name,
    resolved_role,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_user_from_auth ON auth.users;

CREATE TRIGGER trg_sync_public_user_from_auth
AFTER INSERT OR UPDATE OF email, raw_user_meta_data
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_from_auth();

-- Backfill de cualquier usuario de Auth que aun no exista en public.users.
INSERT INTO public.users (
  id,
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
)
SELECT
  au.id,
  coalesce(au.email, ''),
  coalesce(
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(au.email, ''), '@', 1),
    'Usuario'
  ) AS full_name,
  CASE
    WHEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'VIEWER')) IN ('ADMIN', 'MANAGER', 'SELLER', 'VIEWER')
      THEN upper(coalesce(au.raw_user_meta_data ->> 'role', 'VIEWER'))
    ELSE 'VIEWER'
  END AS role,
  true,
  now(),
  now()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

COMMIT;
