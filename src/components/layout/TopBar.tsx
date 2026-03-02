/**
 * @file components/layout/TopBar.tsx
 * @description Navegación Principal.
 *
 * PC / Tablet (md+): Barra SUPERIOR horizontal con logo, nombre del negocio,
 *   ítems del menú con ícono + label, dropdown "Más" y menú de usuario.
 *
 * Móvil (<md): Topbar compacta + drawer lateral desde la izquierda.
 */

import { useState, memo, useMemo, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../utils/permissions';
import {
    LayoutDashboard, ShoppingCart, Package, FileText,
    Settings, LogOut, History, PieChart, Users, Wallet,
    Shield, ClipboardList, Award, Menu, X, Search,
    ChevronDown, UserCircle, Sliders, TrendingDown, Moon, Sun
} from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';
import type { PermissionType } from '../../utils/permissions';

interface MenuItem {
    icon: typeof LayoutDashboard;
    label: string;
    path: string;
    requiredPermissions?: PermissionType[];
    allowedRoles?: Array<'ADMIN' | 'MANAGER' | 'SELLER' | 'VIEWER'>;
}

const allMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: ShoppingCart, label: 'Ventas', path: '/pos', requiredPermissions: [Permission.CREATE_SALE] },
    { icon: History, label: 'Historial', path: '/sales', requiredPermissions: [Permission.VIEW_OWN_SALES, Permission.VIEW_ALL_SALES] },
    { icon: FileText, label: 'Cotizaciones', path: '/quotes', requiredPermissions: [Permission.VIEW_QUOTES] },
    { icon: PieChart, label: 'Cierre', path: '/daily-close', requiredPermissions: [Permission.CLOSE_CASH] },
    { icon: Package, label: 'Inventario', path: '/inventory', allowedRoles: ['ADMIN', 'MANAGER'] },
    { icon: Wallet, label: 'CxC', path: '/accounts-receivable', requiredPermissions: [Permission.VIEW_RECEIVABLES] },
    { icon: FileText, label: 'Facturas', path: '/invoices', allowedRoles: ['ADMIN', 'MANAGER', 'VIEWER'] },
    { icon: Users, label: 'Clientes', path: '/clients', requiredPermissions: [Permission.VIEW_CLIENTS] },
    { icon: Award, label: 'Comisiones', path: '/commissions', allowedRoles: ['ADMIN', 'MANAGER'] },
    { icon: Shield, label: 'Usuarios', path: '/users', requiredPermissions: [Permission.VIEW_USERS] },
    { icon: ClipboardList, label: 'Auditoría', path: '/audit', requiredPermissions: [Permission.VIEW_AUDIT] },
    { icon: Settings, label: 'Config.', path: '/settings', requiredPermissions: [Permission.VIEW_SETTINGS] },
    { icon: TrendingDown, label: 'Gastos', path: '/expenses', allowedRoles: ['ADMIN', 'MANAGER'] },
];

// Ítems que siempre van en el menú principal del topbar (los más usados)
const PRIMARY_PATHS = ['/dashboard', '/pos', '/sales', '/quotes', '/daily-close', '/inventory', '/clients'];

const roleColors: Record<string, string> = {
    ADMIN: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    MANAGER: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    SELLER: 'bg-green-500/20 text-green-300 border border-green-500/30',
    VIEWER: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
};
const roleLabels: Record<string, string> = {
    ADMIN: '👑 Admin', MANAGER: '📊 Gerente', SELLER: '💼 Vendedor', VIEWER: '👁️ Lector'
};

