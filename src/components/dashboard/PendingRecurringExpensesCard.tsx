import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/pricing';

type PendingRecurringExpense = {
  id: string;
  description: string;
  category: string;
  paymentMethod: string;
  dayOfMonth?: number;
  amountUSD: number;
};

type DueStatus = {
  label: string;
  chipClass: string;
  rowClass: string;
};

type PendingRecurringExpensesCardProps = {
  pendingRecurringExpenses: PendingRecurringExpense[];
  currentMonthLabel: string;
  recurringDueStatus: (dayOfMonth?: number) => DueStatus;
};

export const PendingRecurringExpensesCard = ({
  pendingRecurringExpenses,
  currentMonthLabel,
  recurringDueStatus,
}: PendingRecurringExpensesCardProps) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-100 text-orange-700 rounded-lg"><CalendarClock size={16} /></div>
          <h4 className="font-bold text-gray-800 text-sm">Gastos Recurrentes Pendientes ({pendingRecurringExpenses.length})</h4>
        </div>
        <Link to="/expenses" className="text-[10px] font-bold text-blue-600 hover:underline">Gestionar</Link>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-gray-500 mb-3">
          Pendientes de {currentMonthLabel}. Si se paga en este mes, desaparece de esta lista.
        </p>
        {pendingRecurringExpenses.length === 0 ? (
          <p className="text-sm text-gray-500">No hay recurrentes pendientes este mes.</p>
        ) : (
          <div className="space-y-2">
            {pendingRecurringExpenses.map((expense) => {
              const dueStatus = recurringDueStatus(expense.dayOfMonth);
              return (
                <div key={expense.id} className={`flex items-center justify-between p-3 border rounded-xl ${dueStatus.rowClass}`}>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{expense.description}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                      <span>{expense.category} · {expense.paymentMethod}{expense.dayOfMonth ? ` · Día ${expense.dayOfMonth}` : ''}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${dueStatus.chipClass}`}>{dueStatus.label}</span>
                    </p>
                  </div>
                  <p className="text-sm font-black text-orange-700">{formatCurrency(expense.amountUSD, 'USD')}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
