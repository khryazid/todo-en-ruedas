-- ====================================================================
-- MIGRACIÓN: RPCs de gestión de usuarios y trigger seguro auth -> public
-- Fecha: 2026-09-21
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Actualizar contraseña de usuario de forma administrativa (solo ADMIN o auto-cambio)
CREATE OR REPLACE FUNCTION public.admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() != target_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar contraseñas de otros usuarios.';
    END IF;
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;

-- 2. Actualizar email de usuario de forma administrativa (solo ADMIN o auto-cambio)
CREATE OR REPLACE FUNCTION public.admin_update_user_email(target_user_id UUID, new_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    IF auth.uid() != target_user_id THEN
      RAISE EXCEPTION 'Permiso denegado. Solo administradores pueden cambiar correos electrónicos de otros usuarios.';
    END IF;
  END IF;

  UPDATE auth.users
  SET email = new_email, email_confirmed_at = now()
  WHERE id = target_user_id;
  
  UPDATE public.users
  SET email = new_email
  WHERE id = target_user_id;
END;
$$;

-- 3. Trigger seguro para sincronizar auth.users -> public.users con rol VIEWER por defecto
CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'usuario'), '@', 1)),
    'VIEWER',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = now();
  RETURN NEW;
END;
$$;

-- Vincular trigger a auth.users si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tr_sync_public_user_from_auth'
  ) THEN
    CREATE TRIGGER tr_sync_public_user_from_auth
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.sync_public_user_from_auth();
  END IF;
END;
$$;
