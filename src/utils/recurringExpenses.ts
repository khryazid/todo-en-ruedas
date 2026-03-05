import type { Expense, RecurringExpense } from '../types';

export const RECURRING_KEY = 'recurring-expenses-v1';

export const loadRecurringTemplates = (): RecurringExpense[] => {
  try {
    const raw = localStorage.getItem(RECURRING_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveRecurringTemplates = (list: RecurringExpense[]) => {
  localStorage.setItem(RECURRING_KEY, JSON.stringify(list));
};

const sameMonth = (dateText: string, reference: Date) => {
  const date = new Date(dateText);
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
};

const normalizeText = (value: string | undefined) => (value || '').trim().toLowerCase();

export const getPendingRecurringForMonth = (
  templates: RecurringExpense[],
  expenses: Expense[],
  referenceDate = new Date(),
) => {
  return templates
    .filter((template) => template.active)
    .filter((template) => {
      const paidThisMonth = expenses.some((expense) => {
        if (!sameMonth(expense.date, referenceDate)) return false;

        if (expense.recurringId && expense.recurringId === template.id) {
          return true;
        }

        return Boolean(expense.isRecurring)
          && normalizeText(expense.category) === normalizeText(template.category)
          && normalizeText(expense.description) === normalizeText(template.description);
      });

      return !paidThisMonth;
    });
};
