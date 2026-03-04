import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Key, Mail, Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const Login = () => {
    const [isRecovering, setIsRecovering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, sendPasswordResetEmail, isLoading } = useStore();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isRecovering) {
            if (!email) {
                toast.error('Ingresa tu correo institucional por favor');
                return;
            }
            const success = await sendPasswordResetEmail(email);
            if (success) {
                setIsRecovering(false);
            }
            return;
        }

        if (!email || !password) return;

        const success = await login(email, password);
        if (success) {
            navigate('/dashboard'); // Si entra, lo mandamos al Dashboard
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="bg-blue-600 p-8 text-center">
                    <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                        <Key className="text-white" size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-white">Bienvenido</h2>
                    <p className="text-blue-100 mt-2">Glyph Core Management</p>
                </div>

                {/* Formulario */}
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Correo Electrónico</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                                <input
                                    type="email"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                    placeholder="usuario@empresa.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        {!isRecovering && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                                    <input
                                        type="password"
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required={!isRecovering}
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="animate-spin" /> : (isRecovering ? 'ENVIAR ENLACE' : 'INICIAR SESIÓN')}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm">
                        {isRecovering ? (
                            <button
                                onClick={() => setIsRecovering(false)}
                                className="text-gray-500 hover:text-blue-600 font-medium transition"
                            >
                                Volver al inicio de sesión
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsRecovering(true)}
                                className="text-gray-500 hover:text-blue-600 font-medium transition"
                            >
                                ¿Olvidaste tu contraseña?
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};