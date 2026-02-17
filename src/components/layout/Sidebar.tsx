/**
 * @file Sidebar.tsx
 * @description Barra de Navegación Lateral Colapsable.
 *
 * ✅ MEJORAS:
 *   - Modo colapsado: solo muestra iconos (ancho 72px)
 *   - Modo expandido: iconos + etiquetas (ancho 256px)
 *   - Tooltips en modo colapsado para saber qué es cada icono
 *   - Estado guardado en localStorage para recordar preferencia
 *   - Transición suave entre estados
 *   - Móvil: sigue usando overlay como antes
 */

import { useState, memo, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../utils/permissions';
import {
  LayoutDashboard, ShoppingCart, Package, FileText,
  Settings, LogOut, Menu, X, History, PieChart, Users, Wallet,
  ChevronsLeft, ChevronsRight, Shield
} from 'lucide-react';

import type { PermissionType } from '../../utils/permissions';

interface MenuItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  requiredPermissions?: PermissionType[];
  allowedRoles?: Array<'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER'>;
}

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/dashboard'
  },
  {
    icon: ShoppingCart,
    label: 'Ventas',
    path: '/pos',
    requiredPermissions: [Permission.CREATE_SALE]
  },
  {
    icon: History,
    label: 'Historial',
    path: '/sales',
    requiredPermissions: [Permission.VIEW_OWN_SALES, Permission.VIEW_ALL_SALES]
  },
  {
    icon: PieChart,
    label: 'Cierre de Caja',
    path: '/daily-close',
    requiredPermissions: [Permission.CLOSE_CASH]
  },
  {
    icon: Package,
    label: 'Inventario',
    path: '/inventory',
    allowedRoles: ['ADMIN', 'MANAGER'] // SELLER no tiene acceso a inventario
  },
  {
    icon: Wallet,
    label: 'Ctas por Cobrar',
    path: '/accounts-receivable',
    requiredPermissions: [Permission.VIEW_RECEIVABLES]
  },
  {
    icon: FileText,
    label: 'Ctas. por Pagar',
    path: '/invoices',
    allowedRoles: ['ADMIN', 'MANAGER', 'VIEWER'] // VIEWER puede ver facturas para contabilidad
  },
  {
    icon: Users,
    label: 'Clientes',
    path: '/clients',
    requiredPermissions: [Permission.VIEW_CLIENTS]
  },
  {
    icon: Shield,
    label: 'Usuarios',
    path: '/users',
    requiredPermissions: [Permission.VIEW_USERS]
  },
  {
    icon: Settings,
    label: 'Configuración',
    path: '/settings',
    requiredPermissions: [Permission.VIEW_SETTINGS]
  },
];

