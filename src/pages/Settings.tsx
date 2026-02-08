/**
 * @file Settings.tsx
 * @description Configuración Global.
 * Gestión de tasas de cambio, datos de la empresa, métodos de pago y copias de seguridad.
 */

import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, RefreshCw, CreditCard, Download, Upload,
  Trash2, Plus, Building2, Smartphone
} from 'lucide-react';

export const Settings = () => {
  const { settings, updateSettings, paymentMethods, addPaymentMethod, deletePaymentMethod } = useStore();
  const [formData, setFormData] = useState(settings);
  const [newMethodName, setNewMethodName] = useState('');

  // Sincronizar estado local si cambia el store
  useEffect(() => { setFormData(settings); }, [settings]);

  const handleSave = () => {
    updateSettings(formData);
    alert("✅ Configuración guardada. Los precios en Bolívares se han actualizado.");
  };

  const handleAddMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMethodName.trim()) {
      addPaymentMethod(newMethodName.trim(), 'USD'); // Por defecto USD, configurable si deseas
      setNewMethodName('');
    }
  };

  // --- BACKUP ---
  const handleDownloadBackup = () => {
    const data = localStorage.getItem('todo-en-ruedas-storage');
    if (!data) return alert("No hay datos para exportar");
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_todoenruedas_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        JSON.parse(text); // Validar JSON
        localStorage.setItem('todo-en-ruedas-storage', text);
        alert("✅ Restauración completa. La página se recargará.");
        window.location.reload();
      } catch (error) {
        alert("❌ Archivo corrupto o inválido.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Configuración</h2>
          <p className="text-gray-500 font-medium">Parámetros globales del sistema</p>
        </div>
        <button
          onClick={handleSave}
          className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 flex items-center gap-2 active:scale-95 transition"
        >
          <Save size={20} /> Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. TASAS DE CAMBIO (CRÍTICO) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><RefreshCw className="text-blue-600" /> Tasas de Cambio</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Tasa BCV (Oficial)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-10 pr-4 py-3 bg-blue-50 border border-blue-100 rounded-xl font-black text-blue-900 text-lg focus:ring-2 focus:ring-blue-200 outline-none"
                  value={formData.tasaBCV}
                  onChange={e => setFormData({ ...formData, tasaBCV: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Tasa Monitor (Paralelo)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full pl-10 pr-4 py-3 bg-orange-50 border border-orange-100 rounded-xl font-black text-orange-900 text-lg focus:ring-2 focus:ring-orange-200 outline-none"
                  value={formData.tasaTH}
                  onChange={e => setFormData({ ...formData, tasaTH: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 italic">* Al guardar, los precios en bolívares de todo el inventario se actualizarán.</p>
        </div>

        {/* 2. DATOS DE LA EMPRESA */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Building2 className="text-gray-600" /> Datos Fiscales</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Nombre Empresa</label>
              <input className="w-full border rounded-lg p-2 mt-1" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <div className="w-1/3">
                <label className="text-xs font-bold text-gray-400 uppercase">Tipo RIF</label>
                <select className="w-full border rounded-lg p-2 mt-1 bg-white" value={formData.rifType} onChange={e => setFormData({ ...formData, rifType: e.target.value as any })}>
                  <option value="J">J</option><option value="V">V</option><option value="E">E</option><option value="G">G</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Número RIF</label>
                <input className="w-full border rounded-lg p-2 mt-1" value={formData.rif} onChange={e => setFormData({ ...formData, rif: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Dirección Fiscal</label>
              <input className="w-full border rounded-lg p-2 mt-1" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            </div>
          </div>
        </div>

        {/* 3. MÉTODOS DE PAGO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><CreditCard className="text-green-600" /> Métodos de Pago</h3>
          <form onSubmit={handleAddMethod} className="flex gap-2 mb-4">
            <input
              placeholder="Nuevo método (ej: Binance)"
              className="flex-1 border rounded-xl px-4 py-2 text-sm"
              value={newMethodName}
              onChange={e => setNewMethodName(e.target.value)}
            />
            <button type="submit" className="bg-gray-900 text-white p-2 rounded-xl hover:bg-black"><Plus size={20} /></button>
          </form>
          <div className="flex flex-wrap gap-2">
            {paymentMethods.map(pm => (
              <div key={pm.id} className="bg-gray-50 border px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium text-gray-600">
                {pm.name}
                <button onClick={() => deletePaymentMethod(pm.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* 4. ZONA DE RESPALDO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Smartphone className="text-purple-600" /> Datos y Seguridad</h3>
          <div className="flex gap-4">
            <button onClick={handleDownloadBackup} className="flex-1 py-4 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition gap-2 text-gray-600 font-bold">
              <Download size={24} /> Descargar Backup
            </button>
            <label className="flex-1 py-4 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition gap-2 text-gray-600 font-bold cursor-pointer">
              <Upload size={24} /> Restaurar Backup
              <input type="file" className="hidden" accept=".json" onChange={handleRestoreBackup} />
            </label>
          </div>
        </div>

      </div>
    </div>
  );
};