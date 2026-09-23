import { 
  CheckCircle, MessageCircle, Printer, ShoppingCart, User, X, 
  Loader2, AlertTriangle 
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppSettings, Client, PaymentMethod, Sale } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import type { CheckoutStatus } from '../../hooks/usePOSCheckout';

interface POSCheckoutModalProps {
  isOpen: boolean;
  completedSale: Sale | null;
  isSubmitting?: boolean;
  checkoutStatus?: CheckoutStatus;
  checkoutError?: string | null;
  clients: Client[];
  selectedClient: Client | null;
  onSelectClientById: (clientId: string) => void;
  settings: AppSettings;
  totalUSD: number;
  totalBs: number;
  discountPct: number;
  setDiscountPct: Dispatch<SetStateAction<number>>;
  discountAmount: number;
  currentClientDebt: number;
  isCreditSale: boolean;
  setIsCreditSale: Dispatch<SetStateAction<boolean>>;
  initialPayment: string;
  setInitialPayment: Dispatch<SetStateAction<string>>;
  paymentMethods: PaymentMethod[];
  selectedPaymentMethod: string;
  setSelectedPaymentMethod: Dispatch<SetStateAction<string>>;
  onCloseCheckout: () => void;
  onCheckout: () => void;
  onNewSale: () => void;
  onSendWhatsApp: () => void;
  onPrint: () => void;
}

