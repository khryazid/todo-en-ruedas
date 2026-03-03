/**
 * @file slices/productSlice.ts
 * @description CRUD de productos.
 */

import { supabase } from '../../supabase/client';
import toast from 'react-hot-toast';
import type { Product } from '../../types';
import type { SetState, GetState } from '../types';

export const createProductSlice = (set: SetState, get: GetState) => ({

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
        const existingSupplier = get().suppliers.find((s) => s.name.toLowerCase() === product.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: product.supplier, catalog: [] });
      }

      if (data) {
        set((state) => ({ products: [...state.products, { ...product, id: data.id }] }));
        toast.success("Producto agregado");
      }
    } catch (error: unknown) {
      toast.error("Error: " + (error as Error).message);
    }
  },

  updateProduct: async (id: string, updates: Partial<Product>) => {
    try {
      const dbUpdates: Record<string, unknown> = {};
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

      // 📦 Log ADJUSTMENT if stock changed
      if (updates.stock !== undefined) {
        const currentProduct = get().products.find(p => p.id === id);
        if (currentProduct && updates.stock !== currentProduct.stock) {
          await get().addStockMovement({
            productId: id,
            productName: currentProduct.name,
            sku: currentProduct.sku,
            type: 'ADJUSTMENT',
            qtyBefore: currentProduct.stock,
            qtyChange: updates.stock - currentProduct.stock,
            reason: (updates as Record<string, unknown>).adjustmentReason as string | undefined,
          });
        }
      }

      if (updates.supplier && updates.supplier !== 'General') {
        const existingSupplier = get().suppliers.find((s) => s.name.toLowerCase() === updates.supplier!.toLowerCase());
        if (!existingSupplier) await supabase.from('suppliers').insert({ name: updates.supplier, catalog: [] });
      }

      set((state) => ({ products: state.products.map((p) => p.id === id ? { ...p, ...updates } : p) }));
      toast.success("Producto actualizado");
    } catch (error: unknown) {
      toast.error("Error al actualizar: " + (error as Error).message);
    }
  },

  deleteProduct: async (id: string) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        if (error.code === '23503' || (error.message && error.message.includes('foreign key constraint'))) {
          toast.error("No puedes borrar un producto con historial de ventas. Déjalo en Stock 0 o edita su nombre.", { duration: 5000 });
          return;
        }
        toast.error("Error al eliminar: " + error.message);
        return;
      }
      set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
      toast.success("Producto eliminado");
    } catch (error: unknown) {
      toast.error((error as Error).message, { duration: 6000 });
    }
  },
});
