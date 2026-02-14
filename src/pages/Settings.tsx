/**
 * @file Settings.tsx
 * @description Pantalla de Configuración Global conectada a Supabase.
 * Incluye: Datos Fiscales, Tasas de Cambio, Márgenes y Métodos de Pago.
 *
 * ✅ SPRINT 1.2 FIX: handleAddMethod y deletePaymentMethod ahora son async.
 */

import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, RefreshCw, Percent, Eye, EyeOff, Trash2,
  CreditCard, Plus, Building2
} from 'lucide-react';
import type { RifType, CurrencyView, PaymentCurrency } from '../types';

export const Settings = () => {
  const { settings, updateSettings, paymentMethods, addPaymentMethod, deletePaymentMethod } = useStore();

  const [formData, setFormData] = useState(settings);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodCurrency, setNewMethodCurrency] = useState<PaymentCurrency>('USD');

  // Sincronizar datos cuando cambian en el store
  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({ ...formData, lastUpdated: new Date().toISOString() });
  };

  // ✅ FIX: Ahora es async para coincidir con el store
  const handleAddMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethodName.trim()) return;
    await addPaymentMethod(newMethodName, newMethodCurrency);
    setNewMethodName('');
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full animate-in fade-in duration-300">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Configuración</h2>
          <p className="text-gray-500 font-medium">Control total del sistema (Sincronizado en la nube)</p>
        </div>
        <button
          onClick={handleSave}
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 flex items-center justify-center gap-2 transition active:scale-95"
        >
          <Save size={20} /> Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. DATOS DE LA EMPRESA */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50">
            <Building2 className="text-blue-600" /> Datos Fiscales (Encabezado de Ticket)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Nombre Empresa</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg p-2 font-bold focus:ring-2 focus:ring-blue-100 outline-none transition"
                value={formData.companyName}
                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Tipo</label>
                <select
                  className="w-full border border-gray-200 rounded-lg p-2 font-bold bg-white outline-none focus:ring-2 focus:ring-blue-100"
                  value={formData.rifType}
                  onChange={e => setFormData({ ...formData, rifType: e.target.value as RifType })}
                >
                  {['J', 'V', 'E', 'G', 'P', 'C'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">RIF / CI</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-lg p-2 font-bold focus:ring-2 focus:ring-blue-100 outline-none transition"
                  value={formData.rif}
                  onChange={e => setFormData({ ...formData, rif: e.target.value })}
                />
              </div>
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Moneda Impresión</label>
              <select
                className="w-full border border-gray-200 rounded-lg p-2 font-bold bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-blue-100"
                value={formData.printerCurrency}
                onChange={e => setFormData({ ...formData, printerCurrency: e.target.value as CurrencyView })}
              >
                <option value="BS">BOLÍVARES (Bs.)</option>
                <option value="USD">DÓLARES ($)</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Dirección Fiscal</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* 2. TASAS DE CAMBIO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50">
            <RefreshCw className="text-green-600" /> Tasas de Cambio
          </h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Tasa BCV (Oficial)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-12 pr-4 py-3 border-2 border-blue-100 rounded-xl focus:border-blue-500 outline-none text-xl font-black text-gray-800 transition"
                  value={formData.tasaBCV || ''}
                  onChange={e => setFormData({ ...formData, tasaBCV: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-gray-700">Tasa Monitor</label>
                <button
                  onClick={() => setFormData({ ...formData, showMonitorRate: !formData.showMonitorRate })}
                  className="text-xs flex items-center gap-1 text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded transition"
                >
                  {formData.showMonitorRate ? <><Eye size={14} /> Visible en POS</> : <><EyeOff size={14} /> Oculto en POS</>}
                </button>
              </div>
              <div className={`relative transition-opacity ${formData.showMonitorRate ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:border-gray-400 outline-none text-xl font-black text-gray-600 transition"
                  value={formData.tasaTH || ''}
                  onChange={e => setFormData({ ...formData, tasaTH: parseFloat(e.target.value) || 0 })}
                  disabled={!formData.showMonitorRate}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. MÁRGENES E IMPUESTOS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50">
            <Percent className="text-orange-500" /> Márgenes e Impuestos
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Ganancia Default</label>
              <div className="relative">
                <input
                  type="number"
                  className="w-full border-2 border-orange-50 rounded-xl p-3 text-lg font-bold text-gray-800 outline-none focus:border-orange-300 transition"
                  value={formData.defaultMargin || ''}
                  onChange={e => setFormData({ ...formData, defaultMargin: parseFloat(e.target.value) || 0 })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-tight">Se aplica a productos nuevos si no se especifica otro.</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">IVA / Impuesto</label>
              <div className="relative">
                <input
                  type="number"
                  className="w-full border-2 border-orange-50 rounded-xl p-3 text-lg font-bold text-gray-800 outline-none focus:border-orange-300 transition"
                  value={formData.defaultVAT || ''}
                  onChange={e => setFormData({ ...formData, defaultVAT: parseFloat(e.target.value) || 0 })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-tight">Impuesto al Valor Agregado (Aplica general).</p>
            </div>
          </div>
        </div>

        {/* 4. MÉTODOS DE PAGO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50">
            <CreditCard className="text-purple-600" /> Métodos de Pago
          </h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {paymentMethods.map(method => (
              <div key={method.id} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-bold ${method.currency === 'BS' ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                <span>{method.name}</span>
                <span className="text-[10px] opacity-70">({method.currency})</span>
                <button
                  onClick={async () => await deletePaymentMethod(method.id)}
                  className="text-gray-400 hover:text-red-500 hover:bg-white rounded-full p-1 ml-1 transition"
                  title="Eliminar método"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddMethod} className="flex gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <input
              type="text"
              placeholder="Ej: Binance, Zelle..."
              className="flex-1 border border-gray-200 bg-white rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-purple-100 outline-none transition font-medium"
              value={newMethodName}
              onChange={e => setNewMethodName(e.target.value)}
            />
            <select
              className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-purple-100 outline-none transition"
              value={newMethodCurrency}
              onChange={e => setNewMethodCurrency(e.target.value as PaymentCurrency)}
            >
              <option value="USD">USD ($)</option>
              <option value="BS">BS (Bs)</option>
            </select>
            <button type="submit" className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 transition flex items-center gap-1 shadow-sm">
              <Plus size={18} /> Agregar
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};