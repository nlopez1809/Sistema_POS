import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useOfflineSync } from '../../lib/offlineSync';
import toast from 'react-hot-toast';

export default function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, lastSyncResult, syncNow } = useOfflineSync();
  const [dismissed, setDismissed] = useState(false);

  const handleSync = async () => {
    const result = await syncNow();
    if (result) {
      if (result.synced > 0) {
        toast.success(`${result.synced} venta(s) sincronizada(s) ✓`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} venta(s) no se pudieron sincronizar`);
      }
    }
  };

  // Online sin pendientes: no mostrar nada
  if (isOnline && pendingCount === 0 && !lastSyncResult) return null;

  // Online con pendientes: mostrar banner de sync
  if (isOnline && pendingCount > 0) {
    return (
      <div className="offline-banner sync-pending">
        <style>{bannerStyles}</style>
        <div className="banner-left">
          <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
          <span>
            <strong>{pendingCount}</strong> venta{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de sincronizar
          </span>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="banner-action">
          {isSyncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>
    );
  }

  // Offline: mostrar banner prominente
  if (!isOnline && !dismissed) {
    return (
      <div className="offline-banner offline">
        <style>{bannerStyles}</style>
        <div className="banner-left">
          <WifiOff size={14} />
          <span>
            Sin conexión — Las ventas se guardarán localmente y se sincronizarán al reconectar
          </span>
        </div>
        {pendingCount > 0 && (
          <span className="pending-badge">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        )}
        <button onClick={() => setDismissed(true)} className="banner-dismiss" title="Cerrar">
          <X size={12} />
        </button>
      </div>
    );
  }

  // Último resultado de sync exitoso (se muestra brevemente)
  if (isOnline && lastSyncResult && lastSyncResult.synced > 0 && pendingCount === 0) {
    return (
      <div className="offline-banner synced">
        <style>{bannerStyles}</style>
        <div className="banner-left">
          <CheckCircle2 size={14} />
          <span>{lastSyncResult.synced} venta{lastSyncResult.synced !== 1 ? 's' : ''} sincronizada{lastSyncResult.synced !== 1 ? 's' : ''} correctamente</span>
        </div>
      </div>
    );
  }

  return null;
}

// ── Versión compacta para el topbar ──────────────────────────
export function OnlineIndicator() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOfflineSync();

  const handleSync = async () => {
    const result = await syncNow();
    if (result?.synced) toast.success(`${result.synced} venta(s) sincronizada(s)`);
  };

  if (isOnline && pendingCount === 0) {
    return (
      <div className="online-dot" title="Conectado">
        <style>{bannerStyles}</style>
        <Wifi size={12} color="#22c55e" />
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="offline-dot" title="Sin conexión — modo offline activo">
        <style>{bannerStyles}</style>
        <WifiOff size={12} color="#f87171" />
        {pendingCount > 0 && <span className="dot-count">{pendingCount}</span>}
      </div>
    );
  }

  // Pendientes
  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="sync-dot"
      title={`${pendingCount} ventas pendientes — clic para sincronizar`}
    >
      <style>{bannerStyles}</style>
      <RefreshCw size={12} color="#f59e0b" className={isSyncing ? 'spin' : ''} />
      <span className="dot-count pending">{pendingCount}</span>
    </button>
  );
}

const bannerStyles = `
  .offline-banner {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; font-size: 12px; font-weight: 500;
    position: sticky; top: 0; z-index: 50;
    animation: slideDown .2s ease;
  }
  @keyframes slideDown {
    from { opacity:0; transform:translateY(-8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .offline-banner.offline {
    background: #1a0505; border-bottom: 1px solid #dc2626;
    color: #f87171;
  }
  .offline-banner.sync-pending {
    background: #1a1000; border-bottom: 1px solid #d97706;
    color: #d97706;
  }
  .offline-banner.synced {
    background: #0f2d1a; border-bottom: 1px solid #22c55e;
    color: #22c55e;
  }
  .banner-left { display:flex; align-items:center; gap:7px; flex:1; }
  .banner-action {
    background: #d9770622; border: 1px solid #d97706;
    border-radius: 6px; color: #d97706; font-size: 11px;
    padding: 3px 10px; cursor: pointer; transition: all .1s; white-space: nowrap;
  }
  .banner-action:hover:not(:disabled) { background: #d9770633; }
  .banner-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .banner-dismiss {
    background: none; border: none; color: inherit;
    cursor: pointer; padding: 2px; opacity: 0.6;
    display: flex; align-items: center;
  }
  .banner-dismiss:hover { opacity: 1; }
  .pending-badge {
    background: #dc262622; border: 1px solid #dc2626;
    border-radius: 20px; padding: 1px 8px; font-size: 10px;
    color: #f87171; white-space: nowrap;
  }

  /* Topbar indicators */
  .online-dot, .offline-dot, .sync-dot {
    display: flex; align-items: center; gap: 4px;
    border-radius: 6px; padding: 4px 6px;
  }
  .offline-dot { background: #1a0505; border: 1px solid #dc262633; }
  .sync-dot { background: #1a1000; border: 1px solid #d9770633; cursor: pointer; }
  .sync-dot:disabled { opacity: 0.5; }
  .dot-count {
    font-size: 10px; font-weight: 700; line-height: 1;
  }
  .dot-count.pending { color: #f59e0b; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
