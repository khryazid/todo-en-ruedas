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

const templateKeyFromExpense = (expense: Expense) => {
  if (expense.recurringId) return `id:${expense.recurringId}`;
  const desc = normalizeText(expense.description);
  const category = normalizeText(expense.category);
  const method = normalizeText(expense.paymentMethod);
  const currency = normalizeText(expense.currency || 'USD');
  return `legacy:${desc}|${category}|${method}|${currency}`;
};

export const deriveRecurringTemplatesFromExpenses = (expenses: Expense[]): RecurringExpense[] => {
  const recurringExpenses = expenses
    .filter((expense) => Boolean(expense.isRecurring))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const map = new Map<string, RecurringExpense>();

  recurringExpenses.forEach((expense) => {
    const key = templateKeyFromExpense(expense);
    if (map.has(key)) return;

    const expenseDate = new Date(expense.date);
    const dayOfMonth = Number.isNaN(expenseDate.getTime()) ? undefined : expenseDate.getDate();

    map.set(key, {
      id: expense.recurringId || key,
      description: expense.description,
      category: expense.category,
      amountUSD: expense.amountUSD,
      amountBS: expense.amountBS,
      currency: expense.currency || 'USD',
      paymentMethod: expense.paymentMethod,
      dayOfMonth,
      active: true,
    });
  });

  return Array.from(map.values());
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
