import { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, UserPlus, Building2, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

interface QuickClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onClientCreated: (client: any) => void;
}

export const QuickClientModal = ({ isOpen, onClose, onClientCreated }: QuickClientModalProps) => {
    const addClient = useStore(state => state.addClient);
    const clients = useStore(state => state.clients);

    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        rifType: 'V',
        rifNumber: '',
        phone: ''
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const fullRif = `${formData.rifType}-${formData.rifNumber}`;

        // Validación básica de RIF duplicado
        if (clients.some(c => c.rif === fullRif)) {
            toast.error('Ya existe un cliente con este RIF/Cédula');
            return;
        }

        setIsLoading(true);
        try {
            // Se asume que addClient maneja la insersión y agrega el objeto al estado asíncronamente
            await addClient({
                id: '', // Se genera en DB
                name: formData.name,
                rif: fullRif,
                phone: formData.phone,
                address: '',
                email: '',
                notes: 'Creado rápidamente desde POS'
            });

            // Buscar el cliente recién creado en el estado (o reconstruirlo para selección inmediata)
            // Dado que addClient no devuelve el ID, simularemos el cliente para onClientCreated
            // En una app real, addClient debería retornar el cliente creado.
            toast.success('Cliente creado correctamente');
            onClientCreated({
                name: formData.name,
                rif: fullRif,
            });

            onClose();
        } catch (error) {
            toast.error('Error al crear el cliente');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                            <UserPlus size={24} />
                        </div>
                        <h3 className="text-xl font-black text-gray-800">Nuevo Cliente</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Completo / Razón Social *</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition font-medium"
                                placeholder="Ej: Juan Pérez"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Cédula / RIF *</label>
                        <div className="flex gap-2">
                            <select
                                value={formData.rifType}
                                onChange={e => setFormData({ ...formData, rifType: e.target.value })}
                                className="w-24 border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-gray-700 focus:border-blue-500 focus:outline-none transition"
                            >
                                <option value="V">V</option>
                                <option value="J">J</option>
                                <option value="E">E</option>
                                <option value="G">G</option>
                                <option value="P">P</option>
                            </select>
                            <input
                                type="text"
                                required
                                value={formData.rifNumber}
                                onChange={e => setFormData({ ...formData, rifNumber: e.target.value })}
                                className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2 focus:border-blue-500 focus:outline-none transition font-medium"
                                placeholder="12345678"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Teléfono (Opcional)</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition font-medium"
                                placeholder="Ej: 04141234567"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {isLoading ? 'Guardando...' : 'Crear y Seleccionar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