export function POSCheckoutModal({
  isOpen,
  completedSale,
  isSubmitting = false,
  checkoutStatus = 'idle',
  checkoutError = null,
  clients,
  selectedClient,
  onSelectClientById,
  settings,
  totalUSD,
  totalBs,
  discountPct,
  setDiscountPct,
  discountAmount,
  currentClientDebt,
  isCreditSale,
  setIsCreditSale,
  initialPayment,
  setInitialPayment,
  paymentMethods,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  onCloseCheckout,
  onCheckout,
  onNewSale,
  onSendWhatsApp,
  onPrint,
}: POSCheckoutModalProps) {
  const effectiveSubmitting = isSubmitting || checkoutStatus === 'submitting' || checkoutStatus === 'validating';

  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  // ✅ AUDIT FIX #8: Inicialización lazy — evita useEffect con setState síncrono.
  // El componente recibe un `key` desde el padre (isOpen + selectedClient?.id)
  // que fuerza remount limpio cuando cambia el cliente o se abre/cierra el modal.
  const [clientQuery, setClientQuery] = useState(
    () => (selectedClient ? `${selectedClient.name} - ${selectedClient.rif}` : '')
  );
  const [showClientOptions, setShowClientOptions] = useState(false);
  const clientAutocompleteRef = useRef<HTMLDivElement | null>(null);

  // 1. FOCUS TRAP ACCESIBLE & ATAJOS DE TECLADO
  useEffect(() => {
    if (!isOpen && !completedSale) return;

    // Foco automático en el botón primario de acción
    const timer = setTimeout(() => {
      primaryButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Salir o nueva venta (solo si no está despachando en red)
      if (e.key === 'Escape' && !effectiveSubmitting) {
        e.preventDefault();
        if (completedSale) {
          onNewSale();
        } else {
          onCloseCheckout();
        }
        return;
      }

      // Enter o Ctrl+Enter: Confirmación rápida
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !effectiveSubmitting && !completedSale) {
        e.preventDefault();
        onCheckout();
        return;
      }

      // Focus Trap Loop: Confinar Tab dentro del modal
      if (e.key === 'Tab' && modalContainerRef.current) {
        const focusable = modalContainerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, completedSale, effectiveSubmitting, onCloseCheckout, onNewSale, onCheckout]);

  // Click-outside para el autocompletado de clientes
  useEffect(() => {
    if (!showClientOptions) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (clientAutocompleteRef.current && !clientAutocompleteRef.current.contains(target)) {
        setShowClientOptions(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showClientOptions]);

  const completedMethodCurrency = completedSale
    ? paymentMethods.find((method) => method.name === completedSale.paymentMethod)?.currency
    : undefined;

  const selectedMethodCurrency = paymentMethods.find((method) => method.name === selectedPaymentMethod)?.currency || 'USD';

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim().toLowerCase();
    if (!term) return clients.slice(0, 8);
    return clients
      .filter((client) =>
        client.name.toLowerCase().includes(term) ||
        client.rif.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [clients, clientQuery]);

  if (!isOpen && !completedSale) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in"
      onClick={(e) => {
        // Cierre con clic en el backdrop solo si no está procesando en red
        if (e.target === e.currentTarget && !effectiveSubmitting && !completedSale) {
          onCloseCheckout();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-modal-title"
    >
      <div 
        ref={modalContainerRef}
        className="bg-white w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300 max-h-[92vh] overflow-y-auto"
      >
        {/* PANTALLA: SUCCESS */}
        {completedSale ? (
          <div className="text-center">
            <CheckCircle className="text-green-500 mx-auto mb-4 animate-bounce" size={64} />
            <h3 id="pos-modal-title" className="text-2xl font-black text-gray-800 mb-2">¡Venta Exitosa!</h3>
            <p className="text-gray-500 mb-6">
              La venta <span className="font-mono font-bold text-gray-900">#{completedSale.localId || completedSale.id.slice(-6)}</span> ha sido registrada correctamente.
            </p>

            <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100 shadow-inner">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500 font-bold uppercase text-xs">Total Pagado</span>
                <span className="text-3xl font-black text-gray-900">{formatCurrency(completedSale.paidAmountUSD, 'USD')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">
                  {completedMethodCurrency === 'BS' ? 'Ref. Bs' : completedMethodCurrency === 'COP' ? 'Ref. COP' : 'Moneda'}
                </span>
                <span className="font-bold text-blue-600">
                  {completedMethodCurrency === 'BS'
                    ? `Bs. ${((completedSale.paidAmountUSD || 0) * settings.tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                    : completedMethodCurrency === 'COP'
                      ? `$ ${Math.round((completedSale.paidAmountUSD || 0) * settings.tasaCOP).toLocaleString('es-CO')} COP`
                      : 'USD'}
                </span>
              </div>
              {(completedSale.totalUSD - completedSale.paidAmountUSD) > 0.01 && (
                <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-gray-200">
                  <span className="text-red-500 font-bold">Deuda Pendiente</span>
                  <span className="font-bold text-red-600">{formatCurrency(completedSale.totalUSD - completedSale.paidAmountUSD, 'USD')}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                ref={primaryButtonRef}
                onClick={onPrint}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition active:scale-95 shadow-md"
              >
                <Printer size={20} /> IMPRIMIR RECIBO (Enter)
              </button>
              <button
                onClick={onSendWhatsApp}
                disabled={!selectedClient || !selectedClient.phone}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={(!selectedClient || !selectedClient.phone) ? 'El cliente debe tener un teléfono registrado' : 'Enviar por WhatsApp'}
              >
                <MessageCircle size={20} /> ENVIAR RECIBO POR WHATSAPP
              </button>
              <button
                onClick={onNewSale}
                className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
              >
                PROCESAR NUEVA VENTA (Esc)
              </button>
            </div>
          </div>
        ) : (
          /* PANTALLA: CHECKOUT ACTIVO */
          <>
            <div className="flex items-center justify-between pb-2 mb-4 border-b border-gray-100">
              <h2 id="pos-modal-title" className="text-2xl font-black text-gray-800 flex items-center gap-2">
                <ShoppingCart className="text-blue-600" /> Cobro
              </h2>
              <button 
                onClick={onCloseCheckout} 
                disabled={effectiveSubmitting}
                aria-label="Cerrar modal"
                className="text-gray-400 hover:bg-gray-100 p-2 rounded-full transition disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            {/* BANNER DE ERROR REACTIVO: Mantiene el modal abierto para reintentar */}
            {checkoutError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-left text-xs text-red-700 animate-in fade-in">
                <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Error al procesar la venta:</p>
                  <p className="mt-0.5 leading-relaxed">{checkoutError}</p>
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Cliente (Opcional)</p>
              <div className="relative" ref={clientAutocompleteRef}>
                <input
                  type="text"
                  disabled={effectiveSubmitting}
                  value={clientQuery}
                  onFocus={() => setShowClientOptions(true)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setClientQuery(value);
                    setShowClientOptions(true);

                    if (!value.trim()) {
                      onSelectClientById('');
                    }
                  }}
                  placeholder="Buscar por nombre o RIF..."
                  className="w-full p-3 rounded-xl border-2 border-gray-100 bg-white font-bold text-sm text-gray-700 focus:outline-none focus:border-blue-300 disabled:bg-gray-100 disabled:text-gray-400"
                />
                {showClientOptions && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                    <button
                      onClick={() => {
                        onSelectClientById('');
                        setClientQuery('');
                        setShowClientOptions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                    >
                      Sin cliente
                    </button>
                    {filteredClients.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No hay coincidencias</p>
                    ) : (
                      filteredClients.map((client) => (
                        <button
                          key={client.id}
                          onClick={() => {
                            onSelectClientById(client.id);
                            setClientQuery(`${client.name} - ${client.rif}`);
                            setShowClientOptions(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        >
                          <p className="font-bold text-gray-800">{client.name}</p>
                          <p className="text-[11px] text-gray-400">{client.rif}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Descuento (%)</p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={effectiveSubmitting} 
                  onClick={() => setDiscountPct((d) => Math.max(0, d - 5))} 
                  className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 font-black disabled:opacity-40"
                >
                  -
                </button>
                <input
                  type="number"
                  disabled={effectiveSubmitting}
                  min="0"
                  max="100"
                  step="1"
                  inputMode="numeric"
                  value={discountPct || ''}
                  onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                  placeholder="0"
                  className="flex-1 text-center font-black text-lg border-b-2 border-gray-200 outline-none focus:border-blue-500 py-1 bg-transparent disabled:opacity-40"
                />
                <button 
                  disabled={effectiveSubmitting} 
                  onClick={() => setDiscountPct((d) => Math.min(100, d + 5))} 
                  className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 font-black disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1 mt-2 md:hidden">
                {[0, 5, 10, 15].map((value) => (
                  <button
                    key={value}
                    disabled={effectiveSubmitting}
                    onClick={() => setDiscountPct(value)}
                    className={`py-1.5 rounded-lg text-[11px] font-black transition disabled:opacity-40 ${discountPct === value ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              {discountPct > 0 && (
                <p className="text-xs font-black text-red-500 mt-1 text-right">Descuento aplicado: {formatCurrency(discountAmount, 'USD')}</p>
              )}
            </div>

            {selectedClient && (
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-200 text-blue-700 p-2 rounded-full"><User size={20} /></div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-blue-400">Cliente Asignado</p>
                    <p className="font-bold text-blue-900 text-sm">{selectedClient.name}</p>
                  </div>
                </div>
                {(selectedClient.creditLimit ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-xs mt-1 pt-2 border-t border-blue-200/50">
                    <span className="text-blue-700 font-medium">Límite: <span className="font-bold">{formatCurrency(selectedClient.creditLimit ?? 0, 'USD')}</span></span>
                    <span className={`font-bold ${currentClientDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>Deuda: {formatCurrency(currentClientDebt, 'USD')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100 shadow-inner">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500 font-bold uppercase text-xs">Total Venta</span>
                <span className="text-3xl font-black text-gray-900">{formatCurrency(totalUSD, 'USD')}</span>
              </div>
              {selectedMethodCurrency === 'BS' ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Ref. Bs</span>
                  <span className="font-bold text-blue-600">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                </div>
              ) : selectedMethodCurrency === 'COP' ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Ref. COP</span>
                  <span className="font-bold text-[#FFB300]">$ {Math.round(totalUSD * settings.tasaCOP).toLocaleString('es-CO')} COP</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Moneda</span>
                  <span className="font-bold text-blue-600">USD</span>
                </div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              <label className="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer hover:bg-gray-50 transition border-gray-100">
                <input 
                  type="checkbox" 
                  disabled={effectiveSubmitting}
                  checked={isCreditSale} 
                  onChange={(e) => setIsCreditSale(e.target.checked)} 
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" 
                />
                <span className="font-bold text-gray-700">Venta a Crédito / Fiado</span>
              </label>

              {isCreditSale && (
                <div className="pl-8 animate-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Abono Inicial (Dejar en 0 si no paga nada)</label>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold text-gray-400">$</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      disabled={effectiveSubmitting}
                      inputMode="decimal" 
                      className="w-full border-b-2 border-gray-200 outline-none focus:border-blue-500 font-bold text-lg py-1 bg-transparent disabled:opacity-40" 
                      placeholder="0.00" 
                      value={initialPayment} 
                      onChange={e => setInitialPayment(e.target.value)} 
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-1 mt-2 md:hidden">
                    {[0, 10, 20, 50].map((amount) => (
                      <button
                        key={amount}
                        disabled={effectiveSubmitting}
                        onClick={() => setInitialPayment(String(amount))}
                        className="py-1.5 rounded-lg bg-gray-100 text-gray-700 text-[11px] font-black disabled:opacity-40"
                      >
                        ${amount}
                      </button>
                    ))}
                    <button
                      disabled={effectiveSubmitting}
                      onClick={() => setInitialPayment(String(totalUSD.toFixed(2)))}
                      className="py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-black disabled:opacity-40"
                    >
                      Total
                    </button>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-xs font-bold text-red-500">Resta por Cobrar: {formatCurrency(Math.max(0, totalUSD - (parseFloat(initialPayment) || 0)), 'USD')}</span>
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Método de Pago {isCreditSale && '(del Abono)'}</p>
            <div className="space-y-2 mb-6 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
              {paymentMethods.map(method => (
                <button 
                  key={method.id} 
                  disabled={effectiveSubmitting}
                  onClick={() => setSelectedPaymentMethod(method.name)} 
                  className={`w-full p-3 rounded-xl border-2 flex items-center justify-between transition-all disabled:opacity-40 ${selectedPaymentMethod === method.name ? 'border-red-500 bg-red-50' : 'border-gray-100 bg-white hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-3"><span className={`font-bold text-sm ${selectedPaymentMethod === method.name ? 'text-red-900' : 'text-gray-700'}`}>{method.name}</span></div>
                  {selectedPaymentMethod === method.name && <CheckCircle size={18} className="text-red-600" />}
                </button>
              ))}
            </div>

            {/* BOTÓN PRIMARIO DE COBRO CON PROTECCIÓN MULTI-CLICK Y SPINNER */}
            <button 
              ref={primaryButtonRef}
              type="button"
              disabled={effectiveSubmitting} 
              onClick={onCheckout} 
              className={`w-full py-4 text-white font-bold rounded-xl text-lg shadow-xl transition-all flex items-center justify-center gap-2 ${
                effectiveSubmitting
                  ? 'bg-gray-400 cursor-not-allowed opacity-90'
                  : isCreditSale 
                    ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-200 active:scale-95' 
                    : 'bg-green-600 hover:bg-green-700 shadow-green-200 active:scale-95'
              }`}
            >
              {effectiveSubmitting ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  <span>Procesando Venta...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={24} />
                  <span>{isCreditSale ? 'REGISTRAR DEUDA' : 'CONFIRMAR VENTA'} (Ctrl+Enter)</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
