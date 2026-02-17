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

            // Verificar si existe la tabla users y contar registros
            const { data, error, count } = await supabase
                .from('users')
                .select('*', { count: 'exact' });

            if (error) {
                // Si la tabla no existe, necesita setup
                if (error.code === 'PGRST116' || error.message?.includes('relation')) {

                    setNeedsSetup(true);
                    setIsChecking(false);
                    return;
                }
                throw error;
            }

            // Si count es 0, necesita setup
            const userCount = count ?? 0;

            setNeedsSetup(userCount === 0);
        } catch (error) {
            console.error('Error checking setup status:', error);
            // En caso de error, asumir que necesita setup
            setNeedsSetup(true);
        } finally {
            setIsChecking(false);
        }
    };

    return { needsSetup, isChecking, recheckSetup: checkSetupStatus };
};
