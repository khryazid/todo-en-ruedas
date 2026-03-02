/**
 * @file components/GlobalSearch.tsx
 * @description Búsqueda global rápida activada con Ctrl+K.
 * Busca en productos, clientes y ventas simultáneamente.
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Search, X, Package, Users, ShoppingBag } from 'lucide-react';

export const GlobalSearch = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const { products, clients, sales } = useStore();
    const navigate = useNavigate();

    // Ctrl+K para abrir/cerrar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Auto-focus y reset
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            // Evitar setState sincrónico dentro del effect al cerrar
            setTimeout(() => setQuery(''), 0);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const q = query.toLowerCase().trim();

    const matchedProducts = q.length < 2 ? [] : products
        .filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
        .slice(0, 4);

    const matchedClients = q.length < 2 ? [] : clients
        .filter(c => c.name.toLowerCase().includes(q) || c.rif.toLowerCase().includes(q))
        .slice(0, 4);

    const matchedSales = q.length < 2 ? [] : sales
        .filter(s => s.id.slice(-6).toLowerCase().includes(q))
        .slice(0, 3);

    const totalResults = matchedProducts.length + matchedClients.length + matchedSales.length;

    const goTo = (path: string) => {
        navigate(path);
        setIsOpen(false);
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-start justify-center pt-[10vh] p-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
            <div className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-150"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {/* Input */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <Search size={18} className="text-gray-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar productos, clientes, tickets..."
                        className="flex-1 outline-none font-medium text-sm bg-transparent"
                        style={{ color: 'var(--text-1)' }}
                    />
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-500 transition">
                        <X size={18} />
                    </button>
                </div>

                {/* Resultados */}
                <div className="max-h-[55vh] overflow-y-auto">
                    {q.length < 2 ? (
                        <p className="text-center text-gray-400 text-sm py-8">Escribe al menos 2 caracteres para buscar</p>
                    ) : totalResults === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">Sin resultados para «{query}»</p>
                    ) : (
                        <div className="p-2 space-y-1">
                            {/* Productos */}
                            {matchedProducts.length > 0 && (
                                <>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase px-3 pt-2 pb-1">Productos</p>
                                    {matchedProducts.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => goTo('/inventory')}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition text-left group"
                                        >
                                            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <Package size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-800 truncate group-hover:text-blue-700">{p.name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">{p.sku} — Stock: {p.stock}</p>
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}

                            {/* Clientes */}
                            {matchedClients.length > 0 && (
                                <>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase px-3 pt-2 pb-1">Clientes</p>
                                    {matchedClients.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => goTo('/clients')}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-green-50 transition text-left group"
                                        >
                                            <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <Users size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-800 truncate group-hover:text-green-700">{c.name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">{c.rif} {c.phone && `· ${c.phone}`}</p>
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}

                            {/* Ventas */}
                            {matchedSales.length > 0 && (
                                <>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase px-3 pt-2 pb-1">Ventas</p>
                                    {matchedSales.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => goTo('/sales')}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition text-left group"
                                        >
                                            <div className="w-8 h-8 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <ShoppingBag size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-800">Ticket #{s.id.slice(-6)}</p>
                                                <p className="text-[10px] text-gray-400">{new Date(s.date).toLocaleDateString('es-VE')} — ${s.totalUSD.toFixed(2)}</p>
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">
                        {q.length >= 2 ? `${totalResults} resultado${totalResults !== 1 ? 's' : ''}` : 'Búsqueda global'}
                    </span>
                    <kbd className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">ESC para cerrar</kbd>
                </div>
            </div>
        </div>
    );
};
