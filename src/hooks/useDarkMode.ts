/**
 * @file hooks/useDarkMode.ts
 * @description Hook global de dark mode.
 *
 * DISEÑO: Usa un MutationObserver en <html> para que TODOS los componentes
 * que llamen a este hook reciban el mismo estado reactivo.
 * Sin esto, cada llamada crea estado independiente y se desincroniza.
 */

import { useState, useEffect } from 'react';

const KEY = 'todo-dark-mode';

/** Lee el estado real del DOM (fuente de verdad) */
const getIsDark = () => document.documentElement.classList.contains('dark');

/** Aplica la clase dark al <html> y guarda en localStorage */
const applyDark = (dark: boolean) => {
    if (dark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem(KEY, String(dark)); } catch { /* noop */ }
};

export const useDarkMode = () => {
    // Inicializar desde localStorage (o preferencia del sistema)
    const [isDark, setIsDark] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(KEY);
            if (saved !== null) return saved === 'true';
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch { return false; }
    });

    // Aplicar al DOM en el primer render
    useEffect(() => {
        applyDark(isDark);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // MutationObserver: escuchar cambios en la clase del <html>
    // Esto sincroniza TODOS los componentes que usen este hook
    useEffect(() => {
        const observer = new MutationObserver(() => {
            const current = getIsDark();
            setIsDark(current);
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
        return () => observer.disconnect();
    }, []);

    const toggle = () => {
        const next = !isDark;
        applyDark(next);
        setIsDark(next);
    };

    return { isDark, toggle, setDark: applyDark };
};
