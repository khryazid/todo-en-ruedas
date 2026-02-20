/**
 * @file App.tsx
 * @description Configuración de Rutas con Lazy Loading y Protección por Rol.
 *
 * ✅ SPRINT 6.1: Cada página se carga bajo demanda (code splitting).
 * ✅ FIX: Rutas protegidas con RoleRoute — SELLER/VIEWER no pueden acceder
 *         por URL directa a rutas fuera de sus permisos.
 */

import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { useSetupCheck } from './hooks/useSetupCheck';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RoleRoute } from './components/RoleRoute';
import { Permission } from './utils/permissions';

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

// Página 403 — Acceso Denegado
const AccessDenied = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[60vh]">
    <div className="text-center p-8">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">Acceso Denegado</h2>
      <p className="text-gray-500 mb-6">No tienes permisos para ver esta sección.</p>
      <a href="/sales" className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition">
        Volver al Historial
      </a>
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

                        {/* Dashboard: solo ADMIN y MANAGER */}
                        <Route path="/dashboard" element={
                          <RoleRoute allowedRoles={['ADMIN', 'MANAGER']} redirectTo="/sales">
                            <Dashboard />
                          </RoleRoute>
                        } />

                        {/* POS: quienes pueden crear ventas */}
                        <Route path="/pos" element={
                          <RoleRoute requiredPermission={Permission.CREATE_SALE} redirectTo="/sales">
                            <POS />
                          </RoleRoute>
                        } />

                        {/* Historial: quienes pueden ver ventas (propias o todas) */}
                        <Route path="/sales" element={
                          <RoleRoute requiredPermissions={[Permission.VIEW_OWN_SALES, Permission.VIEW_ALL_SALES]}>
                            <Sales />
                          </RoleRoute>
                        } />

                        {/* Inventario: solo ADMIN y MANAGER */}
                        <Route path="/inventory" element={
                          <RoleRoute allowedRoles={['ADMIN', 'MANAGER']} redirectTo="/sales">
                            <Inventory />
                          </RoleRoute>
                        } />

                        {/* Cuentas por Cobrar: quienes tienen permiso */}
                        <Route path="/accounts-receivable" element={
                          <RoleRoute requiredPermission={Permission.VIEW_RECEIVABLES} redirectTo="/sales">
                            <AccountsReceivable />
                          </RoleRoute>
                        } />

                        {/* Facturas/Ctas por Pagar: ADMIN, MANAGER, VIEWER */}
                        <Route path="/invoices" element={
                          <RoleRoute allowedRoles={['ADMIN', 'MANAGER', 'VIEWER']} redirectTo="/sales">
                            <Invoices />
                          </RoleRoute>
                        } />

                        {/* Clientes: quienes pueden ver clientes */}
                        <Route path="/clients" element={
                          <RoleRoute requiredPermission={Permission.VIEW_CLIENTS} redirectTo="/sales">
                            <Clients />
                          </RoleRoute>
                        } />

                        {/* Cierre de Caja: solo ADMIN y MANAGER */}
                        <Route path="/daily-close" element={
                          <RoleRoute requiredPermission={Permission.CLOSE_CASH} redirectTo="/sales">
                            <DailyClose />
                          </RoleRoute>
                        } />

                        {/* Configuración: ADMIN y MANAGER (VIEW_SETTINGS) */}
                        <Route path="/settings" element={
                          <RoleRoute requiredPermission={Permission.VIEW_SETTINGS} redirectTo="/sales">
                            <Settings />
                          </RoleRoute>
                        } />

                        {/* Usuarios: solo ADMIN y MANAGER */}
                        <Route path="/users" element={
                          <RoleRoute requiredPermission={Permission.VIEW_USERS} redirectTo="/sales">
                            <Users />
                          </RoleRoute>
                        } />

                        {/* Página de acceso denegado explícita */}
                        <Route path="/access-denied" element={<AccessDenied />} />

                        {/* Catch-all: redirige a /sales (funciona para todos los roles) */}
                        <Route path="*" element={<Navigate to="/sales" replace />} />

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
