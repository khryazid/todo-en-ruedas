/**
 * @file hooks/useDarkMode.ts
 * @description Hook para gestionar el modo oscuro.
 * Persiste la preferencia en localStorage y aplica/quita la clase 'dark' en <html>.
 */

import { useState, useEffect } from 'react';

const KEY = 'todo-dark-mode';

export const useDarkMode = () => {
    const [isDark, setIsDark] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(KEY);
            if (saved !== null) return saved === 'true';
            // Respetar preferencia del sistema
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch { return false; }
    });

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        try { localStorage.setItem(KEY, String(isDark)); } catch { }
    }, [isDark]);

    return { isDark, toggle: () => setIsDark(d => !d), setDark: setIsDark };
};
