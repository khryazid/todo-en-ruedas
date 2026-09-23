/**
 * @file usePOSCheckout.ts
 * @description Máquina de estados exhaustiva y guardas de concurrencia para el cobro en Punto de Venta (POS).
 *
 * Características:
 * - Estados finitos: 'idle' | 'validating' | 'submitting' | 'success' | 'error'
 * - Cerrojo síncrono (isLockedRef) a nivel de microtask para prevenir doble cobro por doble clic.
 * - Generación de token de idempotencia por intento de cobro.
 * - Manejo resiliente de errores sin cerrar el modal ni destruir datos ingresados.
 */

import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { Client, Sale } from '../types';

export type CheckoutStatus = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

interface UsePOSCheckoutParams {
  totalUSD: number;
  selectedClient: Client | null;
  isCreditSale: boolean;
  initialPayment: string;
  applyCredit: boolean;
  effectivePaymentMethod: string;
  currentClientDebt: number;
  discountPct?: number;
  completeSale: (paymentMethod: string, clientId?: string, initialPayment?: number, idempotencyKey?: string, discountPct?: number) => Promise<Sale | null>;
  applyClientCredit: (clientId: string, amount: number) => Promise<void>;
  onSuccess: (sale: Sale) => void;
}

export function usePOSCheckout({
  totalUSD,
  selectedClient,
  isCreditSale,
  initialPayment,
  applyCredit,
  effectivePaymentMethod,
  currentClientDebt,
  discountPct = 0,
  completeSale,
  applyClientCredit,
  onSuccess,
}: UsePOSCheckoutParams) {
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 🔒 CERROJO SÍNCRONO: Intercepta clics repetidos en el mismo ciclo de eventos
  const isLockedRef = useRef(false);

  const resetCheckoutState = useCallback(() => {
    isLockedRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const executeCheckout = useCallback(async () => {
    // 1. Verificación síncrona inmediata contra multi-clic
    if (isLockedRef.current || status === 'submitting') {
      return;
    }
    isLockedRef.current = true;
    setStatus('validating');
    setErrorMessage(null);

    // 2. Validaciones de Negocio
    if (isCreditSale && !selectedClient) {
      isLockedRef.current = false;
      setStatus('error');
      setErrorMessage('Para vender a crédito o fiado es obligatorio asignar un cliente registrado.');
      toast.error('⚠️ Selecciona un cliente registrado.');
      return;
    }

    if (isCreditSale && selectedClient) {
      const limit = selectedClient.creditLimit ?? 0;
      const abono = parseFloat(initialPayment) || 0;
      const newDebt = totalUSD - abono;
      if (currentClientDebt + newDebt > limit) {
        isLockedRef.current = false;
        setStatus('error');
        setErrorMessage(
          `Límite de crédito excedido. Deuda actual: $${currentClientDebt.toFixed(2)} | Nueva deuda: $${newDebt.toFixed(2)} | Límite: $${limit.toFixed(2)}`
        );
        return;
      }
    }

    const creditUsed = (applyCredit && selectedClient && (selectedClient.creditBalance ?? 0) > 0)
      ? Math.min(selectedClient.creditBalance!, totalUSD)
      : 0;
    const effectiveTotal = Math.max(0, totalUSD - creditUsed);

    let paymentAmount = effectiveTotal;
    if (isCreditSale) {
      const abono = parseFloat(initialPayment) || 0;
      if (abono > effectiveTotal) {
        isLockedRef.current = false;
        setStatus('error');
        setErrorMessage('El abono inicial no puede ser superior al total a pagar.');
        return;
      }
      paymentAmount = abono;
    }

    // 3. Generación de Token de Idempotencia del lado del cliente
    const idempotencyToken = `pos-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`;

    setStatus('submitting');

    let isSuccess = false;
    try {
      const sale = await completeSale(effectivePaymentMethod, selectedClient?.id, paymentAmount, idempotencyToken, discountPct);

      if (sale) {
        if (creditUsed > 0 && selectedClient) {
          await applyClientCredit(selectedClient.id, -creditUsed);
        }
        isSuccess = true;
        setStatus('success');
        onSuccess(sale);
      } else {
        // En caso de que completeSale devuelva null (ej. stock insuficiente detectado en backend)
        setStatus('error');
        setErrorMessage('No se pudo procesar la venta. Verifique la existencia de stock o la conexión.');
        isLockedRef.current = false;
      }
    } catch (err: unknown) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Error de comunicación con el servidor.';
      setErrorMessage(msg);
      toast.error(`Error al cobrar: ${msg}`);
      isLockedRef.current = false;
    } finally {
      // Liberar el cerrojo si no culminó en éxito
      if (!isSuccess) {
        isLockedRef.current = false;
      }
    }
  }, [
    status,
    isCreditSale,
    selectedClient,
    initialPayment,
    totalUSD,
    currentClientDebt,
    applyCredit,
    completeSale,
    effectivePaymentMethod,
    discountPct,
    applyClientCredit,
    onSuccess,
  ]);

  return {
    status,
    errorMessage,
    isSubmitting: status === 'submitting' || status === 'validating',
    executeCheckout,
    resetCheckoutState,
  };
}
