/**
 * @file pages/Users.tsx
 * @description Gestión de usuarios del sistema
 */

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { usePermissions } from '../hooks/usePermissions';
import { getRoleName, getRoleColor } from '../utils/permissions';
import { Users as UsersIcon, UserPlus, Shield, Mail, Calendar, Check, X, Key, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AppUser, UserRole } from '../types';

export const Users = () => {
    const { users, currentUserData, fetchUsers, createUser, updateUser, deactivateUser, activateUser, changeUserPassword } = useStore();
    const { canManageUsers, isAdmin, isManager } = usePermissions();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Mostrar mensaje diferente si no hay currentUserData (modo setup)
    if (!currentUserData) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <UsersIcon className="h-16 w-16 text-brand-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Modo de Configuración Inicial</h2>
                    <p className="text-gray-500">No hay un usuario administrador configurado. Por favor, crea el primer usuario para iniciar el sistema.</p>
                </div>
            </div>
        );
    }

    if (!canManageUsers) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Acceso Denegado</h2>
                    <p className="text-gray-500">No tienes permisos para gestionar usuarios</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <UsersIcon className="h-7 w-7 text-brand-600" />
                        Gestión de Usuarios
                    </h1>
                    <p className="text-gray-600 mt-1">Administra los usuarios y sus permisos</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
                >
                    <UserPlus className="h-5 w-5" />
                    Nuevo Usuario
                </button>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Usuario
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Rol
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Estado
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Último Acceso
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10 bg-brand-100 rounded-full flex items-center justify-center">
                                            <span className="text-brand-600 font-semibold">
                                                {user.fullName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{user.fullName}</div>
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Mail className="h-3 w-3" />
                                                {user.email}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(user.role)}`}>
                                        {getRoleName(user.role)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {user.isActive ? (
                                        <span className="flex items-center gap-1 text-green-600 text-sm">
                                            <Check className="h-4 w-4" />
                                            Activo
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-red-600 text-sm">
                                            <X className="h-4 w-4" />
                                            Inactivo
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {user.lastLogin ? (
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(user.lastLogin).toLocaleDateString('es-VE')}
                                        </div>
                                    ) : (
                                        <span className="text-gray-400">Nunca</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end gap-2">
                                        {/* MANAGER no puede editar ADMIN */}
                                        {!(isManager && user.role === 'ADMIN') && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setShowEditModal(true);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-900"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setShowPasswordModal(true);
                                                    }}
                                                    className="text-purple-600 hover:text-purple-900"
                                                    title="Cambiar contraseña"
                                                >
                                                    <Key className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (user.isActive) {
                                                            deactivateUser(user.id);
                                                        } else {
                                                            activateUser(user.id);
                                                        }
                                                    }}
                                                    className={user.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                                                    title={user.isActive ? 'Desactivar' : 'Activar'}
                                                >
                                                    {user.isActive ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                                </button>
                                            </>
                                        )}
                                        {/* Mostrar mensaje si es MANAGER intentando gestionar ADMIN */}
                                        {isManager && user.role === 'ADMIN' && (
                                            <span className="text-xs text-gray-400 italic">Sin permisos</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {users.length === 0 && (
                    <div className="text-center py-12">
                        <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No hay usuarios registrados</p>
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <CreateUserModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={createUser}
                />
            )}

            {/* Edit User Modal */}
            {showEditModal && selectedUser && (
                <EditUserModal
                    user={selectedUser}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedUser(null);
                    }}
                    onUpdate={updateUser}
                />
            )}

            {/* Change Password Modal */}
            {showPasswordModal && selectedUser && (
                <ChangePasswordModal
                    user={selectedUser}
                    onClose={() => {
                        setShowPasswordModal(false);
                        setSelectedUser(null);
                    }}
                    onChangePassword={changeUserPassword}
                />
            )}
        </div>
    );
};

// Create User Modal Component
const CreateUserModal = ({ onClose, onCreate }: {
    onClose: () => void;
    onCreate: (data: { email: string; password: string; fullName: string; role: UserRole }) => Promise<boolean>;
}) => {
    const { isManager } = usePermissions();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        role: 'SELLER' as UserRole
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await onCreate(formData);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Crear Nuevo Usuario</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                        <input
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                            minLength={6}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                            <option value="SELLER">Vendedor</option>
                            {/* MANAGER no puede crear ADMIN ni MANAGER */}
                            {!isManager && <option value="MANAGER">Gerente</option>}
                            {!isManager && <option value="ADMIN">Administrador</option>}
                            <option value="VIEWER">Visualizador</option>
                        </select>
                    </div>
                    <div className="flex gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                        >
                            Crear Usuario
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Edit User Modal Component
const EditUserModal = ({ user, onClose, onUpdate }: {
    user: AppUser;
    onClose: () => void;
    onUpdate: (userId: string, updates: Partial<AppUser>) => Promise<boolean>;
}) => {
    const [formData, setFormData] = useState({
        fullName: user.fullName,
        role: user.role
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onUpdate(user.id, formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Editar Usuario</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                            <option value="SELLER">Vendedor</option>
                            <option value="MANAGER">Gerente</option>
                            <option value="ADMIN">Administrador</option>
                            <option value="VIEWER">Visualizador</option>
                        </select>
                    </div>
                    <div className="flex gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Change Password Modal Component
const ChangePasswordModal = ({ user, onClose, onChangePassword }: {
    user: AppUser;
    onClose: () => void;
    onChangePassword: (userId: string, newPassword: string) => Promise<void>;
}) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }
        await onChangePassword(user.id, newPassword);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Cambiar Contraseña</h2>
                <p className="text-gray-600 mb-4">Usuario: {user.fullName}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                            minLength={6}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                            required
                            minLength={6}
                        />
                    </div>
                    <div className="flex gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                        >
                            Cambiar Contraseña
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
