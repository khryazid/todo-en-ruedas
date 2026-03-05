import { useEffect } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PWAUpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;

    const timeoutId = window.setTimeout(() => {
      setOfflineReady(false);
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed top-20 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-gray-700 bg-gray-800/95 p-4 shadow-2xl backdrop-blur transition-all sm:top-16">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-red-400">
          {needRefresh ? <RefreshCw className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        </div>

        <div className="flex-1">
          <p className="text-sm font-bold text-white">
            {needRefresh ? 'Nueva version disponible' : 'Modo offline activado'}
          </p>
          <p className="mt-1 text-xs text-gray-300">
            {needRefresh
              ? 'Recarga para aplicar los cambios mas recientes.'
              : 'La app quedo lista para funcionar sin conexion.'}
          </p>

          {needRefresh ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Actualizar ahora
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-700"
              >
                Luego
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
          className="text-gray-400 transition hover:text-white"
          aria-label="Cerrar notificacion de actualizacion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
