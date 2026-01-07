import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, RefreshCw, Percent, Eye, EyeOff, Trash2,
  AlertTriangle, CreditCard, Plus, FileText,
  Download, Upload
} from 'lucide-react';
import type { RifType, CurrencyView, PaymentCurrency } from '../types';

export const Settings = () => {
  const { settings, updateSettings, paymentMethods, addPaymentMethod, deletePaymentMethod } = useStore();

  const [formData, setFormData] = useState(settings);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodCurrency, setNewMethodCurrency] = useState<PaymentCurrency>('USD');

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSave = () => {
    updateSettings({ ...formData, lastUpdated: new Date().toISOString() });
    alert("¡Configuración actualizada! Se recalcularán los precios.");
  };

  const handleAddMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethodName.trim()) return;
    addPaymentMethod(newMethodName, newMethodCurrency);
    setNewMethodName('');
  };

  // --- LÓGICA DE RESPALDO (NUEVO) ---
  const handleExportData = () => {
    const data = localStorage.getItem('todo-en-ruedas-storage');
    if (!data) return alert("No hay datos para exportar.");

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_todo_en_ruedas_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm("⚠️ PELIGRO: Al importar, se BORRARÁN todos los datos actuales y se reemplazarán por los del archivo. ¿Estás seguro?")) {
      event.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        // Validar que sea un JSON válido
        JSON.parse(content);
        localStorage.setItem('todo-en-ruedas-storage', content);
        alert("✅ Base de datos restaurada con éxito. El sistema se reiniciará.");
        window.location.reload();
      } catch (error) {
        alert("❌ Error: El archivo está corrupto o no es válido.");
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = () => {
    if (window.confirm("🔴 ¿ESTÁS SEGURO?\n\nEsto borrará TODAS las ventas, facturas y cambios.\nEl sistema volverá al estado original.\n\nEsta acción NO se puede deshacer.")) {
      localStorage.removeItem('todo-en-ruedas-storage');
      window.location.reload();
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen w-full">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-2xl font-bold text-gray-800">Configuración</h2><p className="text-gray-500">Parámetros globales del sistema</p></div>
        <button onClick={handleSave} className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition"><Save size={20} /> Guardar Cambios</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. DATOS FISCALES */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 md:col-span-2">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50"><FileText className="text-blue-600" /> Datos de Facturación (Encabezado)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1"><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del Comercio / Razón Social</label><input type="text" className="w-full border border-gray-200 rounded-lg p-2 font-bold" value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} /></div>
            <div className="flex gap-2"><div className="w-20"><label className="block text-xs font-bold text-gray-500 mb-1">Tipo</label><select className="w-full border border-gray-200 rounded-lg p-2" value={formData.rifType} onChange={e => setFormData({ ...formData, rifType: e.target.value as RifType })}>{['V', 'J', 'E', 'G', 'P', 'C'].map(t => <option key={t}>{t}</option>)}</select></div><div className="flex-1"><label className="block text-xs font-bold text-gray-500 mb-1">Número RIF</label><input type="text" className="w-full border border-gray-200 rounded-lg p-2" value={formData.rif} onChange={e => setFormData({ ...formData, rif: e.target.value })} /></div></div>
            <div className="md:col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Dirección Fiscal</label><input type="text" className="w-full border border-gray-200 rounded-lg p-2" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Moneda Principal de Impresión</label><select className="w-full border border-gray-200 rounded-lg p-2 font-bold bg-gray-50" value={formData.printerCurrency} onChange={e => setFormData({ ...formData, printerCurrency: e.target.value as CurrencyView })}><option value="BS">BOLÍVARES (Bs.)</option><option value="USD">DÓLARES ($)</option></select><p className="text-[10px] text-gray-400 mt-1">* La otra moneda saldrá pequeña abajo.</p></div>
          </div>
        </div>

        {/* 2. TASAS DE CAMBIO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50"><RefreshCw className="text-green-600" /> Tasas de Cambio (Bs/USD)</h3>
          <div className="space-y-6">
            <div><label className="block text-sm font-bold text-gray-700 mb-2">Tasa BCV (Oficial)</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span><input type="number" step="0.01" className="w-full pl-12 pr-4 py-3 border-2 border-blue-100 rounded-xl focus:border-blue-500 outline-none text-xl font-bold text-gray-800" value={formData.tasaBCV} onChange={e => setFormData({ ...formData, tasaBCV: parseFloat(e.target.value) || 0 })} /></div></div>
            <div><div className="flex justify-between items-center mb-2"><label className="block text-sm font-bold text-gray-700">Tasa Monitor</label><button onClick={() => setFormData({ ...formData, showMonitorRate: !formData.showMonitorRate })} className="text-xs flex items-center gap-1 text-blue-600 font-bold hover:underline">{formData.showMonitorRate ? <><Eye size={14} /> Visible</> : <><EyeOff size={14} /> Oculto</>}</button></div><div className={`relative transition-opacity ${formData.showMonitorRate ? 'opacity-100' : 'opacity-50 grayscale'}`}><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Bs.</span><input type="number" step="0.01" className="w-full pl-12 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:border-gray-400 outline-none text-xl font-bold text-gray-600" value={formData.tasaTH} onChange={e => setFormData({ ...formData, tasaTH: parseFloat(e.target.value) || 0 })} disabled={!formData.showMonitorRate} /></div></div>
          </div>
        </div>

        {/* 3. MÁRGENES E IMPUESTOS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50"><Percent className="text-orange-500" /> Márgenes e Impuestos Globales</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Margen de Ganancia (%)</label><div className="relative"><input type="number" className="w-full border-2 border-orange-50 rounded-xl p-3 text-lg font-bold text-gray-800 outline-none focus:border-orange-200" value={formData.defaultMargin} onChange={e => setFormData({ ...formData, defaultMargin: parseFloat(e.target.value) || 0 })} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span></div><p className="text-[10px] text-gray-400 mt-1">Se aplica si el producto no tiene uno propio.</p></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Impuesto IVA (%)</label><div className="relative"><input type="number" className="w-full border-2 border-orange-50 rounded-xl p-3 text-lg font-bold text-gray-800 outline-none focus:border-orange-200" value={formData.defaultVAT} onChange={e => setFormData({ ...formData, defaultVAT: parseFloat(e.target.value) || 0 })} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span></div><p className="text-[10px] text-gray-400 mt-1">Normalmente 16%.</p></div>
          </div>
        </div>

        {/* 4. MÉTODOS DE PAGO */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 md:col-span-2">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 pb-4 border-b border-gray-50"><CreditCard className="text-purple-600" /> Métodos de Pago</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {paymentMethods.map(method => (
              <div key={method.id} className={`flex items-center gap-1 px-3 py-1 border rounded-lg text-xs font-bold ${method.currency === 'BS' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                {method.name} <span className="text-[9px] opacity-60 ml-1">({method.currency})</span>
                <button onClick={() => deletePaymentMethod(method.id)} className="text-gray-400 hover:text-red-500 ml-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddMethod} className="flex gap-2">
            <input type="text" placeholder="Nuevo método..." className="flex-1 border rounded-lg px-3 py-2 text-sm" value={newMethodName} onChange={e => setNewMethodName(e.target.value)} />
            <select className="border rounded-lg px-2 py-2 text-sm bg-gray-50 font-bold" value={newMethodCurrency} onChange={e => setNewMethodCurrency(e.target.value as PaymentCurrency)}>
              <option value="USD">USD ($)</option>
              <option value="BS">BS (Bs)</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold"><Plus size={16} /></button>
          </form>
        </div>

      </div>

      {/* 5. SEGURIDAD DE DATOS (NUEVO) */}
      <div className="mt-8 bg-blue-50 border border-blue-200 p-6 rounded-2xl">
        <h3 className="text-blue-800 font-bold text-lg mb-4 flex items-center gap-2"><FileText size={20} /> Seguridad de Datos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-4 rounded-xl border border-blue-100">
            <p className="font-bold text-gray-700 mb-1">Exportar Copia de Seguridad</p>
            <p className="text-xs text-gray-500 mb-3">Descarga toda tu información (Ventas, Inventario, Deudas) a un archivo seguro para respaldar.</p>
            <button onClick={handleExportData} className="w-full py-3 bg-white border-2 border-blue-200 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-50 transition">
              <Download size={20} /> Descargar Respaldo
            </button>
          </div>
          <div className="bg-white p-4 rounded-xl border border-blue-100">
            <p className="font-bold text-gray-700 mb-1">Restaurar Copia</p>
            <p className="text-xs text-gray-500 mb-3">Recupera tu información subiendo un archivo de respaldo (.json) creado anteriormente.</p>
            <label className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition cursor-pointer shadow-lg shadow-blue-200">
              <Upload size={20} /> Subir Archivo
              <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* 6. ZONA DE PELIGRO */}
      <div className="mt-8 pt-8 border-t border-red-100">
        <h3 className="text-red-600 font-bold text-lg mb-4 flex items-center gap-2"><AlertTriangle /> Zona de Peligro</h3>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div><p className="font-bold text-red-800">Restaurar de Fábrica</p><p className="text-sm text-red-600 mt-1">Borra todo y reinicia la aplicación desde cero.</p></div>
          <button onClick={handleFactoryReset} className="w-full md:w-auto px-6 py-3 bg-white border-2 border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2"><Trash2 size={20} /> Borrar Todo</button>
        </div>
      </div>

    </div>
  );
};