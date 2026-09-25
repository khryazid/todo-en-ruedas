/**
 * @file pages/Auth.tsx
 * @description Página unificada de autenticación — Login, Registro multi-negocio y Recuperación.
 *
 * Modos:
 *  - "login"    → Tab de inicio de sesión
 *  - "register" → Tab de registro (wizard 2 pasos: datos personales → datos del negocio)
 *  - "recover"  → Panel deslizable de recuperación de contraseña
 *
 * Integración:
 *  - login()            → authSlice
 *  - signUp()           → authSlice (nuevo)
 *  - createOrganization() → tenantSlice (RPC create_organization ya desplegada)
 *  - sendPasswordResetEmail() → authSlice
 */

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, Loader2, Building2, User,
  ArrowRight, ArrowLeft, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Tipos locales ────────────────────────────────────────────────────────────

type AuthTab = 'login' | 'register';
type RegisterStep = 1 | 2;
type RifType = 'J' | 'V' | 'E' | 'G' | 'P' | 'C';

interface LoginForm {
  email: string;
  password: string;
}

interface RegisterStep1Form {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface RegisterStep2Form {
  companyName: string;
  rifType: RifType;
  rif: string;
  address: string;
  currency: 'USD' | 'BS';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const slugify = (str: string): string =>
  str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─── Componente principal ─────────────────────────────────────────────────────

export const Auth = () => {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const signUp = useStore((s) => s.signUp);
  const createOrganization = useStore((s) => s.createOrganization);
  const sendPasswordResetEmail = useStore((s) => s.sendPasswordResetEmail);

  const [tab, setTab] = useState<AuthTab>('login');
  const [step, setStep] = useState<RegisterStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  // ── Formularios ──────────────────────────────────────────────────────────────
  const [loginForm, setLoginForm] = useState<LoginForm>({ email: '', password: '' });

  const [step1, setStep1] = useState<RegisterStep1Form>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [step2, setStep2] = useState<RegisterStep2Form>({
    companyName: '',
    rifType: 'J',
    rif: '',
    address: '',
    currency: 'USD',
  });

  // ── Login ────────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) return;
    setIsLoading(true);
    const ok = await login(loginForm.email, loginForm.password);
    setIsLoading(false);
    if (ok) navigate('/dashboard');
  };

