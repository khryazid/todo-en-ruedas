/**
 * @file slices/productSlice.ts
 * @description CRUD de productos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Product } from '../../types';

export const createProductSlice = (set: any, get: any) => ({

  products: [] as Product[],

  addProduct: async (product: Product) => {
    try {
      const { data, error } = await supabase.from('products').insert({
        sku: product.sku, name: product.name, category: product.category,
        stock: product.stock, min_stock: product.minStock, cost: product.cost,
        cost_type: product.costType, freight: product.freight, supplier: product.supplier
      }).select().single();

      if (error) throw error;

      if (product.supplier && product.supplier !== 'General') {
        const existingSupplier = get().suppliers.find((s: any) => s.name.toLowerCase() === product.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: product.supplier, catalog: [] });
      }

      if (data) {
        set((state: any) => ({ products: [...state.products, { ...product, id: data.id }] }));
        toast.success("Producto agregado");
      }
    } catch (error: any) {
      toast.error("Error: " + error.message);
    }
  },

  updateProduct: async (id: string, updates: Partial<Product>) => {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
      if (updates.cost !== undefined) dbUpdates.cost = updates.cost;
      if (updates.minStock !== undefined) dbUpdates.min_stock = updates.minStock;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.supplier !== undefined) dbUpdates.supplier = updates.supplier;
      if (updates.costType !== undefined) dbUpdates.cost_type = updates.costType;
      if (updates.freight !== undefined) dbUpdates.freight = updates.freight;

      const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
      if (error) throw error;

      if (updates.supplier && updates.supplier !== 'General') {
        const existingSupplier = get().suppliers.find((s: any) => s.name.toLowerCase() === updates.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: updates.supplier, catalog: [] });
      }

      set((state: any) => ({ products: state.products.map((p: any) => p.id === id ? { ...p, ...updates } : p) }));
      toast.success("Producto actualizado");
    } catch (error: any) {
      toast.error("Error al actualizar: " + error.message);
    }
  },

  deleteProduct: async (id: string) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key constraint')) {
          throw new Error("No puedes borrar un producto que ya tiene ventas en el historial. Déjalo en Stock 0 o edita su nombre.");
        }
        throw error;
      }
      set((state: any) => ({ products: state.products.filter((p: any) => p.id !== id) }));
      toast.success("Producto eliminado");
    } catch (error: any) {
      toast.error(error.message, { duration: 6000 });
    }
  },
});
