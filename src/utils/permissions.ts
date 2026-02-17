import type { AppUser } from '../types';

// =====================================================
// DEFINICIÓN DE PERMISOS
// =====================================================

export const Permission = {
    // --- Usuarios ---
    VIEW_USERS: 'view_users',
    CREATE_USER: 'create_user',
    EDIT_USER: 'edit_user',
    DELETE_USER: 'delete_user',
    MANAGE_ADMINS: 'manage_admins',

    // --- Productos ---
    VIEW_PRODUCTS: 'view_products',
    CREATE_PRODUCT: 'create_product',
    EDIT_PRODUCT: 'edit_product',
    DELETE_PRODUCT: 'delete_product',
    EDIT_PRICES: 'edit_prices',

    // --- Clientes ---
    VIEW_CLIENTS: 'view_clients',
    CREATE_CLIENT: 'create_client',
    EDIT_CLIENT: 'edit_client',
    DELETE_CLIENT: 'delete_client',

    // --- Ventas ---
    VIEW_ALL_SALES: 'view_all_sales',
    VIEW_OWN_SALES: 'view_own_sales',
    CREATE_SALE: 'create_sale',
    EDIT_SALE: 'edit_sale',
    DELETE_SALE: 'delete_sale',

    // --- Cotizaciones ---
    VIEW_QUOTES: 'view_quotes',
    CREATE_QUOTE: 'create_quote',
    EDIT_QUOTE: 'edit_quote',
    DELETE_QUOTE: 'delete_quote',

    // --- Cuentas por Cobrar ---
    VIEW_RECEIVABLES: 'view_receivables',
    MANAGE_RECEIVABLES: 'manage_receivables',

    // --- Reportes ---
    VIEW_REPORTS: 'view_reports',
    VIEW_FULL_REPORTS: 'view_full_reports',

    // --- Configuración ---
    VIEW_SETTINGS: 'view_settings',
    EDIT_SETTINGS: 'edit_settings',

    // --- Auditoría ---
    VIEW_AUDIT: 'view_audit',

    // --- Caja ---
    CLOSE_CASH: 'close_cash',
} as const;

export type PermissionType = typeof Permission[keyof typeof Permission];

// =====================================================
// MATRIZ DE PERMISOS POR ROL
// =====================================================

export const ROLE_PERMISSIONS: Record<AppUser['role'], PermissionType[]> = {
    ADMIN: [
        // Usuarios
        Permission.VIEW_USERS,
        Permission.CREATE_USER,
        Permission.EDIT_USER,
        Permission.DELETE_USER,
        Permission.MANAGE_ADMINS,

        // Productos
        Permission.VIEW_PRODUCTS,
        Permission.CREATE_PRODUCT,
        Permission.EDIT_PRODUCT,
        Permission.DELETE_PRODUCT,
        Permission.EDIT_PRICES,

        // Clientes
        Permission.VIEW_CLIENTS,
        Permission.CREATE_CLIENT,
        Permission.EDIT_CLIENT,
        Permission.DELETE_CLIENT,

        // Ventas
        Permission.VIEW_ALL_SALES,
        Permission.CREATE_SALE,
        Permission.EDIT_SALE,
        Permission.DELETE_SALE,

        // Cotizaciones
        Permission.VIEW_QUOTES,
        Permission.CREATE_QUOTE,
        Permission.EDIT_QUOTE,
        Permission.DELETE_QUOTE,

        // Cuentas por Cobrar
        Permission.VIEW_RECEIVABLES,
        Permission.MANAGE_RECEIVABLES,

        // Reportes
        Permission.VIEW_REPORTS,
        Permission.VIEW_FULL_REPORTS,

        // Configuración
        Permission.VIEW_SETTINGS,
        Permission.EDIT_SETTINGS,

        // Auditoría
        Permission.VIEW_AUDIT,

        // Caja
        Permission.CLOSE_CASH,
    ],

    MANAGER: [
        // Usuarios (solo SELLER y VIEWER)
        Permission.VIEW_USERS,
        Permission.CREATE_USER,
        Permission.EDIT_USER,
        Permission.DELETE_USER, // ✅ AGREGADO: Puede desactivar SELLER/VIEWER

        // Productos
        Permission.VIEW_PRODUCTS,
        Permission.CREATE_PRODUCT,
        Permission.EDIT_PRODUCT,
        Permission.DELETE_PRODUCT,
        Permission.EDIT_PRICES,

        // Clientes
        Permission.VIEW_CLIENTS,
        Permission.CREATE_CLIENT,
        Permission.EDIT_CLIENT,
        Permission.DELETE_CLIENT,

        // Ventas
        Permission.VIEW_ALL_SALES,
        Permission.CREATE_SALE,
        Permission.EDIT_SALE,
        Permission.DELETE_SALE,

        // Cotizaciones
        Permission.VIEW_QUOTES,
        Permission.CREATE_QUOTE,
        Permission.EDIT_QUOTE,
        Permission.DELETE_QUOTE,

        // Cuentas por Cobrar
        Permission.VIEW_RECEIVABLES,
        Permission.MANAGE_RECEIVABLES,

        // Reportes
        Permission.VIEW_REPORTS,
        Permission.VIEW_FULL_REPORTS,

        // Configuración (solo lectura)
        Permission.VIEW_SETTINGS,

        // Auditoría (solo lectura)
        Permission.VIEW_AUDIT,

        // Caja
        Permission.CLOSE_CASH,
    ],

    SELLER: [
        // Productos (solo lectura)
        Permission.VIEW_PRODUCTS,

        // Clientes
        Permission.VIEW_CLIENTS,
        Permission.CREATE_CLIENT, // ✅ AGREGADO: Puede registrar clientes nuevos

        // Ventas (solo propias)
        Permission.VIEW_OWN_SALES,
        Permission.CREATE_SALE,

        // Cotizaciones (solo propias)
        Permission.VIEW_QUOTES,
        Permission.CREATE_QUOTE,
        Permission.EDIT_QUOTE, // Solo puede editar sus propias cotizaciones

        // Cuentas por Cobrar (solo lectura)
        Permission.VIEW_RECEIVABLES,

        // Reportes (limitado a sus propios datos)
        Permission.VIEW_REPORTS, // ✅ AGREGADO: Puede ver sus estadísticas
    ],

    VIEWER: [
        // Solo lectura para contabilidad
        // Dashboard (acceso por defecto)

        // Ventas (solo lectura para contabilidad)
        Permission.VIEW_ALL_SALES,

        // Reportes (para análisis contable)
        Permission.VIEW_REPORTS,
        Permission.VIEW_FULL_REPORTS,
    ],
};

