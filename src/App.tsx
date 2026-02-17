/**
 * @file App.tsx
 * @description Configuración de Rutas con Lazy Loading.
 *
 * ✅ SPRINT 6.1: Cada página se carga bajo demanda (code splitting).
 *    Solo Login + Dashboard cargan al inicio. El resto cuando se navega.
 */

import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { useSetupCheck } from './hooks/useSetupCheck';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';

// Páginas cargadas de inmediato (rutas principales)
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Setup } from './pages/Setup';

// Páginas con carga diferida (se descargan cuando el usuario navega)
const POS = lazy(() => import('./pages/POS').then(m => ({ default: m.POS })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Sales = lazy(() => import('./pages/Sales').then(m => ({ default: m.Sales })));
const Invoices = lazy(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const DailyClose = lazy(() => import('./pages/DailyClose').then(m => ({ default: m.DailyClose })));
const Clients = lazy(() => import('./pages/Clients').then(m => ({ default: m.Clients })));
const AccountsReceivable = lazy(() => import('./pages/AccountsReceivable').then(m => ({ default: m.AccountsReceivable })));
const Users = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));

// Spinner para la transición entre páginas
const PageLoader = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[50vh]">
    <div className="text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent mx-auto mb-3"></div>
      <p className="text-gray-400 text-xs font-mono">Cargando módulo...</p>
    </div>
  </div>
);

function App() {
  const { checkSession, user, isLoading } = useStore();
  const { needsSetup, isChecking } = useSetupCheck();

  useEffect(() => {
    checkSession();
  }, []);

  // Mostrar loader mientras verifica sesión o setup
  if (isLoading || isChecking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm font-mono">Cargando aplicación...</p>
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
        {/* Ruta de Setup - Primera prioridad si necesita configuración */}
        {needsSetup ? (
          <>
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </>
        ) : !user ? (
          /* Ruta de Login - Si no necesita setup pero no está autenticado */
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          /* Rutas autenticadas - Si no necesita setup y está autenticado */
          <Route
            path="/*"
            element={
              <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 relative">
                  <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
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
                        <Route path="/users" element={<Users />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </main>
              </div>
            }
          />
        )}
      </Routes>
    </Router>
  );
}

export default App;
