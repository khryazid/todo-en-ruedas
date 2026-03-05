import { Fragment, useState } from 'react';
import { formatCurrency } from '../../utils/pricing';

type ExpectedMethodRow = {
  method: string;
  currency: 'USD' | 'BS';
  grossIn: number;
  commissionPct: number;
  commissionCost: number;
  cashOut: number;
  expectedBalance: number;
  periodImpact: number;
};

type MethodMovement = {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  amountUSD: number;
  amountBS?: number;
  currency: 'USD' | 'BS';
  kind: string;
  description: string;
};

type ExpectedByMethodTableProps = {
  expectedByMethod: ExpectedMethodRow[];
  methodsInNegative: ExpectedMethodRow[];
  cutoffLabel: string;
  movementsByMethod: Record<string, MethodMovement[]>;
  onAdjustMethod: (method: string) => void;
};

export const ExpectedByMethodTable = ({
  expectedByMethod,
  methodsInNegative,
  cutoffLabel,
  movementsByMethod,
  onAdjustMethod,
}: ExpectedByMethodTableProps) => {
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
  const [detailFiltersByMethod, setDetailFiltersByMethod] = useState<Record<string, 'ALL' | 'EXPENSES' | 'SALES'>>({});

  const toggleMethod = (method: string) => {
    setExpandedMethod((current) => current === method ? null : method);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-50 flex items-center justify-between">
        <h4 className="font-bold text-gray-800 text-sm">Flujo Esperado por Método de Pago</h4>
        <span className="text-[10px] font-bold text-gray-400 uppercase">Flujo del período · saldo acumulado al {cutoffLabel}</span>
      </div>
      <div className="overflow-x-auto">
        {methodsInNegative.length > 0 && (
          <div className="mx-4 mt-4 mb-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-black text-red-700 uppercase mb-1">Alerta de descuadre</p>
            <p className="text-sm text-red-700">
              Hay {methodsInNegative.length} método{methodsInNegative.length > 1 ? 's' : ''} con saldo esperado negativo:
              {' '}
              <span className="font-bold">
                {methodsInNegative.map((method) => method.method).join(', ')}
              </span>
            </p>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Método</th>
              <th className="px-4 py-3 text-right">Entradas</th>
              <th className="px-4 py-3 text-right">Comisión</th>
              <th className="px-4 py-3 text-right">Salidas</th>
              <th className="px-4 py-3 text-right">Impacto Período</th>
              <th className="px-4 py-3 text-right">Saldo Disponible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expectedByMethod.map((row) => {
              const isExpanded = expandedMethod === row.method;
              const methodMovements = movementsByMethod[row.method] || [];
              const detailFilter = detailFiltersByMethod[row.method] || 'ALL';
              const filteredMethodMovements = methodMovements.filter((movement) => {
                if (detailFilter === 'ALL') return true;
                if (detailFilter === 'EXPENSES') {
                  return movement.kind === 'GASTO_OPERATIVO' || movement.kind === 'ABONO_PROVEEDOR';
                }
                return movement.kind === 'VENTA_COBRADA' || movement.kind === 'ABONO_CLIENTE';
              });
              return (
                <Fragment key={row.method}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleMethod(row.method)}>
                    <td className="px-4 py-3 font-bold text-gray-800">{row.method}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-bold">{formatCurrency(row.grossIn, row.currency)}</td>
                    <td className="px-4 py-3 text-right text-orange-600 font-bold">{formatCurrency(row.commissionCost, row.currency)} <span className="text-[10px] text-gray-400">({row.commissionPct}%)</span></td>
                    <td className="px-4 py-3 text-right text-red-600 font-bold">{formatCurrency(row.cashOut, row.currency)}</td>
                    <td className={`px-4 py-3 text-right font-black ${row.periodImpact >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(row.periodImpact, row.currency)}</td>
                    <td className={`px-4 py-3 text-right font-black ${row.expectedBalance >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{formatCurrency(row.expectedBalance, row.currency)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold uppercase text-gray-500">Historial de {row.method} (hasta corte)</p>
                          <div className="flex items-center gap-2">
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDetailFiltersByMethod((previous) => ({ ...previous, [row.method]: 'ALL' }));
                                }}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${detailFilter === 'ALL' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                Todos
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDetailFiltersByMethod((previous) => ({ ...previous, [row.method]: 'EXPENSES' }));
                                }}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${detailFilter === 'EXPENSES' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                Solo Gastos
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDetailFiltersByMethod((previous) => ({ ...previous, [row.method]: 'SALES' }));
                                }}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${detailFilter === 'SALES' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                Solo Ventas
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onAdjustMethod(row.method);
                              }}
                              className="text-[10px] font-black uppercase px-2 py-1 rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                            >
                              Ajustar en Caja
                            </button>
                          </div>
                        </div>
                        {filteredMethodMovements.length === 0 ? (
                          <p className="text-sm text-gray-400">Sin movimientos para esta vista.</p>
                        ) : (
                          <div className="space-y-2">
                            {filteredMethodMovements.slice(0, 6).map((movement) => (
                              <div key={movement.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-700 truncate">{movement.kind} · {movement.description}</p>
                                  <p className="text-[10px] text-gray-400">{new Date(movement.date).toLocaleString('es-VE')}</p>
                                </div>
                                <p className={`text-xs font-black whitespace-nowrap ${movement.direction === 'IN' ? 'text-green-700' : 'text-red-700'}`}>
                                  {movement.direction === 'IN' ? '+' : '-'}
                                  {formatCurrency(row.currency === 'BS' ? (movement.amountBS ?? 0) : movement.amountUSD, row.currency)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {expectedByMethod.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin movimientos de caja en el período.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
