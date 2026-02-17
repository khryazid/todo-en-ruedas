import type { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import type { PermissionType } from '../utils/permissions';

interface ProtectedActionProps {
    children: ReactNode;
    permission: PermissionType;
    fallback?: ReactNode;
    hideIfNoPermission?: boolean;
}

/**
 * Componente que protege acciones (botones, links, etc.) según permisos
 * Si el usuario no tiene permiso, puede ocultar o mostrar un fallback
 */
export function ProtectedAction({
    children,
    permission,
    fallback = null,
    hideIfNoPermission = true
}: ProtectedActionProps) {
    const { can } = usePermissions();

    const hasPermission = can(permission);

    if (!hasPermission) {
        return hideIfNoPermission ? null : <>{fallback}</>;
    }

    return <>{children}</>;
}

interface RoleGuardProps {
    children: ReactNode;
    allowedRoles: Array<'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER'>;
    fallback?: ReactNode;
}

/**
 * Componente que renderiza children solo si el usuario tiene uno de los roles permitidos
 */
export function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
    const { role } = usePermissions();

    if (!role || !allowedRoles.includes(role)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
