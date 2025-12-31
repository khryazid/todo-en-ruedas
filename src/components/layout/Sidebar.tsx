import {
  LayoutDashboard,
  Settings,
  Package,
  ShoppingCart,
  LogOut,
  FileText // Icono para facturas
} from 'lucide-react';

interface SidebarProps {
  activePage: string;
  setPage: (page: string) => void;
}

export const Sidebar = ({ activePage, setPage }: SidebarProps) => {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col fixed left-0 top-0 z-50">

      {/* LOGO AREA */}
      <div className="p-6 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-red-200 shadow-lg">
          F
        </div>
        <h1 className="font-bold text-xl text-gray-800 tracking-tight">Ferretería<span className="text-red-600">Pro</span></h1>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 p-4 space-y-2">

        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">Principal</p>

        <button
          onClick={() => setPage('dashboard')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activePage === 'dashboard' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <LayoutDashboard size={20} className={activePage === 'dashboard' ? 'stroke-[2.5px]' : ''} />
          <span className="text-sm">Panel Principal</span>
        </button>

        <button
          onClick={() => setPage('pos')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activePage === 'pos' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <ShoppingCart size={20} className={activePage === 'pos' ? 'stroke-[2.5px]' : ''} />
          <span className="text-sm">Punto de Venta</span>
        </button>

        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">Administración</p>

        <button
          onClick={() => setPage('inventory')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activePage === 'inventory' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <Package size={20} className={activePage === 'inventory' ? 'stroke-[2.5px]' : ''} />
          <span className="text-sm">Inventario</span>
        </button>

        {/* NUEVO BOTÓN: CUENTAS POR PAGAR */}
        <button
          onClick={() => setPage('invoices')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activePage === 'invoices' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <FileText size={20} className={activePage === 'invoices' ? 'stroke-[2.5px]' : ''} />
          <span className="text-sm">Cuentas por Pagar</span>
        </button>

        <button
          onClick={() => setPage('settings')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${activePage === 'settings' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
        >
          <Settings size={20} className={activePage === 'settings' ? 'stroke-[2.5px]' : ''} />
          <span className="text-sm">Configuración</span>
        </button>

      </nav>

      {/* FOOTER */}
      <div className="p-4 border-t border-gray-100">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
          <LogOut size={20} />
          <span className="text-sm font-medium">Cerrar Sesión</span>
        </button>
      </div>

    </aside>
  );
};