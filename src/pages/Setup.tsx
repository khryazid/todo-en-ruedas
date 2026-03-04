/**
 * @file pages/Setup.tsx
 * @description Página de configuración inicial (primer usuario ADMIN)
 */

import { useState, useEffect } from 'react';
// No router hooks needed here anymore
import { useStore } from '../store/useStore';
import { Building2, User, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const Setup = () => {
    const setupFirstAdmin = useStore(s => s.setupFirstAdmin);

    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        companyName: '',
        rif: '',
        rifType: 'J' as 'J' | 'V' | 'E' | 'G' | 'P' | 'C',
        address: '',
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        defaultMargin: 30,
        defaultVAT: 16
    });

    // #8 Mensaje de bienvenida inicial
    useEffect(() => {
        if (!sessionStorage.getItem('setup_welcome_shown')) {
            toast('¡Bienvenido! Por favor configura el sistema con los datos de tu empresa.', { icon: '👋', duration: 4000 });
            sessionStorage.setItem('setup_welcome_shown', 'true');
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validaciones
        if (formData.password !== formData.confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        if (formData.password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        if (!formData.rif || !formData.address) {
            toast.error('Por favor completa todos los datos de la empresa');
            return;
        }

        setIsLoading(true);

        try {
            const success = await setupFirstAdmin({
                companyName: formData.companyName,
                rif: formData.rif,
                rifType: formData.rifType,
                address: formData.address,
                fullName: formData.fullName,
                email: formData.email,
                password: formData.password,
                defaultMargin: formData.defaultMargin,
                defaultVAT: formData.defaultVAT
            });

            if (success) {
                // Forzar recarga completa para que App.tsx detecte la sesión
                window.location.href = '/dashboard';
            } else {
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Error en setup:', error);
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo/Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex flex-col items-center justify-center mb-4">
                        <img src="/logo.png" alt="Glyph Core Logo" className="h-20 w-auto mb-2 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)] filter brightness-110" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">
                        GLYPH <span className="text-brand-500">CORE</span>
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm">Sistema de Gestión Empresarial</p>
                </div>

                {/* Card */}
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-white mb-2">¡Bienvenido!</h2>
                        <p className="text-gray-300 text-sm">
                            Configura tu cuenta de administrador para comenzar
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Company Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Nombre del Negocio
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="Ej: Mi Empresa C.A."
                                    required
                                />
                            </div>
                        </div>

                        {/* RIF */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                RIF del Negocio
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={formData.rifType}
                                    onChange={(e) => setFormData({ ...formData, rifType: e.target.value as 'J' | 'V' | 'E' | 'G' | 'P' })}
                                    className="w-1/4 px-3 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                                >
                                    <option value="J" className="text-gray-900">J</option>
                                    <option value="V" className="text-gray-900">V</option>
                                    <option value="E" className="text-gray-900">E</option>
                                    <option value="G" className="text-gray-900">G</option>
                                    <option value="P" className="text-gray-900">P</option>
                                    <option value="C" className="text-gray-900">C</option>
                                </select>
                                <input
                                    type="text"
                                    value={formData.rif}
                                    onChange={(e) => setFormData({ ...formData, rif: e.target.value })}
                                    className="w-3/4 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="Ej: 12345678-9"
                                    required
                                />
                            </div>
                        </div>

                        {/* Address */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Dirección de la Empresa
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition resize-none h-24"
                                    placeholder="Ej: Av. Principal, Local 1..."
                                    required
                                />
                            </div>
                        </div>

                        {/* Full Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Tu Nombre Completo
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="Ej: Juan Pérez"
                                    required
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="tu@email.com"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-200 mb-2">
                                Confirmar Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                                    placeholder="Repite tu contraseña"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        { /* Configuración Global */}
                        <div className="pt-2 border-t border-white/10 mt-4">
                            <h3 className="text-sm font-bold text-white mb-3">Valores por Defecto</h3>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-200 mb-2">Margen de Ganancia (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.defaultMargin}
                                        onChange={(e) => setFormData({ ...formData, defaultMargin: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                                        required
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-200 mb-2">Impuesto (IVA %) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.defaultVAT}
                                        onChange={(e) => setFormData({ ...formData, defaultVAT: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })}
                                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-semibold rounded-xl shadow-lg shadow-brand-600/50 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Configurando...
                                </>
                            ) : (
                                <>
                                    Comenzar
                                    <ArrowRight className="h-5 w-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Info */}
                    <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <p className="text-xs text-blue-200 text-center">
                            🔒 Esta cuenta tendrá permisos de <strong>Administrador</strong> con acceso completo al sistema
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-xs mt-6">
                    v2.1.0 • Sistema de Gestión Empresarial
                </p>
            </div>
        </div>
    );
};
