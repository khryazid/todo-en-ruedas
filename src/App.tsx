import { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Inventory } from './pages/Inventory';
import { POS } from './pages/POS';
import { Invoices } from './pages/Invoices'; // Importamos la nueva página

function App() {
  const [activePage, setActivePage] = useState('dashboard');

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* Sidebar Fija */}
      <Sidebar activePage={activePage} setPage={setActivePage} />

      {/* Área Principal */}
      <main className="flex-1 relative z-0">
        {/* z-0 para asegurar que quede debajo del sidebar (z-50) si se solapan */}

        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'settings' && <Settings />}
        {activePage === 'inventory' && <Inventory />}
        {activePage === 'pos' && <POS />}
        {activePage === 'invoices' && <Invoices />} {/* Renderizamos la nueva página */}
      </main>
    </div>
  );
}

export default App;