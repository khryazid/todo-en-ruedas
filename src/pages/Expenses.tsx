/**
 * @file pages/Expenses.tsx
 * @description Módulo de Gastos mejorado.
 *   - Moneda: USD o Bs (con conversión automática usando tasaBCV)
 *   - Categorías: predefinidas + texto libre personalizado
 *   - Gastos Recurrentes: plantillas que se pueden registrar con 1 click
 *   - Autor: muestra quién registró el gasto
 */

import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/pricing';
import {
    TrendingDown, Plus, Edit, Trash2, X, Save,
    Download, CalendarClock, RefreshCw, User, ChevronDown
} from 'lucide-react';
import type { Expense, RecurringExpense, ExpenseCurrency } from '../types';
import { DEFAULT_EXPENSE_CATEGORIES } from '../types';
import toast from 'react-hot-toast';
import { deriveRecurringTemplatesFromExpenses, loadRecurringTemplates, saveRecurringTemplates } from '../utils/recurringExpenses';
import { supabase } from '../supabase/client';

// ─── helpers ─────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'all';

const isoToday = () => new Date().toISOString().split('T')[0];

const filterByPeriod = (expenses: Expense[], period: Period): Expense[] => {
    if (period === 'all') return expenses;
    const now = new Date();
    return expenses.filter(e => {
        const d = new Date(e.date);
        if (period === 'today') return e.date === isoToday();
        if (period === 'week') {
            const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
            return d >= start;
        }
        if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
    });
};

