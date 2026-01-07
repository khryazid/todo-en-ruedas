import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, FileText,
  Settings as SettingsIcon, History, Archive, Menu, X
} from 'lucide-react';

// Importación de páginas
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Inventory } from './pages/Inventory';
import { Invoices } from './pages/Invoices';
import { Sales } from './pages/Sales';
import { Settings } from './pages/Settings';
import { DailyClosePage } from './pages/DailyClose';

// --- COMPONENTE SIDEBAR (Barra Lateral) ---
const Sidebar = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Panel Principal' },
    { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta' },
    { path: '/sales', icon: History, label: 'Historial Ventas' },
    { path: '/daily-close', icon: Archive, label: 'Cierre de Caja' },
    { path: '/inventory', icon: Package, label: 'Inventario' },
    { path: '/invoices', icon: FileText, label: 'Cuentas por Pagar' },
    { path: '/settings', icon: SettingsIcon, label: 'Configuración' },
  ];

  return (
    <>
      {/* Fondo oscuro para móvil cuando el menú está abierto */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Estructura de la Barra Lateral */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white shadow-2xl z-50 
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        <div className="p-6 border-b border-gray-800 flex justify-between items-center h-20">
          <div>
            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 leading-none">
              Todo en Ruedas
            </h1>
            <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">Sistema ERP</p>
          </div>
          {/* Botón X solo visible en móvil */}
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto h-[calc(100vh-5rem)] custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => onClose()} // Cerrar menú al tocar un link en móvil
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
              >
                <item.icon size={20} className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'} />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

// --- LAYOUT PRINCIPAL ---
function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">

        {/* 1. SIDEBAR (Navegación) */}
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* 2. CONTENIDO PRINCIPAL */}
        {/* 'md:ml-64' empuja el contenido a la derecha SOLO en PC */}
        <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 md:ml-64 w-full">

          {/* HEADER MÓVIL (Solo visible en celular) */}
          <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 justify-between md:hidden sticky top-0 z-30 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <Menu size={24} />
              </button>
              <span className="font-bold text-gray-800 text-lg">Menú</span>
            </div>
            {/* Aquí podrías poner el logo pequeño si quisieras */}
          </header>

          {/* ÁREA DE PÁGINAS */}
          {/* Aquí se renderizan Dashboard, POS, etc. */}
          <main className="flex-1 overflow-x-hidden">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/daily-close" element={<DailyClosePage />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>

        </div>
      </div>
    </Router>
  );
}

export default App;