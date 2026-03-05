/**
 * @file utils/audit.ts
 * @description Sistema de auditoría para rastrear acciones críticas
 */

import { supabase } from '../supabase/client';
import type { AuditAction } from '../types';

interface AuditLogData {
    action: AuditAction;
    entity: string;
    entityId?: string;
    changes?: Record<string, unknown>;
}

/**
 * Registra una acción en el log de auditoría
 */
export const logAudit = async (data: AuditLogData): Promise<void> => {
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            console.warn('No se puede registrar auditoría: usuario no autenticado');
            return;
        }

        await supabase.from('audit_logs').insert({
            user_id: user.id,
            user_name: (user.user_metadata?.full_name as string | undefined) || null,
            user_email: user.email || null,
            action: data.action,
            entity: data.entity,
            entity_id: data.entityId,
            changes: data.changes,
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error al registrar auditoría:', error);
        // No lanzar error para no interrumpir la operación principal
    }
};

/**
 * Obtiene los logs de auditoría recientes
 */
export const getRecentAuditLogs = async (limit = 50) => {
    const { data, error } = await supabase
        .from('audit_logs')
        .select(`
      id,
            user_id,
            user_name,
            user_email,
      action,
      entity,
      entity_id,
      changes,
            created_at
    `)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
};

/**
 * Obtiene logs de auditoría para una entidad específica
 */
export const getEntityAuditLogs = async (entity: string, entityId: string) => {
    const { data, error } = await supabase
        .from('audit_logs')
        .select(`
      id,
            user_id,
            user_name,
            user_email,
      action,
      changes,
      created_at,
            entity,
            entity_id
    `)
        .eq('entity', entity)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
};
