import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { Sidebar } from './components/layout/Sidebar';

// Páginas
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Inventory } from './pages/Inventory';
import { Sales } from './pages/Sales';
import { Invoices } from './pages/Invoices';
import { Settings } from './pages/Settings';
import { DailyClose } from './pages/DailyClose';
import { Clients } from './pages/Clients';
import { AccountsReceivable } from './pages/AccountsReceivable';

function App() {
  const { checkSession, user, isLoading } = useStore();

  useEffect(() => {
    checkSession();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm font-mono">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#1F2937', color: '#fff', borderRadius: '10px' },
          success: { iconTheme: { primary: '#10B981', secondary: 'white' } },
          error: { iconTheme: { primary: '#EF4444', secondary: 'white' } }
        }}
      />

      <Routes>
        {/* RUTA PÚBLICA */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" replace />} />

        {/* RUTAS PRIVADAS */}
        <Route
          path="/*"
          element={
            user ? (
              <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 relative">
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/pos" element={<POS />} />
                    <Route path="/accounts-receivable" element={<AccountsReceivable />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/invoices" element={<Invoices />} />
                    <Route path="/clients" element={<Clients />} />
                    <Route path="/daily-close" element={<DailyClose />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;