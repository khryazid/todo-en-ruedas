import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Building2, X, Plus, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({ isOpen, onClose }) => {
  const { createOrganization } = useStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rif, setRif] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    // Auto-generar slug amigable a partir del nombre
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Por favor ingresa el nombre de la empresa.');
      return;
    }
    if (!slug.trim()) {
      toast.error('El identificador (slug) es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createOrganization({
        name: name.trim(),
        slug: slug.trim(),
        rif: rif.trim() || undefined,
        currency,
      });

      if (result) {
        setName('');
        setSlug('');
        setRif('');
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">Nuevo Negocio</h3>
              <p className="text-xs text-gray-400">Registra una nueva empresa o sucursal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Nombre de la Empresa / Negocio <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Repuestos El Ávila"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Identificador Único (Slug) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="ej. repuestos-el-avila"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-white/10 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-red-500 transition"
            />
            <p className="text-[10px] text-gray-500 mt-1">Solo letras minúsculas, números y guiones.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              RIF / Identificación Fiscal
            </label>
            <input
              type="text"
              placeholder="Ej. J-12345678-9"
              value={rif}
              onChange={(e) => setRif(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Moneda Predeterminada de Facturación
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                  currency === 'USD'
                    ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/40'
                    : 'bg-gray-800 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <DollarSign size={14} /> Dólares (USD)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('BS')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                  currency === 'BS'
                    ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/40'
                    : 'bg-gray-800 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                Bs. Bolívares
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-900/30 transition"
            >
              <Plus size={16} />
              {isSubmitting ? 'Creando...' : 'Crear Negocio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
