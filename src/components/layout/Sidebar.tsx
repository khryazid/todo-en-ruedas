/**
 * @file Sidebar.tsx
 * @description Barra de Navegación Lateral (Responsiva).
 *
 * ✅ SPRINT 6.4: Suscripción selectiva al store.
 *    Antes: useStore() → se re-renderizaba con CUALQUIER cambio del store.
 *    Ahora: useStore(s => s.logout) → solo se re-renderiza si logout cambia (nunca).
 */

import { useState, memo } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import {
  LayoutDashboard, ShoppingCart, Package, FileText,
  Settings, LogOut, Menu, X, History, PieChart, Users, Wallet
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: ShoppingCart, label: 'Ventas', path: '/pos' },
  { icon: History, label: 'Historial Ventas', path: '/sales' },
  { icon: PieChart, label: 'Cierre de Caja', path: '/daily-close' },
  { icon: Package, label: 'Inventario', path: '/inventory' },
  { icon: Wallet, label: 'Ctas por Cobrar', path: '/accounts-receivable' },
  { icon: FileText, label: 'Ctas. por Pagar', path: '/invoices' },
  { icon: Users, label: 'Clientes', path: '/clients' },
  { icon: Settings, label: 'Configuración', path: '/settings' },
];

export const Sidebar = memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const logout = useStore(s => s.logout);

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="md:hidden fixed top-4 right-4 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg">
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {isOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />}

      <aside className={`fixed md:relative z-40 h-full w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ease-in-out shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-gray-800 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-white">TODO EN <span className="text-red-600">RUEDAS</span></h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Sistema de Gestión</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-medium ${isActive ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-3 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-xl transition font-medium"
          >
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
});
