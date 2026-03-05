/**
 * @file store/slices/supplierSlice.ts
 * @description CRUD de Proveedores contra Supabase.
 */

import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { Supplier } from '../../types';
import toast from 'react-hot-toast';

const normalizeNullable = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    return normalized === '' ? null : normalized;
};

export const createSupplierSlice = (set: SetState, get: GetState) => ({

    addSupplier: async (supplierData: Omit<Supplier, 'id' | 'createdAt'>) => {
        try {
            const rifValue = normalizeNullable(supplierData.rif);
            const { data, error } = await supabase
                .from('suppliers')
                .insert([{
                    name: supplierData.name.trim(),
                    rif: rifValue,
                    rif_type: rifValue ? (supplierData.rifType || 'J') : null,
                    contact_name: normalizeNullable(supplierData.contactName),
                    phone: normalizeNullable(supplierData.phone),
                    email: normalizeNullable(supplierData.email),
                    address: normalizeNullable(supplierData.address),
                    category: normalizeNullable(supplierData.category),
                    notes: normalizeNullable(supplierData.notes),
                }])
                .select()
                .single();

            if (error) throw error;

            const newSupplier: Supplier = {
                id: data.id,
                name: data.name,
                rif: data.rif,
                rifType: data.rif_type,
                contactName: data.contact_name,
                phone: data.phone,
                email: data.email,
                address: data.address,
                category: data.category,
                notes: data.notes,
                createdAt: data.created_at,
            };

            set(state => ({ suppliers: [...state.suppliers, newSupplier] }));
            toast.success(`Proveedor "${newSupplier.name}" creado`);
        } catch (err) {
            console.error('addSupplier error:', err);
            const message = err instanceof Error ? err.message : String(err);
            if (message.toLowerCase().includes('column') && message.toLowerCase().includes('suppliers')) {
                toast.error('Estructura de proveedores desactualizada. Ejecuta la migración suppliers_extended_fields en Supabase.');
            } else {
                toast.error('Error al crear el proveedor');
            }
        }
    },

    updateSupplier: async (id: string, updates: Partial<Supplier>) => {
        try {
            const dbUpdates: Record<string, unknown> = {};
            if ('name' in updates) dbUpdates.name = normalizeNullable(updates.name) ?? '';

            if ('rif' in updates) {
                const rif = normalizeNullable(updates.rif);
                dbUpdates.rif = rif;
                if (!rif) {
                    dbUpdates.rif_type = null;
                }
            }

            if ('rifType' in updates && !('rif' in updates)) {
                dbUpdates.rif_type = normalizeNullable(updates.rifType) || null;
            }

            if ('contactName' in updates) dbUpdates.contact_name = normalizeNullable(updates.contactName);
            if ('phone' in updates) dbUpdates.phone = normalizeNullable(updates.phone);
            if ('email' in updates) dbUpdates.email = normalizeNullable(updates.email);
            if ('address' in updates) dbUpdates.address = normalizeNullable(updates.address);
            if ('category' in updates) dbUpdates.category = normalizeNullable(updates.category);
            if ('notes' in updates) dbUpdates.notes = normalizeNullable(updates.notes);

            const { error } = await supabase
                .from('suppliers')
                .update(dbUpdates)
                .eq('id', id);

            if (error) throw error;

            set(state => ({
                suppliers: state.suppliers.map(s =>
                    s.id === id ? { ...s, ...updates } : s
                ),
            }));
            toast.success('Proveedor actualizado');
        } catch (err) {
            console.error('updateSupplier error:', err);
            const message = err instanceof Error ? err.message : String(err);
            if (message.toLowerCase().includes('column') && message.toLowerCase().includes('suppliers')) {
                toast.error('Estructura de proveedores desactualizada. Ejecuta la migración suppliers_extended_fields en Supabase.');
            } else {
                toast.error('Error al actualizar el proveedor');
            }
        }
    },

    deleteSupplier: async (id: string): Promise<boolean> => {
        // Check for linked invoices (by supplier name since invoices store supplier as string)
        const supplierName = get().suppliers.find(s => s.id === id)?.name || '';
        const linkedInvoices = get().invoices.filter(inv => inv.supplier?.toLowerCase() === supplierName.toLowerCase());
        if (linkedInvoices.length > 0) {
            toast.error(`No se puede eliminar: tiene ${linkedInvoices.length} factura(s) vinculada(s)`);
            return false;
        }

        try {
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('id', id);

            if (error) throw error;

            set(state => ({
                suppliers: state.suppliers.filter(s => s.id !== id),
            }));
            toast.success('Proveedor eliminado');
            return true;
        } catch (err) {
            console.error('deleteSupplier error:', err);
            toast.error('Error al eliminar el proveedor');
            return false;
        }
    },
});