export const Sidebar = memo(() => {
  // Móvil: overlay abierto/cerrado
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Desktop: colapsado (solo iconos) o expandido
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const logout = useStore(s => s.logout);
  const currentUserData = useStore(s => s.currentUserData);
  const { canAny, role } = usePermissions();

  // Filtrar items del menú según permisos
  const visibleMenuItems = menuItems.filter(item => {
    // Si no hay usuario logueado, mostrar solo dashboard
    if (!currentUserData || !role) {
      return item.path === '/dashboard';
    }

    // Si el item especifica roles permitidos, verificar
    if (item.allowedRoles && !item.allowedRoles.includes(role)) {
      return false;
    }

    // Si el item requiere permisos, verificar (al menos uno)
    if (item.requiredPermissions && item.requiredPermissions.length > 0) {
      return canAny(item.requiredPermissions);
    }

    // Si no tiene restricciones, mostrar
    return true;
  });

  // Persistir preferencia
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    } catch { /* ignore */ }
  }, [isCollapsed]);

  const toggleCollapse = () => setIsCollapsed(prev => !prev);

  return (
    <>
      {/* BOTÓN HAMBURGUESA — solo móvil */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg"
      >
        {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* OVERLAY MÓVIL */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed md:relative z-40 h-full bg-gray-900 text-white flex flex-col
          transition-all duration-300 ease-in-out shadow-2xl
          ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-[72px]' : 'md:w-64'}
        `}
      >
        {/* HEADER */}
        <div className={`border-b border-gray-800 flex items-center ${isCollapsed ? 'justify-center p-4' : 'justify-between p-6'}`}>
          {isCollapsed ? (
            <div className="text-center">
              <span className="text-xl font-black text-red-600">TR</span>
            </div>
          ) : (
            <div className="text-center flex-1">
              <h1 className="text-2xl font-black tracking-tighter text-white">
                TODO EN <span className="text-red-600">RUEDAS</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">
                Sistema de Gestión
              </p>
            </div>
          )}
        </div>

        {/* NAVEGACIÓN */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 custom-scrollbar">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileOpen(false)}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) => `
                relative flex items-center rounded-xl transition-all duration-200 group font-medium
                ${isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'}
                ${isActive
                  ? 'bg-red-600 text-white shadow-lg shadow-red-900/50'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <item.icon size={20} className="flex-shrink-0 group-hover:scale-110 transition-transform" />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}

              {/* Tooltip en modo colapsado */}
              {isCollapsed && (
                <div className="
                  absolute left-full ml-3 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold
                  rounded-lg shadow-lg whitespace-nowrap opacity-0 invisible
                  group-hover:opacity-100 group-hover:visible transition-all duration-200
                  pointer-events-none z-50
                ">
                  {item.label}
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* FOOTER */}
        <div className={`border-t border-gray-800 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {/* Usuario Actual */}
          {currentUserData && (
            <div className={`
              ${isCollapsed ? 'mb-2' : 'mb-3 px-3 py-2'}
              ${!isCollapsed && 'bg-gray-800/50 rounded-lg'}
            `}>
              {isCollapsed ? (
                <div className="flex justify-center">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                    {currentUserData.fullName.charAt(0).toUpperCase()}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold shadow-lg">
                      {currentUserData.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">
                        {currentUserData.fullName}
                      </p>
                      <p className="text-gray-400 text-xs truncate">
                        {currentUserData.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <span className={`
                      inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                      ${currentUserData.role === 'ADMIN' ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50' : ''}
                      ${currentUserData.role === 'MANAGER' ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' : ''}
                      ${currentUserData.role === 'SELLER' ? 'bg-green-900/50 text-green-300 border border-green-700/50' : ''}
                      ${currentUserData.role === 'VIEWER' ? 'bg-gray-700/50 text-gray-300 border border-gray-600/50' : ''}
                    `}>
                      {currentUserData.role === 'ADMIN' && '👑 Administrador'}
                      {currentUserData.role === 'MANAGER' && '📊 Gerente'}
                      {currentUserData.role === 'SELLER' && '💼 Vendedor'}
                      {currentUserData.role === 'VIEWER' && '👁️ Visualizador'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Botón Cerrar Sesión */}
          <button
            title={isCollapsed ? 'Cerrar Sesión' : undefined}
            className={`
              relative flex items-center w-full rounded-xl text-gray-400
              hover:bg-gray-800 hover:text-red-400 transition-all font-medium group
              ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-4 py-3'}
            `}
            onClick={async () => {
              if (window.confirm('¿Seguro que deseas cerrar sesión?')) {
                await logout();
              }
            }}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {!isCollapsed && <span>Salir</span>}

            {isCollapsed && (
              <div className="
                absolute left-full ml-3 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold
                rounded-lg shadow-lg whitespace-nowrap opacity-0 invisible
                group-hover:opacity-100 group-hover:visible transition-all duration-200
                pointer-events-none z-50
              ">
                Cerrar Sesión
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
              </div>
            )}
          </button>

          {/* Botón Colapsar — solo desktop */}
          <button
            onClick={toggleCollapse}
            className={`
              hidden md:flex items-center w-full rounded-xl text-gray-500
              hover:bg-gray-800 hover:text-white transition-all mt-1
              ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-4 py-3'}
            `}
          >
            {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!isCollapsed && <span className="text-xs font-medium">Colapsar</span>}
          </button>

          {!isCollapsed && (
            <div className="mt-3 text-center">
              <p className="text-[10px] text-gray-600">v2.1.0 • Nube</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
});
