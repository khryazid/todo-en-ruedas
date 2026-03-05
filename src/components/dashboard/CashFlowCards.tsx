import { formatCurrency } from '../../utils/pricing';

type CashFlowCardsProps = {
  cashInPeriod: number;
  cashOutPeriod: number;
  netCashFlowPeriod: number;
};

export const CashFlowCards = ({
  cashInPeriod,
  cashOutPeriod,
  netCashFlowPeriod,
}: CashFlowCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm">
        <p className="text-xs text-green-600 uppercase font-bold mb-1">Flujo Caja Entradas</p>
        <h3 className="text-2xl font-black text-green-700">{formatCurrency(cashInPeriod, 'USD')}</h3>
        <p className="text-xs text-gray-400 mt-1">Cobros registrados en ledger</p>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
        <p className="text-xs text-red-600 uppercase font-bold mb-1">Flujo Caja Salidas</p>
        <h3 className="text-2xl font-black text-red-700">{formatCurrency(cashOutPeriod, 'USD')}</h3>
        <p className="text-xs text-gray-400 mt-1">Pagos y egresos registrados</p>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Flujo Neto</p>
        <h3 className={`text-2xl font-black ${netCashFlowPeriod >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{formatCurrency(netCashFlowPeriod, 'USD')}</h3>
        <p className="text-xs text-gray-400 mt-1">Entradas - Salidas del período</p>
      </div>
    </div>
  );
};
