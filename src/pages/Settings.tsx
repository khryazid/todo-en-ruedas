import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Save, RefreshCw, DollarSign, Eye, EyeOff } from 'lucide-react';

export const Settings = () => {
  const { settings, updateSettings } = useStore();

  const [formData, setFormData] = useState({
    tasaBCV: settings.tasaBCV,
    tasaTH: settings.tasaTH,
    defaultMargin: settings.defaultMargin,
    defaultVAT: settings.defaultVAT, // Asegurarnos de que el dato exista
    showMonitorRate: settings.showMonitorRate,
  });

  const [message, setMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (parseFloat(value) || 0)
    }));
  };

  const handleSave = () => {
    updateSettings(formData);
    setMessage('¡Configuración guardada exitosamente!');
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="p-8 space-y-8 ml-64 bg-gray-50 min-h-screen">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Configuración Global</h2>
          <p className="text-gray-500">Define las variables críticas de tu negocio</p>
        </div>
        {message && (
          <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-medium animate-pulse">
            {message}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* TARJETA 1: TASAS DE CAMBIO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <RefreshCw size={20} />
            </div>
            <h3 className="font-bold text-gray-800">Tasas de Cambio</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tasa BCV (Oficial)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">Bs</span>
                <input
                  type="number"
                  name="tasaBCV"
                  value={formData.tasaBCV}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tasa Monitor (Paralelo)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">Bs</span>
                <input
                  type="number"
                  name="tasaTH"
                  value={formData.tasaTH}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: VARIABLES Y PRIVACIDAD */}
        <div className="space-y-6">

          {/* TARJETA 2: MÁRGENES E IMPUESTOS */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                <DollarSign size={20} />
              </div>
              <h3 className="font-bold text-gray-800">Márgenes e Impuestos</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Margen de Ganancia General (%)</label>
                <input
                  type="number"
                  name="defaultMargin"
                  value={formData.defaultMargin}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              {/* AQUÍ ESTÁ EL IVA DE VUELTA 👇 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IVA General (%)</label>
                <input
                  type="number"
                  name="defaultVAT"
                  value={formData.defaultVAT}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* TARJETA 3: PRIVACIDAD */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-100 text-gray-600 rounded-lg">
                {formData.showMonitorRate ? <Eye size={20} /> : <EyeOff size={20} />}
              </div>
              <h3 className="font-bold text-gray-800">Visualización y Privacidad</h3>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Mostrar Referencias al "Dólar Monitor"</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="showMonitorRate"
                  checked={formData.showMonitorRate}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Si desactivas esto, se ocultarán las tasas paralelas y las etiquetas [TH] en todo el sistema.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-lg shadow-red-200"
        >
          <Save size={20} />
          Guardar Cambios
        </button>
      </div>
    </div>
  );
};