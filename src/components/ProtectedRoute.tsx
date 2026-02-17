import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import type { PermissionType } from '../utils/permissions';

interface ProtectedRouteProps {
    children: ReactNode;
    requiredPermissions?: PermissionType[];
    requireAll?: boolean; // Si true, requiere TODOS los permisos. Si false, requiere AL MENOS UNO
    allowedRoles?: Array<'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER'>;
    redirectTo?: string;
}

/**
 * Componente que protege rutas según permisos o roles
 * Si el usuario no tiene acceso, redirige a la página especificada
 */
export function ProtectedRoute({
    children,
    requiredPermissions,
    requireAll = false,
    allowedRoles,
    redirectTo = '/dashboard'
}: ProtectedRouteProps) {
    const { role, canAny, can } = usePermissions();

    // Si no hay usuario logueado, redirigir a login
    if (!role) {
        return <Navigate to="/login" replace />;
    }

    // Verificar por roles si se especificaron
    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to={redirectTo} replace />;
    }

    // Verificar por permisos si se especificaron
    if (requiredPermissions && requiredPermissions.length > 0) {
        if (requireAll) {
            // Requiere TODOS los permisos
            const hasAllPermissions = requiredPermissions.every(permission => can(permission));
            if (!hasAllPermissions) {
                return <Navigate to={redirectTo} replace />;
            }
        } else {
            // Requiere AL MENOS UNO
            const hasAnyPermission = canAny(requiredPermissions);
            if (!hasAnyPermission) {
                return <Navigate to={redirectTo} replace />;
            }
        }
    }

    return <>{children}</>;
}
