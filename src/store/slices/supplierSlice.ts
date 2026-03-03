/**
 * @file store/slices/supplierSlice.ts
 * @description CRUD de Proveedores contra Supabase.
 */

import { supabase } from '../../supabase/client';
import type { SetState, GetState } from '../types';
import type { Supplier } from '../../types';
import toast from 'react-hot-toast';

export const createSupplierSlice = (set: SetState, get: GetState) => ({

    addSupplier: async (supplierData: Omit<Supplier, 'id' | 'createdAt'>) => {
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .insert([{
                    name: supplierData.name,
                    rif: supplierData.rif || null,
                    rif_type: supplierData.rifType || null,
                    contact_name: supplierData.contactName || null,
                    phone: supplierData.phone || null,
                    email: supplierData.email || null,
                    address: supplierData.address || null,
                    category: supplierData.category || 'Otro',
                    notes: supplierData.notes || null,
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
            toast.error('Error al crear el proveedor');
        }
    },

    updateSupplier: async (id: string, updates: Partial<Supplier>) => {
        try {
            const dbUpdates: Record<string, unknown> = {};
            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.rif !== undefined) dbUpdates.rif = updates.rif;
            if (updates.rifType !== undefined) dbUpdates.rif_type = updates.rifType;
            if (updates.contactName !== undefined) dbUpdates.contact_name = updates.contactName;
            if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
            if (updates.email !== undefined) dbUpdates.email = updates.email;
            if (updates.address !== undefined) dbUpdates.address = updates.address;
            if (updates.category !== undefined) dbUpdates.category = updates.category;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

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
            toast.error('Error al actualizar el proveedor');
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
