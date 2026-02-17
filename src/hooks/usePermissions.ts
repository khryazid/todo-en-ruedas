import { useStore } from '../store/useStore';
import type { PermissionType } from '../utils/permissions';
import { hasPermission, hasAnyPermission, canAccessPage } from '../utils/permissions';

/**
 * Hook personalizado para verificar permisos del usuario actual
 */
export function usePermissions() {
    const { currentUserData } = useStore();

    const role = currentUserData?.role;

    return {
        role,

        /**
         * Verifica si el usuario tiene un permiso específico
         */
        can: (permission: PermissionType): boolean => {
            if (!role) return false;
            return hasPermission(role, permission);
        },

        /**
         * Verifica si el usuario tiene al menos uno de los permisos
         */
        canAny: (permissions: PermissionType[]): boolean => {
            if (!role) return false;
            return hasAnyPermission(role, permissions);
        },

        /**
         * Verifica si el usuario puede acceder a una página
         */
        canAccessPage: (page: string): boolean => {
            if (!role) return false;
            return canAccessPage(role, page);
        },

        /**
         * Verifica si es ADMIN
         */
        isAdmin: role === 'ADMIN',

        /**
         * Verifica si es MANAGER
         */
        isManager: role === 'MANAGER',

        /**
         * Verifica si es SELLER
         */
        isSeller: role === 'SELLER',

        /**
         * Verifica si es VIEWER
         */
        isViewer: role === 'VIEWER',

        /**
         * Verifica si puede modificar (no es VIEWER)
         */
        canModify: role !== 'VIEWER',

        /**
         * Verifica si puede gestionar usuarios
         */
        canManageUsers: role === 'ADMIN' || role === 'MANAGER',
    };
}
