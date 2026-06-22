/**
 * offlineSync.ts
 * ──────────────────────────────────────────────────────────────
 * Sistema de ventas offline para el POS.
 *
 * Flujo:
 *  1. Cuando hay internet → venta normal a Supabase
 *  2. Sin internet → venta guardada en IndexedDB (cola)
 *  3. Al reconectar → cola se sincroniza automáticamente
 *  4. Service Worker registra el tag 'sync-offline-sales'
 *
 * Uso:
 *   const { isOnline, saveSaleOffline, pendingCount } = useOfflineSync();
 *   if (!isOnline) await saveSaleOffline(salePayload);
 */

import { salesApi } from './supabase';

// ── IndexedDB setup ───────────────────────────────────────────

const DB_NAME    = 'pos-offline';
const DB_VERSION = 1;
const STORE_SALES    = 'pending_sales';
const STORE_PRODUCTS = 'products_cache';

let _db: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Cola de ventas pendientes
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const store = db.createObjectStore(STORE_SALES, { keyPath: 'localId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('synced',    'synced',    { unique: false });
      }

      // Caché de productos para búsqueda offline
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const store = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
        store.createIndex('companyId', 'company_id', { unique: false });
        store.createIndex('barcode',   'barcode',    { unique: false });
        store.createIndex('sku',       'sku',        { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Generic IDB helpers ───────────────────────────────────────

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db    = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(storeName: string, value: Record<string, any>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

// ── Types ─────────────────────────────────────────────────────

export interface OfflineSale {
  localId:    string;
  createdAt:  string;
  synced:     boolean;
  syncError?: string;
  payload:    OfflineSalePayload;
}

export interface OfflineSalePayload {
  company_id:      string;
  branch_id:       string;
  user_id:         string;
  cash_session_id?: string;
  customer_id?:    string;
  subtotal:        number;
  discount:        number;
  tax:             number;
  total:           number;
  paid_amount:     number;
  change_amount:   number;
  payment_method:  string;
  notes?:          string;
  items: Array<{
    product_id: string;
    name:       string;
    price:      number;
    cost:       number;
    quantity:   number;
    discount:   number;
    subtotal:   number;
  }>;
}

// ── Pending sales ─────────────────────────────────────────────

/** Guarda una venta en la cola local cuando no hay internet */
export async function saveSaleOffline(payload: OfflineSalePayload): Promise<string> {
  const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: OfflineSale = {
    localId,
    createdAt: new Date().toISOString(),
    synced:    false,
    payload,
  };
  await idbPut(STORE_SALES, record as any);

  // Registrar background sync si está disponible
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await (reg as any).sync.register('sync-offline-sales');
  }

  return localId;
}

/** Obtiene todas las ventas pendientes de sincronización */
export async function getPendingSales(): Promise<OfflineSale[]> {
  const all = await idbGetAll<OfflineSale>(STORE_SALES);
  return all.filter(s => !s.synced);
}

/** Obtiene el total de ventas pendientes */
export async function getPendingCount(): Promise<number> {
  const pending = await getPendingSales();
  return pending.length;
}

/** Marca una venta como sincronizada */
export async function markSaleSynced(localId: string): Promise<void> {
  const sale = await idbGet<OfflineSale>(STORE_SALES, localId);
  if (sale) {
    await idbPut(STORE_SALES, { ...sale, synced: true, syncError: undefined } as any);
  }
}

/** Registra un error de sync para reintentar después */
export async function markSaleSyncError(localId: string, error: string): Promise<void> {
  const sale = await idbGet<OfflineSale>(STORE_SALES, localId);
  if (sale) {
    await idbPut(STORE_SALES, { ...sale, syncError: error } as any);
  }
}

/** Elimina ventas ya sincronizadas (limpieza periódica) */
export async function clearSyncedSales(): Promise<void> {
  const all = await idbGetAll<OfflineSale>(STORE_SALES);
  const synced = all.filter(s => s.synced);
  for (const s of synced) {
    await idbDelete(STORE_SALES, s.localId);
  }
}

// ── Product cache ─────────────────────────────────────────────

/** Guarda el catálogo de productos en IDB para búsqueda offline */
export async function cacheProducts(products: any[]): Promise<void> {
  for (const p of products) {
    await idbPut(STORE_PRODUCTS, p);
  }
}

/** Busca productos en la caché local (offline) */
export async function searchProductsOffline(
  companyId: string,
  query: string
): Promise<any[]> {
  const all = await idbGetAll<any>(STORE_PRODUCTS);
  const q   = query.toLowerCase();
  return all.filter(p =>
    p.company_id === companyId &&
    p.is_active !== false &&
    (
      p.name?.toLowerCase().includes(q) ||
      p.barcode === query ||
      p.sku?.toLowerCase().includes(q)
    )
  );
}

/** Obtiene todos los productos cacheados para una empresa */
export async function getCachedProducts(companyId: string): Promise<any[]> {
  const all = await idbGetAll<any>(STORE_PRODUCTS);
  return all.filter(p => p.company_id === companyId && p.is_active !== false);
}

// ── Sync engine ───────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Sincroniza todas las ventas pendientes con Supabase.
 * Llamado automáticamente al reconectar, o manualmente.
 */
export async function syncPendingSales(): Promise<SyncResult> {
  const pending = await getPendingSales();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const sale of pending) {
    try {
      await salesApi.create(sale.payload as any);
      await markSaleSynced(sale.localId);
      synced++;
    } catch (err: any) {
      const msg = err?.message ?? 'Error desconocido';
      await markSaleSyncError(sale.localId, msg);
      errors.push(`${sale.localId}: ${msg}`);
      failed++;
    }
  }

  // Limpiar ventas sincronizadas antiguas (>7 días)
  await clearSyncedSales();

  return { synced, failed, errors };
}

// ── Online/offline detection hook ─────────────────────────────

import { useState, useEffect, useCallback } from 'react';

export function useOfflineSync() {
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Actualiza el contador de pendientes
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Sincronización manual o automática
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncPendingSales();
      setLastSyncResult(result);
      await refreshPendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  // Guarda venta offline
  const saveOffline = useCallback(async (payload: OfflineSalePayload) => {
    const localId = await saveSaleOffline(payload);
    await refreshPendingCount();
    return localId;
  }, [refreshPendingCount]);

  useEffect(() => {
    // Cargar contador inicial
    refreshPendingCount();

    const handleOnline = async () => {
      setIsOnline(true);
      // Auto-sync al reconectar
      await syncNow();
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Polling cada 30s para refrescar contador
    const interval = setInterval(refreshPendingCount, 30_000);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount, syncNow]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncResult,
    syncNow,
    saveOffline,
    refreshPendingCount,
    cacheProducts,
    searchProductsOffline,
    getCachedProducts,
  };
}