// ─── Componente ──────────────────────────────────────────────────────────────
export const Expenses = () => {
    const { expenses, addExpense, updateExpense, deleteExpense, settings, currentUserData, paymentMethods } = useStore();
    const defaultPaymentMethod = paymentMethods[0]?.name || 'Efectivo USD';

    // Filtros
    const [period, setPeriod] = useState<Period>('month');
    const [filterCat, setFilterCat] = useState<string>('ALL');
    const [selectedSellerTerm, setSelectedSellerTerm] = useState<string>('ALL');

    // Modal de agregar/editar
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Tab principal
    const [activeTab, setActiveTab] = useState<'expenses' | 'recurring'>('expenses');

    // Gastos recurrentes (localStorage)
    const [recurring, setRecurring] = useState<RecurringExpense[]>(loadRecurringTemplates);
    const [recurringModal, setRecurringModal] = useState(false);
    const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);

    // Form state
    const emptyForm = {
        date: isoToday(),
        description: '',
        currency: 'USD' as ExpenseCurrency,
        amount: '',
        rateUsed: String(settings.tasaBCV || 1),
        category: 'Otro' as string,
        customCategory: '',
        paymentMethod: defaultPaymentMethod,
        isRecurring: false,
    };
    const [form, setForm] = useState(emptyForm);

    // Form recurrente
    const emptyRec: Omit<RecurringExpense, 'id'> = {
        description: '',
        category: 'Otro',
        amountUSD: 0, currency: 'USD', paymentMethod: defaultPaymentMethod, dayOfMonth: 1, active: true
    };
    const [recForm, setRecForm] = useState<Omit<RecurringExpense, 'id'>>(emptyRec);
    const [recAmount, setRecAmount] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchRecurringFromSupabase = async () => {
            const { data, error } = await supabase
                .from('recurring_expenses')
                .select('*')
                .order('created_at', { ascending: false });

            if (cancelled) return;

            if (error) {
                const message = (error as { message?: string })?.message || '';
                const relationMissing = message.toLowerCase().includes('relation') || message.toLowerCase().includes('does not exist');
                if (!relationMissing) {
                    console.warn('⚠️ No se pudieron cargar plantillas recurrentes desde Supabase:', message);
                }
                return;
            }

            const mapped = (data || []).map((row) => ({
                id: row.id as string,
                description: row.description as string,
                category: (row.category as string) || 'Otro',
                amountUSD: Number(row.amount_usd) || 0,
                amountBS: row.amount_bs ? Number(row.amount_bs) : undefined,
                currency: (row.currency as ExpenseCurrency) || 'USD',
                paymentMethod: (row.payment_method as string) || defaultPaymentMethod,
                dayOfMonth: row.day_of_month ? Number(row.day_of_month) : undefined,
                active: row.is_active !== false,
            } satisfies RecurringExpense));

            if (mapped.length === 0) return;

            setRecurring(mapped);
            saveRecurringTemplates(mapped);
        };

        fetchRecurringFromSupabase();

        return () => {
            cancelled = true;
        };
    }, [defaultPaymentMethod]);

    useEffect(() => {
        if (recurring.length > 0) return;

        const recovered = deriveRecurringTemplatesFromExpenses(expenses);
        if (recovered.length === 0) return;

        setRecurring(recovered);
        saveRecurringTemplates(recovered);
    }, [expenses, recurring.length]);

    const rate = settings.tasaBCV || 1;
    const selectedExpenseMethod = useMemo(
        () => paymentMethods.find(pm => pm.name === form.paymentMethod),
        [paymentMethods, form.paymentMethod]
    );
    const isBSMethod = selectedExpenseMethod?.currency === 'BS';

    // ─── Datos filtrados ───────────────────────────────────────────────────────
    const periodExpenses = useMemo(() => filterByPeriod(expenses, period), [expenses, period]);
    const displayed = useMemo(() => {
        let filtered = filterCat === 'ALL' ? periodExpenses : periodExpenses.filter(e => e.category === filterCat);
        if (selectedSellerTerm !== 'ALL') {
            filtered = filtered.filter(e => (e.sellerName || 'Sistema') === selectedSellerTerm);
        }
        return filtered;
    }, [periodExpenses, filterCat, selectedSellerTerm]);

    const totalUSD = useMemo(() => displayed.reduce((a, e) => a + e.amountUSD, 0), [displayed]);

    const allCategories = useMemo(() => {
        const cats = new Set(expenses.map(e => e.category));
        return ['ALL', ...DEFAULT_EXPENSE_CATEGORIES.filter(c => cats.has(c) || true)];
    }, [expenses]);

    // Lista única de vendedores para el filtro
    const allSellers = useMemo(() => {
        const sellers = new Set(expenses.map(e => e.sellerName || 'Sistema').filter(Boolean));
        return Array.from(sellers);
    }, [expenses]);

    // ─── Handlers de form ──────────────────────────────────────────────────────
    const openNew = (prefill?: Partial<typeof emptyForm>) => {
        setForm({ ...emptyForm, paymentMethod: defaultPaymentMethod, rateUsed: String(settings.tasaBCV || 1), ...prefill });
        setEditingId(null);
        setIsModalOpen(true);
    };

    const openEdit = (e: Expense) => {
        setForm({
            date: e.date,
            description: e.description,
            currency: e.currency || 'USD',
            amount: e.currency === 'BS' ? String(e.amountBS || e.amountUSD * rate) : String(e.amountUSD),
            rateUsed: String(e.fxRateUsed || settings.tasaBCV || 1),
            category: DEFAULT_EXPENSE_CATEGORIES.includes(e.category as never) ? e.category : 'custom',
            customCategory: DEFAULT_EXPENSE_CATEGORIES.includes(e.category as never) ? '' : e.category,
            paymentMethod: e.paymentMethod,
            isRecurring: e.isRecurring || false,
        });
        setEditingId(e.id);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        const rawAmount = parseFloat(form.amount || '0');
        const fxRateUsed = Math.max(0.0001, parseFloat(form.rateUsed || String(settings.tasaBCV || 1)) || (settings.tasaBCV || 1));
        if (!form.description.trim()) return toast.error('Ingresa una descripción');
        if (rawAmount <= 0) return toast.error('El monto debe ser mayor a 0');

        const finalCategory = form.category === 'custom' ? form.customCategory.trim() || 'Otro' : form.category;
        const amountUSD = form.currency === 'BS' ? rawAmount / fxRateUsed : rawAmount;
        const amountBS = form.currency === 'BS'
            ? rawAmount
            : isBSMethod
                ? (rawAmount * fxRateUsed)
                : undefined;
        const fxSource = isBSMethod
            ? (Math.abs(fxRateUsed - (settings.tasaBCV || 0)) < 0.0001 ? 'BCV' : 'MANUAL')
            : undefined;

        const payload: Omit<Expense, 'id'> = {
            date: form.date,
            description: form.description.trim(),
            amountUSD: Math.round(amountUSD * 100) / 100,
            amountBS: amountBS !== undefined ? Math.round(amountBS * 100) / 100 : undefined,
            currency: form.currency,
            category: finalCategory,
            paymentMethod: form.paymentMethod,
            fxRateUsed: fxSource ? fxRateUsed : undefined,
            fxSource,
            userId: currentUserData?.id,
            sellerName: currentUserData?.fullName,
            isRecurring: form.isRecurring,
        };

        if (editingId) {
            await updateExpense(editingId, payload);
        } else {
            await addExpense(payload);
        }
        setIsModalOpen(false);
        setForm(emptyForm);
    };

    // ─── Handlers recurrentes ──────────────────────────────────────────────────
    const saveRecurringItem = () => {
        const persistRecurringItem = async () => {
        const amt = parseFloat(recAmount || '0');
        if (!recForm.description.trim() || amt <= 0) return toast.error('Completa descripción y monto');
        const amountUSD = recForm.currency === 'BS' ? amt / rate : amt;
        const item: RecurringExpense = {
            ...recForm,
            id: editingRecurring?.id || crypto.randomUUID(),
            amountUSD: Math.round(amountUSD * 100) / 100,
            amountBS: recForm.currency === 'BS' ? amt : undefined,
        };
        const updated = editingRecurring
            ? recurring.map(r => r.id === editingRecurring.id ? item : r)
            : [...recurring, item];

        const { error } = await supabase
            .from('recurring_expenses')
            .upsert({
                id: item.id,
                description: item.description,
                category: item.category,
                amount_usd: item.amountUSD,
                amount_bs: item.amountBS || null,
                currency: item.currency,
                payment_method: item.paymentMethod,
                day_of_month: item.dayOfMonth || null,
                is_active: item.active,
                created_by: currentUserData?.id || null,
            }, { onConflict: 'id' });

        if (error) {
            const message = (error as { message?: string })?.message || '';
            toast.error(`No se pudo guardar en Supabase: ${message || 'Error desconocido'}`);
            return;
        }

        setRecurring(updated);
        saveRecurringTemplates(updated);
        setRecurringModal(false);
        setEditingRecurring(null);
        setRecForm({ ...emptyRec, paymentMethod: defaultPaymentMethod });
        setRecAmount('');
        toast.success(editingRecurring ? 'Plantilla actualizada' : 'Plantilla creada');
        };

        void persistRecurringItem();
    };

    const deleteRecurring = (id: string) => {
        const removeRecurringItem = async () => {
            if (!confirm('¿Eliminar esta plantilla?')) return;

            const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
            if (error) {
                const message = (error as { message?: string })?.message || '';
                toast.error(`No se pudo eliminar en Supabase: ${message || 'Error desconocido'}`);
                return;
            }

            const updated = recurring.filter(r => r.id !== id);
            setRecurring(updated);
            saveRecurringTemplates(updated);
            toast.success('Plantilla eliminada');
        };

        void removeRecurringItem();
    };

    const registerRecurring = async (rec: RecurringExpense) => {
        await addExpense({
            date: isoToday(),
            description: rec.description,
            amountUSD: rec.amountUSD,
            amountBS: rec.amountBS,
            currency: rec.currency,
            category: rec.category,
            paymentMethod: rec.paymentMethod,
            userId: currentUserData?.id,
            sellerName: currentUserData?.fullName,
            isRecurring: true,
            recurringId: rec.id,
        });
    };

    const exportCSV = () => {
        const headers = ['Fecha', 'Descripción', 'Categoría', 'Moneda', 'Monto', 'Monto USD', 'Método Pago', 'Registrado por'];
        const rows = displayed.map(e => [
            e.date, e.description, e.category,
            e.currency || 'USD',
            e.currency === 'BS' ? (e.amountBS ?? e.amountUSD * rate).toFixed(2) : e.amountUSD.toFixed(2),
            e.amountUSD.toFixed(2),
            e.paymentMethod, e.sellerName || ''
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `gastos-${period}.csv`; a.click();
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="p-4 md:p-8 space-y-6 bg-gray-50 min-h-screen animate-in fade-in duration-300">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                        <TrendingDown className="text-red-500" size={28} />
                        Gastos y Egresos
                    </h2>
                    <p className="text-gray-500 font-medium">Control de gastos operativos</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 text-sm transition">
                        <Download size={16} /> Exportar
                    </button>
                    <button onClick={() => openNew()} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-200 text-sm transition active:scale-95">
                        <Plus size={18} /> Registrar Gasto
                    </button>
                </div>
            </div>

            {/* TABS */}
            <div className="flex gap-2 border-b border-gray-200">
                {(['expenses', 'recurring'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        {tab === 'expenses' ? '📋 Gastos' : '🔁 Recurrentes'}
                    </button>
                ))}
            </div>

            {/* ── TAB GASTOS ── */}
            {activeTab === 'expenses' && (<>

                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(['today', 'week', 'month', 'all'] as Period[]).map(p => {
                        const total = filterByPeriod(expenses, p).reduce((a, e) => a + e.amountUSD, 0);
                        const label = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', all: 'Total' }[p];
                        return (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={`p-4 rounded-2xl border text-left transition-all ${period === p ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' : 'bg-white border-gray-100 hover:border-red-200'}`}
                            >
                                <p className={`text-xs font-bold uppercase ${period === p ? 'text-red-200' : 'text-gray-400'}`}>{label}</p>
                                <p className={`text-xl font-black mt-1 ${period === p ? 'text-white' : 'text-gray-800'}`}>{formatCurrency(total, 'USD')}</p>
                            </button>
                        );
                    })}
                </div>

                {/* FILTRO CATEGORÍA Y VENDEDOR */}
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex gap-2 flex-wrap flex-1">
                        {allCategories.map(cat => (
                            <button key={cat} onClick={() => setFilterCat(cat)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${filterCat === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                            >
                                {cat === 'ALL' ? 'Todas las categorías' : cat}
                            </button>
                        ))}
                    </div>

                    <div className="w-full md:w-64">
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <select
                                className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none focus:border-red-300 appearance-none cursor-pointer"
                                value={selectedSellerTerm}
                                onChange={e => setSelectedSellerTerm(e.target.value)}
                            >
                                <option value="ALL">👤 Todos los Usuarios</option>
                                {allSellers.map(seller => (
                                    <option key={seller} value={seller}>{seller}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        </div>
                    </div>
                </div>

                {/* TABLA */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800">{displayed.length} gasto{displayed.length !== 1 ? 's' : ''}</h3>
                            <p className="text-xs text-gray-400">Total: <span className="font-black text-red-600">{formatCurrency(totalUSD, 'USD')}</span></p>
                        </div>
                    </div>
                    {displayed.length === 0 ? (
                        <div className="py-16 text-center text-gray-400">
                            <TrendingDown size={48} className="mx-auto mb-3 opacity-20" />
                            <p>No hay gastos en este período</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Fecha</th>
                                        <th className="px-4 py-3">Descripción</th>
                                        <th className="px-4 py-3">Categoría</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                        <th className="px-4 py-3 text-right">USD</th>
                                        <th className="px-4 py-3">Método</th>
                                        <th className="px-4 py-3">Registrado por</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {displayed.map(e => (
                                        <tr key={e.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.date + 'T12:00:00').toLocaleDateString('es-VE')}</td>
                                            <td className="px-4 py-3 font-semibold text-gray-800">
                                                {e.description}
                                                {e.isRecurring && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">RECURRENTE</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[11px] font-bold">{e.category}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">
                                                {e.currency === 'BS'
                                                    ? `Bs. ${(e.amountBS ?? e.amountUSD * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                                                    : formatCurrency(e.amountUSD, 'USD')}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatCurrency(e.amountUSD, 'USD')}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{e.paymentMethod}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={12} className="text-gray-300" />
                                                    <span className="text-xs text-gray-400">{e.sellerName || 'Sistema'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1">
                                                    <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-blue-50 text-blue-500 rounded-lg transition"><Edit size={14} /></button>
                                                    <button onClick={() => deleteExpense(e.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>)}

            {/* ── TAB RECURRENTES ── */}
            {activeTab === 'recurring' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800">Gastos Recurrentes</h3>
                            <p className="text-xs text-gray-500">Plantillas para gastos fijos (luz, agua, alquiler…)</p>
                        </div>
                        <button onClick={() => { setEditingRecurring(null); setRecForm({ ...emptyRec, paymentMethod: defaultPaymentMethod }); setRecAmount(''); setRecurringModal(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition">
                            <Plus size={16} /> Nueva Plantilla
                        </button>
                    </div>

                    {recurring.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
                            <CalendarClock size={48} className="mx-auto mb-3 opacity-20" />
                            <p>No tienes plantillas. Crea una para gastos como luz, agua, alquiler…</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {recurring.map(r => (
                                <div key={r.id} className={`bg-white rounded-2xl border p-5 shadow-sm ${r.active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="font-black text-gray-800">{r.description}</p>
                                            <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">{r.category}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-lg text-gray-900">
                                                {r.currency === 'BS'
                                                    ? `Bs. ${(r.amountBS || r.amountUSD * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                                                    : formatCurrency(r.amountUSD, 'USD')}
                                            </p>
                                            {r.currency === 'BS' && <p className="text-xs text-gray-400">{formatCurrency(r.amountUSD, 'USD')}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                                        <span>{r.paymentMethod}</span>
                                        {r.dayOfMonth && <span>Día {r.dayOfMonth} de cada mes</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => registerRecurring(r)}
                                            className="flex-1 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl hover:bg-green-100 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                                        >
                                            <RefreshCw size={12} /> Registrar Hoy
                                        </button>
                                        <button onClick={() => { setEditingRecurring(r); setRecForm({ description: r.description, category: r.category, amountUSD: r.amountUSD, amountBS: r.amountBS, currency: r.currency, paymentMethod: r.paymentMethod, dayOfMonth: r.dayOfMonth, active: r.active }); setRecAmount(r.currency === 'BS' ? String(r.amountBS || '') : String(r.amountUSD)); setRecurringModal(true); }}
                                            className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition">
                                            <Edit size={14} />
                                        </button>
                                        <button onClick={() => deleteRecurring(r.id)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── MODAL NUEVO/EDITAR GASTO ─────────────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full md:w-[480px] rounded-t-3xl md:rounded-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-xl font-black text-gray-800">{editingId ? 'Editar Gasto' : 'Registrar Gasto'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            {/* Descripción */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Descripción *</label>
                                <input
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-red-200 outline-none"
                                    placeholder="Ej: Pago de electricidad"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>

                            {/* Moneda + Monto */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Monto *</label>
                                <div className="flex gap-2">
                                    {/* Toggle USD/BS */}
                                    <div className="flex border-2 border-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                                        {(['USD', 'BS'] as ExpenseCurrency[]).map(cur => (
                                            <button key={cur} type="button"
                                                onClick={() => setForm(f => ({ ...f, currency: cur }))}
                                                className={`px-3 py-2 text-sm font-black transition ${form.currency === cur ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                                            >{cur}</button>
                                        ))}
                                    </div>
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">{form.currency === 'USD' ? '$' : 'Bs.'}</span>
                                        <input
                                            type="number" min="0" step="0.01"
                                            className="w-full border-2 border-gray-100 rounded-xl p-3 pl-10 font-black text-lg focus:border-red-200 outline-none"
                                            placeholder="0.00"
                                            value={form.amount}
                                            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                {isBSMethod && (
                                    <div className="mt-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tasa usada para este pago</label>
                                        <input
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            className="w-full border border-orange-200 bg-orange-50 rounded-lg p-2 font-bold text-sm text-orange-800"
                                            value={form.rateUsed}
                                            onChange={e => setForm(f => ({ ...f, rateUsed: e.target.value }))}
                                        />
                                    </div>
                                )}
                                {form.currency === 'BS' && form.amount && (
                                    <p className="text-xs text-gray-400 mt-1 ml-1">
                                        ≈ {formatCurrency(parseFloat(form.amount) / (parseFloat(form.rateUsed || '0') || rate), 'USD')} a tasa {(parseFloat(form.rateUsed || '0') || rate).toFixed(2)}
                                    </p>
                                )}
                                {form.currency === 'USD' && isBSMethod && form.amount && (
                                    <p className="text-xs text-gray-400 mt-1 ml-1">
                                        Se pagarán aprox. Bs. {(parseFloat(form.amount) * (parseFloat(form.rateUsed || '0') || rate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        {' '}a tasa {(parseFloat(form.rateUsed || '0') || rate).toFixed(2)}
                                    </p>
                                )}
                            </div>

                            {/* Categoría */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Categoría</label>
                                <select
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-red-200 outline-none"
                                    value={form.category}
                                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                >
                                    {DEFAULT_EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="custom">✏️ Escribir categoría personalizada…</option>
                                </select>
                                {form.category === 'custom' && (
                                    <input
                                        className="w-full border-2 border-blue-100 rounded-xl p-3 font-semibold focus:border-blue-400 outline-none mt-2"
                                        placeholder="Escribe la categoría…"
                                        value={form.customCategory}
                                        onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                                    />
                                )}
                            </div>

                            {/* Fecha + Método */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Fecha</label>
                                    <input type="date" className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-red-200 outline-none"
                                        value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Método de Pago</label>
                                    <select
                                        className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-red-200 outline-none bg-white"
                                        value={form.paymentMethod}
                                        onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                                    >
                                        {paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Recurrente */}
                            <label className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-100 rounded-xl cursor-pointer hover:border-blue-200 transition">
                                <input type="checkbox" checked={form.isRecurring}
                                    onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                                    className="w-4 h-4 rounded" />
                                <div>
                                    <p className="font-bold text-gray-700 text-sm">Marcar como gasto recurrente</p>
                                    <p className="text-xs text-gray-400">Aparecerá etiquetado en la tabla</p>
                                </div>
                            </label>

                            <button onClick={handleSave}
                                className="w-full py-4 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition active:scale-95">
                                <Save size={20} /> {editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR GASTO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL PLANTILLA RECURRENTE ─────────────────────────────────────── */}
            {recurringModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-black text-gray-800">{editingRecurring ? 'Editar Plantilla' : 'Nueva Plantilla Recurrente'}</h3>
                            <button onClick={() => setRecurringModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <input className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-blue-200 outline-none"
                                placeholder="Descripción (Ej: Alquiler del local)" value={recForm.description}
                                onChange={e => setRecForm(f => ({ ...f, description: e.target.value }))} />

                            <select className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-blue-200 outline-none"
                                value={recForm.category} onChange={e => setRecForm(f => ({ ...f, category: e.target.value }))}>
                                {DEFAULT_EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            <div className="flex gap-2">
                                <div className="flex border-2 border-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                                    {(['USD', 'BS'] as ExpenseCurrency[]).map(cur => (
                                        <button key={cur} type="button" onClick={() => setRecForm(f => ({ ...f, currency: cur }))}
                                            className={`px-3 py-2 text-sm font-black transition ${recForm.currency === cur ? 'bg-gray-900 text-white' : 'bg-white text-gray-500'}`}>
                                            {cur}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">{recForm.currency === 'USD' ? '$' : 'Bs.'}</span>
                                    <input type="number" min="0" step="0.01"
                                        className="w-full border-2 border-gray-100 rounded-xl p-3 pl-10 font-black focus:border-blue-200 outline-none"
                                        placeholder="0.00" value={recAmount}
                                        onChange={e => setRecAmount(e.target.value)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-blue-200 outline-none bg-white"
                                    value={recForm.paymentMethod}
                                    onChange={e => setRecForm(f => ({ ...f, paymentMethod: e.target.value }))}
                                >
                                    {paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                                </select>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Día del mes (1-31)</label>
                                    <input type="number" min="1" max="31"
                                        className="w-full border-2 border-gray-100 rounded-xl p-3 font-semibold focus:border-blue-200 outline-none"
                                        placeholder="Ej: 5" value={recForm.dayOfMonth ?? ''}
                                        onChange={e => setRecForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) || undefined }))} />
                                </div>
                            </div>

                            <button onClick={saveRecurringItem}
                                className="w-full py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 transition">
                                <Save size={18} /> {editingRecurring ? 'Actualizar' : 'Crear Plantilla'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