// =====================================================
// PÁGINAS Y PERMISOS REQUERIDOS
// =====================================================

export const PAGE_PERMISSIONS: Record<string, PermissionType[]> = {
    '/dashboard': [], // Todos pueden ver dashboard
    '/products': [Permission.VIEW_PRODUCTS],
    '/clients': [Permission.VIEW_CLIENTS],
    '/sales': [Permission.VIEW_OWN_SALES, Permission.VIEW_ALL_SALES], // Al menos uno
    '/quotes': [Permission.VIEW_QUOTES],
    '/receivables': [Permission.VIEW_RECEIVABLES],
    '/reports': [Permission.VIEW_REPORTS],
    '/users': [Permission.VIEW_USERS],
    '/settings': [Permission.VIEW_SETTINGS],
    '/audit': [Permission.VIEW_AUDIT],
};

// =====================================================
// FUNCIONES HELPER
// =====================================================

/**
 * Verifica si un rol tiene un permiso específico
 */
export function hasPermission(role: AppUser['role'], permission: PermissionType): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica si un rol tiene al menos uno de los permisos especificados
 */
export function hasAnyPermission(role: AppUser['role'], permissions: PermissionType[]): boolean {
    return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Verifica si un rol tiene todos los permisos especificados
 */
export function hasAllPermissions(role: AppUser['role'], permissions: PermissionType[]): boolean {
    return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Verifica si un rol puede acceder a una página
 */
export function canAccessPage(role: AppUser['role'], page: string): boolean {
    const requiredPermissions = PAGE_PERMISSIONS[page];

    // Si no hay permisos requeridos, todos pueden acceder
    if (!requiredPermissions || requiredPermissions.length === 0) {
        return true;
    }

    // Debe tener al menos uno de los permisos requeridos
    return hasAnyPermission(role, requiredPermissions);
}

/**
 * Obtiene todas las páginas accesibles para un rol
 */
export function getAccessiblePages(role: AppUser['role']): string[] {
    return Object.keys(PAGE_PERMISSIONS).filter(page => canAccessPage(role, page));
}

/**
 * Verifica si un usuario puede crear usuarios de un rol específico
 */
export function canCreateUserWithRole(userRole: AppUser['role'], targetRole: AppUser['role']): boolean {
    // ADMIN puede crear cualquier rol
    if (userRole === 'ADMIN') {
        return true;
    }

    // MANAGER solo puede crear SELLER y VIEWER
    if (userRole === 'MANAGER') {
        return targetRole === 'SELLER' || targetRole === 'VIEWER';
    }

    // Otros roles no pueden crear usuarios
    return false;
}

/**
 * Obtiene el nombre legible de un rol
 */
export function getRoleName(role: AppUser['role']): string {
    const roleNames: Record<AppUser['role'], string> = {
        ADMIN: 'Administrador',
        MANAGER: 'Gerente',
        SELLER: 'Vendedor',
        VIEWER: 'Visualizador'
    };
    return roleNames[role];
}

/**
 * Obtiene el color del badge para un rol
 */
export function getRoleColor(role: AppUser['role']): string {
    const roleColors: Record<AppUser['role'], string> = {
        ADMIN: 'bg-purple-100 text-purple-800',
        MANAGER: 'bg-blue-100 text-blue-800',
        SELLER: 'bg-green-100 text-green-800',
        VIEWER: 'bg-gray-100 text-gray-800'
    };
    return roleColors[role];
}