export const TopBar = memo(() => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [pinModalOpen, setPinModalOpen] = useState(false);
    const { isDark, toggle: toggleDark } = useDarkMode();

    // Pines persistidos en localStorage — el usuario elige qué va en la barra
    const [pinnedPaths, setPinnedPaths] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('topbar-pinned');
            return saved ? JSON.parse(saved) : PRIMARY_PATHS;
        } catch { return PRIMARY_PATHS; }
    });

    const moreRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);

    const { settings, logout } = useStore();
    const currentUserData = useStore(s => s.currentUserData);
    const products = useStore(s => s.products);
    const { canAny, role } = usePermissions();
    const navigate = useNavigate();

    // Cerrar dropdowns al hacer clic fuera
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
            if (userRef.current && !userRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const alertCount = useMemo(() =>
        products.filter(p => p.stock <= (p.minStock || 5)).length,
        [products]
    );

    const visibleItems = useMemo(() => {
        if (!currentUserData || !role) return [];
        return allMenuItems.filter(item => {
            if (item.allowedRoles && !item.allowedRoles.includes(role)) return false;
            if (item.requiredPermissions?.length) return canAny(item.requiredPermissions);
            return true;
        });
    }, [currentUserData, role, canAny]);

    // Respetar el orden del usuario en pinned
    const primaryItems = visibleItems.filter(i => pinnedPaths.includes(i.path))
        .sort((a, b) => pinnedPaths.indexOf(a.path) - pinnedPaths.indexOf(b.path));
    const secondaryItems = visibleItems.filter(i => !pinnedPaths.includes(i.path));

    const togglePin = (path: string) => {
        setPinnedPaths(prev => {
            const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
            try { localStorage.setItem('topbar-pinned', JSON.stringify(next)); } catch { }
            return next;
        });
    };

    const resetPins = () => {
        setPinnedPaths(PRIMARY_PATHS);
        try { localStorage.setItem('topbar-pinned', JSON.stringify(PRIMARY_PATHS)); } catch { }
    };

    const companyName = settings.companyName && settings.companyName !== 'Cargando...'
        ? settings.companyName
        : 'Todo en Ruedas';

    const handleLogout = async () => {
        setUserMenuOpen(false);
        if (window.confirm('¿Seguro que deseas cerrar sesión?')) await logout();
    };

    const openGlobalSearch = () => {
        setMobileOpen(false);
        const evt = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
        setTimeout(() => document.dispatchEvent(evt), 50);
    };

    return (
        <>
            {/* ═══════════════════════════════════════════════
                TOPBAR PRINCIPAL
            ═══════════════════════════════════════════════ */}
            <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-gray-900 border-b border-white/5 shadow-xl flex items-center px-3 gap-2">

                {/* HAMBURGUESA — solo móvil */}
                <button
                    onClick={() => setMobileOpen(true)}
                    className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-white/8 hover:bg-white/15 text-white transition flex-shrink-0"
                    aria-label="Abrir menú"
                >
                    <Menu size={20} />
                </button>

                {/* LOGO + NOMBRE */}
                <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2.5 flex-shrink-0 mr-2 hover:opacity-90 transition"
                >
                    <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/50 flex-shrink-0">
                        <span className="text-white font-black text-xs leading-none">TR</span>
                    </div>
                    <div className="hidden sm:block leading-tight text-left">
                        <p className="text-white font-black text-sm leading-tight tracking-tight truncate max-w-[180px]">
                            {companyName}
                        </p>
                        <p className="text-gray-500 text-[9px] uppercase tracking-widest font-bold leading-none mt-0.5">
                            Sistema POS
                        </p>
                    </div>
                </button>

                {/* SEPARADOR */}
                <div className="hidden md:block w-px h-6 bg-white/10 flex-shrink-0" />

                {/* MENÚ PRINCIPAL — solo PC/Tablet (sin el dropdown Más) */}
                <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none', overflowY: 'visible' }}>
                    {primaryItems.map(item => {
                        const isInventory = item.path === '/inventory';
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 whitespace-nowrap
                                    ${isActive
                                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                                        : 'text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`
                                }
                            >
                                <div className="relative flex-shrink-0">
                                    <item.icon size={16} />
                                    {isInventory && alertCount > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                                            {alertCount > 9 ? '9+' : alertCount}
                                        </span>
                                    )}
                                </div>
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                {/* DROPDOWN "MÁS" — hermano del nav, fuera del overflow-x-auto */}
                {secondaryItems.length > 0 && (
                    <div className="hidden md:block relative flex-shrink-0" ref={moreRef}>
                        <button
                            onClick={() => setMoreOpen(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap
                                ${moreOpen ? 'bg-white/15 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                        >
                            Más <ChevronDown size={14} className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {moreOpen && (
                            <div className="absolute top-full left-0 mt-2 w-52 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 duration-150">
                                {secondaryItems.map(item => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setMoreOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-4 py-3 text-sm font-semibold transition w-full
                                            ${isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`
                                        }
                                    >
                                        <item.icon size={16} />
                                        {item.label}
                                    </NavLink>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* DERECHA: Búsqueda + Avatar usuario */}
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                    {/* Botón búsqueda global */}
                    <button
                        onClick={openGlobalSearch}
                        className="hidden md:flex items-center gap-2 bg-white/8 hover:bg-white/15 border border-white/10 text-gray-400 hover:text-gray-200 text-xs font-medium px-3 py-1.5 rounded-lg transition"
                    >
                        <Search size={13} />
                        Buscar
                        <kbd className="bg-white/10 text-gray-500 px-1 py-0.5 rounded text-[9px] font-mono ml-1">Ctrl+K</kbd>
                    </button>

                    {/* TOGGLE DARK MODE */}
                    <button
                        onClick={toggleDark}
                        title={isDark ? 'Modo claro' : 'Modo oscuro'}
                        className="hidden md:flex w-8 h-8 items-center justify-center rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-gray-400 hover:text-white transition"
                    >
                        {isDark ? <Sun size={15} /> : <Moon size={15} />}
                    </button>

                    {/* MENÚ DE USUARIO */}
                    {currentUserData && (
                        <div className="relative" ref={userRef}>
                            <button
                                onClick={() => setUserMenuOpen(v => !v)}
                                className={`flex items-center gap-2 px-2 py-1 rounded-xl transition border
                                    ${userMenuOpen
                                        ? 'bg-white/15 border-white/20'
                                        : 'border-transparent hover:bg-white/10 hover:border-white/10'
                                    }`}
                            >
                                {/* Nombre + rol — solo pc */}
                                <div className="hidden sm:block text-right leading-tight">
                                    <p className="text-white text-xs font-bold truncate max-w-[120px]">{currentUserData.fullName}</p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${roleColors[currentUserData.role] || ''}`}>
                                        {roleLabels[currentUserData.role] || currentUserData.role}
                                    </span>
                                </div>
                                {/* Avatar */}
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white font-black text-sm flex items-center justify-center shadow-lg flex-shrink-0">
                                    {currentUserData.fullName.charAt(0).toUpperCase()}
                                </div>
                                <ChevronDown size={13} className={`text-gray-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* DROPDOWN DE USUARIO */}
                            {userMenuOpen && (
                                <div className="absolute top-full right-0 mt-2 w-60 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                    {/* Info del usuario */}
                                    <div className="p-4 border-b border-white/8">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white font-black flex items-center justify-center text-base shadow-lg">
                                                {currentUserData.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-bold text-sm truncate">{currentUserData.fullName}</p>
                                                <p className="text-gray-400 text-[10px] truncate">{currentUserData.email}</p>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColors[currentUserData.role] || ''}`}>
                                                    {roleLabels[currentUserData.role] || currentUserData.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Opciones */}
                                    <div className="p-2">
                                        <button
                                            onClick={() => { setUserMenuOpen(false); setPinModalOpen(true); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:bg-white/10 hover:text-white transition text-sm font-semibold"
                                        >
                                            <Sliders size={17} />
                                            Personalizar barra
                                        </button>
                                        <button
                                            onClick={() => { setUserMenuOpen(false); navigate('/users'); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:bg-white/10 hover:text-white transition text-sm font-semibold"
                                        >
                                            <UserCircle size={17} />
                                            Gestión de Usuarios
                                        </button>
                                        <button
                                            onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:bg-white/10 hover:text-white transition text-sm font-semibold"
                                        >
                                            <Settings size={17} />
                                            Configuración
                                        </button>

                                        <div className="my-1 border-t border-white/8" />

                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/15 hover:text-red-300 transition text-sm font-semibold"
                                        >
                                            <LogOut size={17} />
                                            Cerrar Sesión
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* ═══════════════════════════════════════════════
                DRAWER MÓVIL
            ═══════════════════════════════════════════════ */}
            {mobileOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setMobileOpen(false)}
                    />

                    {/* Drawer */}
                    <aside className="relative w-72 max-w-[85vw] bg-gray-900 h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/8">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <span className="text-white font-black text-sm">TR</span>
                                </div>
                                <div>
                                    <p className="text-white font-black text-sm leading-tight truncate max-w-[160px]">{companyName}</p>
                                    <p className="text-gray-500 text-[9px] uppercase tracking-widest">Sistema POS</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Perfil */}
                        {currentUserData && (
                            <div className="mx-4 mt-4 p-3 bg-white/5 rounded-xl border border-white/8">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-black shadow-lg flex-shrink-0">
                                        {currentUserData.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm truncate">{currentUserData.fullName}</p>
                                        <p className="text-gray-400 text-[10px] truncate">{currentUserData.email}</p>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${roleColors[currentUserData.role] || ''}`}>
                                            {roleLabels[currentUserData.role] || currentUserData.role}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Búsqueda */}
                        <button
                            onClick={openGlobalSearch}
                            className="mx-4 mt-3 flex items-center gap-2 bg-white/8 border border-white/10 text-gray-400 text-sm px-4 py-2.5 rounded-xl transition hover:bg-white/15 hover:text-white"
                        >
                            <Search size={15} /> Buscar...
                        </button>

                        {/* Links */}
                        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                            {visibleItems.map(item => {
                                const isInventory = item.path === '/inventory';
                                return (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setMobileOpen(false)}
                                        className={({ isActive }) =>
                                            `relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all
                                            ${isActive ? 'bg-red-600 text-white shadow-lg shadow-red-900/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`
                                        }
                                    >
                                        <div className="relative flex-shrink-0">
                                            <item.icon size={19} />
                                            {isInventory && alertCount > 0 && (
                                                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                                    {alertCount > 9 ? '9+' : alertCount}
                                                </span>
                                            )}
                                        </div>
                                        <span>{item.label}</span>
                                    </NavLink>
                                );
                            })}
                        </nav>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/8 space-y-1">
                            <button
                                onClick={() => { setMobileOpen(false); navigate('/users'); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition font-semibold text-sm"
                            >
                                <UserCircle size={18} /> Gestión de Usuarios
                            </button>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/15 hover:text-red-300 transition font-semibold text-sm"
                            >
                                <LogOut size={18} /> Cerrar Sesión
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {/* ═══════════════════════════════════════════════
                MODAL DE PERSONALIZACIÓN DEL TOPBAR
            ═══════════════════════════════════════════════ */}
            {pinModalOpen && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
                        onClick={() => setPinModalOpen(false)}
                    />

                    <div className="relative bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/8">
                            <div>
                                <h3 className="text-white font-bold text-base flex items-center gap-2">
                                    <Sliders size={18} className="text-red-400" /> Personalizar barra
                                </h3>
                                <p className="text-gray-500 text-xs mt-0.5">Elige qué aparece fijado en la barra de navegación</p>
                            </div>
                            <button
                                onClick={() => setPinModalOpen(false)}
                                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition flex-shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Lista de ítems */}
                        <div className="p-4 space-y-1 max-h-[60vh] overflow-y-auto">
                            {visibleItems.map(item => {
                                const isPinned = pinnedPaths.includes(item.path);
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => togglePin(item.path)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm
                                            ${isPinned
                                                ? 'bg-red-600/20 border border-red-500/40 text-white'
                                                : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10 hover:text-white'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
                                            ${isPinned ? 'bg-red-600 text-white' : 'bg-white/8 text-gray-400'}`}>
                                            <item.icon size={15} />
                                        </div>
                                        <span className="flex-1 text-left">{item.label}</span>
                                        <div className={`w-10 h-5 rounded-full transition-all flex-shrink-0 relative
                                            ${isPinned ? 'bg-red-500' : 'bg-gray-700'}`}>
                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                                                ${isPinned ? 'left-[calc(100%-1.125rem)]' : 'left-0.5'}`}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/8 flex items-center justify-between gap-3">
                            <button
                                onClick={resetPins}
                                className="text-xs text-gray-500 hover:text-gray-300 transition font-semibold px-3 py-2 rounded-lg hover:bg-white/8"
                            >
                                Restaurar por defecto
                            </button>
                            <button
                                onClick={() => setPinModalOpen(false)}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});
