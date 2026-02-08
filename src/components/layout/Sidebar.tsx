/**
 * @file Sidebar.tsx
 * @description Barra de Navegación Lateral (Responsiva).
 * Incluye acceso a todos los módulos del sistema.
 */
// 1. IMPORTAR ICONO
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  History,
  PieChart,
  Users // <--- NUEVO ICONO
} from 'lucide-react';

export const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  // Configuración del Menú
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: ShoppingCart, label: 'Ventas', path: '/pos' },
    { icon: History, label: 'Historial Ventas', path: '/sales' },
    { icon: PieChart, label: 'Cierre de Caja', path: '/daily-close' },
    { icon: Package, label: 'Inventario', path: '/inventory' },
    { icon: Wallet, label: 'Ctas por Cobrar', path: '/accounts-receivable' },
    { icon: FileText, label: 'Ctas. por Pagar', path: '/invoices' },
    { icon: Users, label: 'Clientes', path: '/clients' }, // <--- NUEVO ÍTEM
    { icon: Settings, label: 'Configuración', path: '/settings' },

  ];

  return (
    <>
      {/* Botón Hamburguesa (Móvil) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay Oscuro (Móvil) */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:relative z-40 h-full w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ease-in-out shadow-2xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>

        {/* Logo / Título */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-white">
              TODO EN <span className="text-red-600">RUEDAS</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">Sistema de Gestión</p>
          </div>
        </div>

        {/* Lista de Navegación */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsOpen(false)} // Cerrar menú en móvil al hacer click
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-medium
                ${isActive
                  ? 'bg-red-600 text-white shadow-lg shadow-red-900/50'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <item.icon size={20} className="group-hover:scale-110 transition-transform" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer Sidebar */}
        <div className="p-4 border-t border-gray-800">
          <button
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-all font-medium"
            onClick={() => {
              if (window.confirm('¿Cerrar sesión? (Simulado)')) alert("Sesión cerrada");
            }}
          >
            <LogOut size={20} />
            <span>Salir</span>
          </button>
          <div className="mt-4 text-center">
            <p className="text-[10px] text-gray-600">v1.0.0 • 2025</p>
          </div>
        </div>
      </aside>
    </>
  );
};