  // ── Recuperar contraseña ─────────────────────────────────────────────────────
  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) {
      toast.error('Ingresa tu correo electrónico');
      return;
    }
    setIsLoading(true);
    const ok = await sendPasswordResetEmail(recoveryEmail);
    setIsLoading(false);
    if (ok) setIsRecovering(false);
  };

  // ── Registro Paso 1 → Paso 2 (validación) ────────────────────────────────────
  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1.fullName.trim()) { toast.error('Ingresa tu nombre completo'); return; }
    if (!step1.email.trim()) { toast.error('Ingresa tu correo electrónico'); return; }
    if (step1.password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (step1.password !== step1.confirmPassword) { toast.error('Las contraseñas no coinciden'); return; }
    setStep(2);
  };

  // ── Registro Paso 2 → Crear cuenta + negocio ─────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step2.companyName.trim()) { toast.error('Ingresa el nombre del negocio'); return; }
    if (!step2.rif.trim()) { toast.error('Ingresa el RIF del negocio'); return; }
    if (!step2.address.trim()) { toast.error('Ingresa la dirección del negocio'); return; }

    setIsLoading(true);
    try {
      // 1. Crear cuenta en Supabase Auth
      const signedUp = await signUp(step1.email, step1.password, step1.fullName);
      if (!signedUp) { setIsLoading(false); return; }

      // 2. Iniciar sesión para obtener el JWT activo
      const loggedIn = await login(step1.email, step1.password);
      if (!loggedIn) { setIsLoading(false); return; }

      // 3. Crear el primer negocio (RPC create_organization ya en Supabase)
      await createOrganization({
        name: step2.companyName.trim(),
        slug: slugify(step2.companyName),
        rif: `${step2.rifType}-${step2.rif.trim()}`,
        currency: step2.currency,
      });

      // 4. Redirigir al dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error('Error en registro:', err);
      toast.error('Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Cambio de tab ─────────────────────────────────────────────────────────────
  const switchTab = (t: AuthTab) => {
    setTab(t);
    setStep(1);
    setIsRecovering(false);
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Glyph Core"
            className="h-16 w-auto mx-auto mb-3 drop-shadow-[0_0_20px_rgba(59,130,246,0.35)] filter brightness-110"
          />
          <h1 className="text-3xl font-black text-white tracking-tight">
            GLYPH <span className="text-red-500">CORE</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Sistema de Gestión Empresarial</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.06] backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

          {/* ── Tabs ────────────────────────────────────────────────────────── */}
          {!isRecovering && (
            <div className="flex border-b border-white/10">
              {(['login', 'register'] as AuthTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-4 text-sm font-bold transition-all ${
                    tab === t
                      ? 'text-white bg-white/10 border-b-2 border-red-500'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
                </button>
              ))}
            </div>
          )}

          <div className="p-8">

            {/* ════════════════════════════════════════════════════════════════
                PANEL: Recuperar contraseña
            ════════════════════════════════════════════════════════════════ */}
            {isRecovering && (
              <div>
                <button
                  type="button"
                  onClick={() => setIsRecovering(false)}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm mb-6 transition"
                >
                  <ArrowLeft size={16} /> Volver
                </button>
                <h2 className="text-xl font-bold text-white mb-1">Recuperar contraseña</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Te enviaremos un enlace a tu correo para restablecer tu contraseña.
                </p>
                <form onSubmit={handleRecover} className="space-y-5">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      placeholder="tu@correo.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                    Enviar enlace
                  </button>
                </form>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TAB: Login
            ════════════════════════════════════════════════════════════════ */}
            {!isRecovering && tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      placeholder="usuario@empresa.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="w-full pl-10 pr-11 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-red-900/30 transition flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : null}
                  Iniciar Sesión
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsRecovering(true)}
                    className="text-xs text-gray-400 hover:text-white transition"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              </form>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TAB: Registro — Paso 1 (Datos Personales)
            ════════════════════════════════════════════════════════════════ */}
            {!isRecovering && tab === 'register' && step === 1 && (
              <form onSubmit={handleStep1Next} className="space-y-5">
                {/* Indicador de progreso */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center shadow-lg shadow-red-900/40">1</div>
                    <span className="text-xs font-semibold text-white">Datos personales</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-500" />
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-gray-400 text-xs font-bold flex items-center justify-center">2</div>
                    <span className="text-xs text-gray-500">Tu negocio</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Nombre Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      required
                      placeholder="Ej: María García"
                      value={step1.fullName}
                      onChange={(e) => setStep1({ ...step1, fullName: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      placeholder="tu@correo.com"
                      value={step1.email}
                      onChange={(e) => setStep1({ ...step1, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Mínimo 6 caracteres"
                      value={step1.password}
                      onChange={(e) => setStep1({ ...step1, password: e.target.value })}
                      className="w-full pl-10 pr-11 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Confirmar Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Repite tu contraseña"
                      value={step1.confirmPassword}
                      onChange={(e) => setStep1({ ...step1, confirmPassword: e.target.value })}
                      className="w-full pl-10 pr-11 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl shadow-lg shadow-red-900/30 transition flex items-center justify-center gap-2"
                >
                  Siguiente <ArrowRight size={16} />
                </button>
              </form>
            )}

            {/* ════════════════════════════════════════════════════════════════
                TAB: Registro — Paso 2 (Datos del Negocio)
            ════════════════════════════════════════════════════════════════ */}
            {!isRecovering && tab === 'register' && step === 2 && (
              <form onSubmit={handleRegister} className="space-y-5">
                {/* Indicador de progreso */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-gray-400 text-xs font-bold flex items-center justify-center">1</div>
                    <span className="text-xs text-gray-500">Datos personales</span>
                  </div>
                  <ChevronRight size={14} className="text-red-500" />
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center shadow-lg shadow-red-900/40">2</div>
                    <span className="text-xs font-semibold text-white">Tu negocio</span>
                  </div>
                </div>

                {/* Nombre del negocio */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Nombre del Negocio</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      required
                      placeholder="Ej: Repuestos El Ávila C.A."
                      value={step2.companyName}
                      onChange={(e) => setStep2({ ...step2, companyName: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                </div>

                {/* RIF */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">RIF del Negocio</label>
                  <div className="flex gap-2">
                    <select
                      value={step2.rifType}
                      onChange={(e) => setStep2({ ...step2, rifType: e.target.value as RifType })}
                      className="w-1/5 px-2 py-3 bg-white/10 border border-white/15 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm text-center"
                    >
                      {(['J', 'V', 'E', 'G', 'P', 'C'] as RifType[]).map((t) => (
                        <option key={t} value={t} className="bg-gray-900">{t}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Ej: 12345678-9"
                      value={step2.rif}
                      onChange={(e) => setStep2({ ...step2, rif: e.target.value })}
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm"
                    />
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Dirección</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Ej: Av. Principal, Local 1, Caracas"
                    value={step2.address}
                    onChange={(e) => setStep2({ ...step2, address: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition text-sm resize-none"
                  />
                </div>

                {/* Moneda */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2">Moneda Predeterminada</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['USD', 'BS'] as const).map((cur) => (
                      <button
                        key={cur}
                        type="button"
                        onClick={() => setStep2({ ...step2, currency: cur })}
                        className={`py-2.5 rounded-xl border text-xs font-bold transition ${
                          step2.currency === cur
                            ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/30'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {cur === 'USD' ? '$ Dólares (USD)' : 'Bs. Bolívares'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botones de navegación */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1.5 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 text-gray-300 text-sm font-semibold rounded-xl transition"
                  >
                    <ArrowLeft size={15} /> Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-red-900/30 transition flex items-center justify-center gap-2 text-sm"
                  >
                    {isLoading ? (
                      <><Loader2 size={16} className="animate-spin" /> Creando cuenta...</>
                    ) : (
                      <>Crear cuenta y negocio <ArrowRight size={15} /></>
                    )}
                  </button>
                </div>

                {/* Info de seguridad */}
                <p className="text-center text-[11px] text-gray-500 pt-1">
                  🔒 Tu cuenta tendrá permisos de <strong className="text-gray-400">Administrador</strong> con acceso completo
                </p>
              </form>
            )}

          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6">
          v2.1.0 • Glyph Core — Sistema de Gestión Empresarial
        </p>
      </div>
    </div>
  );
};
