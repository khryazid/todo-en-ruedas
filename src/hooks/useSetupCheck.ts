/**
 * @file hooks/useSetupCheck.ts
 * @description Hook para verificar si la app necesita configuración inicial
 */

import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';

export const useSetupCheck = () => {
    const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        checkSetupStatus();
    }, []);

    const checkSetupStatus = async () => {
        try {
            setIsChecking(true);

            // ✅ FIX: Consultamos 'settings' en lugar de 'users'.
            // La tabla 'users' está protegida por RLS y sin sesión activa
            // devuelve count=0, forzando el setup aunque la empresa ya exista.
            // 'settings' es la fuente de verdad: si existe un registro, la app
            // ya fue configurada.
            const { count, error } = await supabase
                .from('settings')
                .select('*', { count: 'exact', head: true });

            if (error) {
                // Error de tabla no existente → sí necesita setup
                if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
                    setNeedsSetup(true);
                    setIsChecking(false);
                    return;
                }
                // Error de permisos RLS (42501 / PGRST301) → la tabla existe
                // pero el anon key no puede leerla: asumimos empresa configurada,
                // el usuario deberá iniciar sesión.
                if (error.code === '42501' || error.code === 'PGRST301') {
                    setNeedsSetup(false);
                    setIsChecking(false);
                    return;
                }
                throw error;
            }

            // Si count es 0 (o null), no hay empresa registrada → necesita setup
            setNeedsSetup((count ?? 0) === 0);
        } catch (error) {
            console.error('Error checking setup status:', error);
            // En caso de error desconocido, no forzar setup (ir a login es más seguro)
            setNeedsSetup(false);
        } finally {
            setIsChecking(false);
        }
    };

    return { needsSetup, isChecking, recheckSetup: checkSetupStatus };
};
