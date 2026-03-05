/**
 * @file pages/Audit.tsx
 * @description Log de Auditoría — acciones críticas del sistema.
 * Solo visible para ADMIN y MANAGER (según permissions.ts VIEW_AUDIT).
 */

import { useState, useEffect, useCallback } from 'react';
import { getRecentAuditLogs } from '../utils/audit';
import {
    Shield, RefreshCw, Filter, Search,
    Plus, Edit, Trash2, XCircle, LogIn, LogOut, AlertCircle, User
} from 'lucide-react';
import type { AuditAction } from '../types';

interface AuditEntry {
    id: string;
    user_id?: string;
    user_name?: string | null;
    user_email?: string | null;
    action: AuditAction;
    entity: string;
    entity_id?: string;
    changes?: Record<string, unknown>;
    created_at: string;
}

// --- Helpers visuales ---
const ACTION_CONFIG: Record<AuditAction, { label: string; color: string; icon: React.ElementType }> = {
    CREATE: { label: 'Creación', color: 'bg-green-100 text-green-700', icon: Plus },
    UPDATE: { label: 'Edición', color: 'bg-blue-100 text-blue-700', icon: Edit },
    DELETE: { label: 'Eliminación', color: 'bg-red-100 text-red-700', icon: Trash2 },
    CANCEL: { label: 'Anulación', color: 'bg-orange-100 text-orange-700', icon: XCircle },
    LOGIN: { label: 'Inicio Sesión', color: 'bg-purple-100 text-purple-700', icon: LogIn },
    LOGOUT: { label: 'Cierre Sesión', color: 'bg-gray-100 text-gray-600', icon: LogOut },
};

const ENTITY_LABELS: Record<string, string> = {
    user: 'Usuario',
    product: 'Producto',
    sale: 'Venta',
    client: 'Cliente',
    invoice: 'Factura',
    payment: 'Pago',
    settings: 'Configuración',
};

const ALL_ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'LOGIN', 'LOGOUT'];

export const Audit = () => {
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterAction, setFilterAction] = useState<AuditAction | 'ALL'>('ALL');
    const [filterEntity, setFilterEntity] = useState('');
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(50);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getRecentAuditLogs(limit);
            // Supabase devuelve users como array en joins; tomamos el primer elemento
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: AuditEntry[] = (data || []).map((r: any) => ({
                id: r.id,
                user_id: r.user_id,
                user_name: r.user_name,
                user_email: r.user_email,
                action: r.action as AuditAction,
                entity: r.entity,
                entity_id: r.entity_id,
                changes: r.changes,
                created_at: r.created_at,
            }));
            setLogs(mapped);
        } catch (e: unknown) {
            setError((e as Error).message || 'Error al cargar logs');
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // Filtros en cliente
    const filtered = logs.filter(log => {
        if (filterAction !== 'ALL' && log.action !== filterAction) return false;
        if (filterEntity && log.entity !== filterEntity) return false;
        if (search) {
            const term = search.toLowerCase();
            const userName = log.user_name?.toLowerCase() || '';
            const email = log.user_email?.toLowerCase() || '';
            if (!userName.includes(term) && !email.includes(term) && !log.entity.includes(term)) return false;
        }
        return true;
    });

    const uniqueEntities = [...new Set(logs.map(l => l.entity))];

    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                        <Shield className="text-indigo-600" size={28} /> Log de Auditoría
                    </h2>
                    <p className="text-gray-500 font-medium mt-1">Registro de todas las acciones críticas del sistema</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-3">
                {/* Búsqueda */}
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar usuario, entidad..."
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Filtro por acción */}
                <div className="relative flex items-center gap-2">
                    <Filter size={14} className="text-gray-400" />
                    <select
                        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-indigo-100"
                        value={filterAction}
                        onChange={e => setFilterAction(e.target.value as AuditAction | 'ALL')}
                    >
                        <option value="ALL">Todas las acciones</option>
                        {ALL_ACTIONS.map(a => (
                            <option key={a} value={a}>{ACTION_CONFIG[a].label}</option>
                        ))}
                    </select>
                </div>

                {/* Filtro por entidad */}
                <select
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-indigo-100"
                    value={filterEntity}
                    onChange={e => setFilterEntity(e.target.value)}
                >
                    <option value="">Todas las entidades</option>
                    {uniqueEntities.map(e => (
                        <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>
                    ))}
                </select>

                <span className="text-xs text-gray-400 font-medium self-center ml-auto">
                    {filtered.length} de {logs.length} registros
                </span>
            </div>

            {/* TABLA DE LOGS */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {error && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 border-b border-red-100 text-red-700">
                        <AlertCircle size={18} />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="py-20 text-center">
                        <RefreshCw size={32} className="animate-spin text-indigo-400 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Cargando logs...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-20 text-center">
                        <Shield size={48} className="mx-auto mb-3 opacity-20 text-gray-400" />
                        <p className="text-gray-400">No hay registros con estos filtros.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3">Fecha / Hora</th>
                                    <th className="px-5 py-3">Usuario</th>
                                    <th className="px-5 py-3">Acción</th>
                                    <th className="px-5 py-3">Entidad</th>
                                    <th className="px-5 py-3">Detalles</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(log => {
                                    const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.UPDATE;
                                    const ActionIcon = cfg.icon;
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50/80 transition">
                                            {/* Fecha */}
                                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                                                <p className="font-bold text-gray-800">
                                                    {new Date(log.created_at).toLocaleDateString('es-VE')}
                                                </p>
                                                <p className="text-[11px] text-gray-400">
                                                    {new Date(log.created_at).toLocaleTimeString('es-VE')}
                                                </p>
                                            </td>

                                            {/* Usuario */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                                        <User size={12} className="text-indigo-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800 text-xs">
                                                            {log.user_name || 'Sistema'}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400">{log.user_email}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Acción */}
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.color}`}>
                                                    <ActionIcon size={11} />
                                                    {cfg.label}
                                                </span>
                                            </td>

                                            {/* Entidad */}
                                            <td className="px-5 py-3">
                                                <p className="font-bold text-gray-700 capitalize">
                                                    {ENTITY_LABELS[log.entity] || log.entity}
                                                </p>
                                                {log.entity_id && (
                                                    <p className="text-[10px] font-mono text-gray-400">
                                                        #{log.entity_id.slice(-6)}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Detalles / Changes */}
                                            <td className="px-5 py-3 max-w-xs">
                                                {log.changes ? (
                                                    <details className="cursor-pointer">
                                                        <summary className="text-[11px] text-indigo-600 font-bold hover:text-indigo-800 transition list-none">
                                                            Ver cambios
                                                        </summary>
                                                        <pre className="mt-1 text-[10px] bg-gray-50 p-2 rounded-lg overflow-auto max-h-28 text-gray-600 border border-gray-100">
                                                            {JSON.stringify(log.changes, null, 2)}
                                                        </pre>
                                                    </details>
                                                ) : (
                                                    <span className="text-[11px] text-gray-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer — cargar más */}
                {!loading && logs.length >= limit && (
                    <div className="p-4 border-t border-gray-50 text-center">
                        <button
                            onClick={() => setLimit(l => l + 50)}
                            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition px-4 py-2 rounded-xl hover:bg-indigo-50"
                        >
                            Cargar 50 más...
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
