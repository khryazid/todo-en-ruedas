/**
 * @file store/slices/userSlice.ts
 * @description Gestión de usuarios y permisos
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { SetState, GetState } from '../types';
import type { AppUser } from '../../types';
import { logAudit } from '../../utils/audit';

export const createUserSlice = (set: SetState, get: GetState) => ({

    users: [] as AppUser[],
    currentUserData: null as AppUser | null,

    /**
     * Obtiene todos los usuarios
     */
    fetchUsers: async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const users: AppUser[] = data.map(u => ({
                id: u.id,
                email: u.email,
                fullName: u.full_name,
                role: u.role,
                isActive: u.is_active,
                createdAt: u.created_at,
                updatedAt: u.updated_at,
                lastLogin: u.last_login
            }));

            set({ users });
        } catch (error: any) {
            // Si la tabla no existe (modo setup), no mostrar error
            const isSetupMode = error?.code === 'PGRST116' || error?.message?.includes('relation');
            if (isSetupMode) {
                console.warn('⚠️ Tabla users no existe - modo setup inicial');
                set({ users: [] });
                return;
            }
            console.error('❌ Error al cargar usuarios:', error);
            toast.error('Error al cargar usuarios');
        }
    },

    /**
     * Obtiene los datos del usuario actual
     */
    fetchCurrentUserData: async () => {
        try {
            const user = get().user;
            if (!user) return;

            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .maybeSingle(); // Usar maybeSingle en lugar de single



            if (error) {
                console.warn('⚠️ No se pudieron cargar datos del usuario:', error.message);
                return;
            }

            if (!data) {
                console.warn('⚠️ No se encontró el usuario en la tabla');
                return;
            }

            const userData: AppUser = {
                id: data.id,
                email: data.email,
                fullName: data.full_name,
                role: data.role,
                isActive: data.is_active,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                lastLogin: data.last_login
            };


            set({ currentUserData: userData });
        } catch (error) {
            console.warn('❌ Error al cargar datos del usuario:', error);
            // No lanzar error para no interrumpir el flujo de login
        }
    },

    /**
     * Configura el primer usuario administrador (auto-setup)
     */
    setupFirstAdmin: async (setupData: {
        companyName: string;
        fullName: string;
        email: string;
        password: string;
    }) => {
        try {
            // 1. Verificar que realmente sea primera vez
            const { count } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true });

            if (count && count > 0) {
                toast.error('Ya existe un usuario administrador');
                return false;
            }

            // 2. Crear usuario en Supabase Auth

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: setupData.email,
                password: setupData.password,
                options: {
                    data: {
                        full_name: setupData.fullName
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error('No se pudo crear el usuario');



            // 3. Login inmediato para establecer sesión activa
            // CRÍTICO: Esto debe hacerse ANTES de insertar en la tabla
            // para que la política RLS pueda verificar auth.uid()

            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                email: setupData.email,
                password: setupData.password
            });

            if (loginError) throw loginError;
            if (!loginData.user) throw new Error('No se pudo obtener usuario después del login');



            // 4. Ahora insertar en tabla users (con sesión activa)

            const { error: userError } = await supabase
                .from('users')
                .insert({
                    id: loginData.user.id,
                    email: setupData.email,
                    full_name: setupData.fullName,
                    role: 'ADMIN',
                    is_active: true
                });

            if (userError) {
                console.error('❌ Error al insertar en tabla users:', userError);
                throw userError;
            }



            // Nota: No creamos settings aquí porque la tabla tiene un schema diferente
            // El usuario puede configurar settings después desde la página de Settings

            // 5. Actualizar estado con el usuario logueado

            set({
                user: loginData.user,
                currentUserData: {
                    id: loginData.user.id,
                    email: setupData.email,
                    fullName: setupData.fullName,
                    role: 'ADMIN',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastLogin: undefined
                },
                isLoading: false
            });


            toast.success(`¡Bienvenido, ${setupData.fullName}!`);

            // Dar un momento para que el estado se actualice antes de retornar
            await new Promise(resolve => setTimeout(resolve, 100));

            return true;
        } catch (error: unknown) {
            console.error('Error en setup inicial:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            toast.error(`Error en configuración inicial: ${errorMessage}`);
            return false;
        }
    },

    /**
     * Crea un nuevo usuario
     */
    createUser: async (userData: {
        email: string;
        password: string;
        fullName: string;
        role: AppUser['role'];
    }) => {
        let authUserId: string | null = null;

        try {


            // 1. Crear usuario en Supabase Auth usando signUp

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        full_name: userData.fullName,
                        role: userData.role
                    }
                }
            });

            if (authError) {
                console.error('❌ Error en Auth:', authError);
                throw authError;
            }
            if (!authData.user) {
                console.error('❌ No se obtuvo usuario de Auth');
                throw new Error('No se pudo crear el usuario en Auth');
            }

            authUserId = authData.user.id;


            // 2. Crear registro en tabla users

            const { error: userError } = await supabase
                .from('users')
                .insert({
                    id: authUserId,
                    email: userData.email,
                    full_name: userData.fullName,
                    role: userData.role,
                    is_active: true
                });

            if (userError) {
                console.error('❌ Error al insertar en tabla users:', userError);
                // IMPORTANTE: Si falla la tabla, intentar borrar el usuario de Auth
                console.warn('⚠️ Intentando rollback: borrando usuario de Auth...');
                throw new Error(`Error al crear registro en tabla: ${userError.message}`);
            }



            // 3. Registrar en auditoría

            await logAudit({
                action: 'CREATE',
                entity: 'user',
                entityId: authUserId,
                changes: { email: userData.email, role: userData.role }
            });

            // 4. Actualizar estado local

            await get().fetchUsers();


            toast.success(`Usuario ${userData.fullName} creado exitosamente`);
            return true;
        } catch (error: unknown) {
            console.error('❌ Error al crear usuario:', error);

            // Manejar error de usuario duplicado
            if (error instanceof Error && error.message.includes('already registered')) {
                toast.error(`El email ${userData.email} ya está registrado. Usa otro email.`);
                return false;
            }

            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            toast.error(`Error al crear usuario: ${errorMessage}`);

            // Si se creó en Auth pero falló en tabla, mostrar mensaje específico
            if (authUserId) {
                console.error('⚠️ ADVERTENCIA: Usuario creado en Auth pero no en tabla. ID:', authUserId);
                toast.error('El usuario se creó parcialmente. Contacta al administrador.');
            }

            return false;
        }
    },

    /**
     * Actualiza un usuario existente
     */
    updateUser: async (userId: string, updates: {
        fullName?: string;
        role?: AppUser['role'];
        isActive?: boolean;
    }) => {
        try {


            const updateData: any = {};
            if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
            if (updates.role !== undefined) updateData.role = updates.role;
            if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

            const { error } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', userId);

            if (error) {
                console.error('❌ Error al actualizar usuario:', error);
                throw error;
            }



            // Registrar en auditoría
            await logAudit({
                action: 'UPDATE',
                entity: 'user',
                entityId: userId,
                changes: updates
            });

            // Actualizar estado local
            await get().fetchUsers();

            toast.success('Usuario actualizado exitosamente');
            return true;
        } catch (error: unknown) {
            console.error('❌ Error al actualizar usuario:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            toast.error(`Error al actualizar usuario: ${errorMessage}`);
            return false;
        }
    },

    /**
     * Desactiva un usuario (soft delete)
     */
    deactivateUser: async (userId: string) => {
        try {
            const { error } = await supabase
                .from('users')
                .update({ is_active: false })
                .eq('id', userId);

            if (error) throw error;

            // Registrar en auditoría
            await logAudit({
                action: 'DELETE',
                entity: 'user',
                entityId: userId
            });

            // Actualizar estado local
            set(state => ({
                users: state.users.map(u =>
                    u.id === userId ? { ...u, isActive: false } : u
                )
            }));

            toast.success('Usuario desactivado');
        } catch (error) {
            console.error('Error al desactivar usuario:', error);
            toast.error('Error al desactivar usuario');
        }
    },

    /**
     * Reactiva un usuario
     */
    activateUser: async (userId: string) => {
        try {
            const { error } = await supabase
                .from('users')
                .update({ is_active: true })
                .eq('id', userId);

            if (error) throw error;

            set(state => ({
                users: state.users.map(u =>
                    u.id === userId ? { ...u, isActive: true } : u
                )
            }));

            toast.success('Usuario activado');
        } catch (error) {
            console.error('Error al activar usuario:', error);
            toast.error('Error al activar usuario');
        }
    },

    /**
     * Cambia la contraseña de un usuario
     */
    changeUserPassword: async (userId: string, newPassword: string) => {
        try {
            const { error } = await supabase.auth.admin.updateUserById(userId, {
                password: newPassword
            });

            if (error) throw error;

            await logAudit({
                action: 'UPDATE',
                entity: 'user',
                entityId: userId,
                changes: { action: 'password_changed' }
            });

            toast.success('Contraseña actualizada');
        } catch (error) {
            console.error('Error al cambiar contraseña:', error);
            toast.error('Error al cambiar contraseña');
        }
    }
});
