/**
 * @file main.tsx
 * @description Punto de entrada principal de la aplicación React.
 * Monta el componente raíz (App) en el elemento DOM 'root'.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Importante: Carga los estilos de Tailwind y los de impresión

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);