/**
 * @file App.tsx
 * @description Enrutador Principal.
 * Define la estructura de navegación y las rutas disponibles.
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';

// Importación de Páginas
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Inventory } from './pages/Inventory';
import { Sales } from './pages/Sales';
import { Invoices } from './pages/Invoices';
import { Settings } from './pages/Settings';
import { DailyClose } from './pages/DailyClose';
import { Clients } from './pages/Clients'; // <--- NUEVA IMPORTACIÓN
// 1. IMPORTAR ARRIBA
import { AccountsReceivable } from './pages/AccountsReceivable';

function App() {
  return (
    <Router>
      <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">

        {/* Barra Lateral (Navegación) */}
        <Sidebar />

        {/* Área Principal de Contenido */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 relative">
          <Routes>
            {/* Redirección inicial al Dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Rutas de la Aplicación */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/accounts-receivable" element={<AccountsReceivable />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/clients" element={<Clients />} /> {/* <--- NUEVA RUTA */}
            <Route path="/daily-close" element={<DailyClose />} />
            <Route path="/settings" element={<Settings />} />

            {/* Ruta 404 (Opcional: Redirigir a Dashboard si no existe) */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;