/**
 * @file RoleRoute.tsx
 * @description Componente que protege rutas basándose en permisos/roles.
 * Si el usuario no tiene acceso, redirige a una ruta alternativa.
 *
 * Uso:
 *   <RoleRoute allowedRoles={['ADMIN', 'MANAGER']}>
 *     <Settings />
 *   </RoleRoute>
 *
 *   <RoleRoute requiredPermission={Permission.VIEW_PRODUCTS}>
 *     <Inventory />
 *   </RoleRoute>
 */

import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import type { PermissionType } from '../utils/permissions';

interface RoleRouteProps {
    children: React.ReactNode;
    /** Si se define, el usuario debe tener AL MENOS UNO de estos roles */
    allowedRoles?: Array<'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER'>;
    /** Si se define, el usuario debe tener ESTE permiso */
    requiredPermission?: PermissionType;
    /** Si se define, el usuario debe tener AL MENOS UNO de estos permisos */
    requiredPermissions?: PermissionType[];
    /** Ruta a la que redirigir si no tiene acceso. Default: '/sales' */
    redirectTo?: string;
}

export const RoleRoute = ({
    children,
    allowedRoles,
    requiredPermission,
    requiredPermissions,
    redirectTo = '/sales',
}: RoleRouteProps) => {
    const { role, can, canAny } = usePermissions();

    // Sin usuario cargado todavía, renderizar vacío (App.tsx maneja el loading)
    if (!role) return null;

    // Verificar por roles exactos
    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to={redirectTo} replace />;
    }

    // Verificar permiso único
    if (requiredPermission && !can(requiredPermission)) {
        return <Navigate to={redirectTo} replace />;
    }

    // Verificar al menos uno de varios permisos
    if (requiredPermissions && requiredPermissions.length > 0 && !canAny(requiredPermissions)) {
        return <Navigate to={redirectTo} replace />;
    }

    return <>{children}</>;
};
