import '@testing-library/jest-dom';
import { vi } from 'vitest';
import path from 'path';

// ── Mock localStorage ──────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ── Mock Supabase ──────────────────────────────────────────────
// Usamos el alias '@' que está configurado en vite.config test.alias
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:    vi.fn().mockReturnThis(),
    auth:    {
      getSession:         vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange:  vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getUser:            vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    insert:  vi.fn().mockResolvedValue({ data: null, error: null }),
    update:  vi.fn().mockResolvedValue({ data: null, error: null }),
    delete:  vi.fn().mockReturnThis(),
    upsert:  vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc:     vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  getCurrentUser:  vi.fn().mockResolvedValue(null),
  productsApi: {
    list:        vi.fn().mockResolvedValue([]),
    search:      vi.fn().mockResolvedValue([]),
    create:      vi.fn().mockResolvedValue({ id: 'mock-id' }),
    update:      vi.fn().mockResolvedValue({ id: 'mock-id' }),
    updateStock: vi.fn().mockResolvedValue(undefined),
  },
  salesApi: {
    create: vi.fn().mockResolvedValue({ id: 'mock-sale', ticket_number: '20240101-0001' }),
    list:   vi.fn().mockResolvedValue([]),
    void:   vi.fn().mockResolvedValue(undefined),
  },
  reportsApi: {
    dailySummary: vi.fn().mockResolvedValue([]),
    topProducts:  vi.fn().mockResolvedValue([]),
    lowStock:     vi.fn().mockResolvedValue([]),
  },
  cashSessionsApi: {
    open:       vi.fn().mockResolvedValue({ id: 'mock-session' }),
    close:      vi.fn().mockResolvedValue({ id: 'mock-session' }),
    getCurrent: vi.fn().mockResolvedValue(null),
  },
}));

// ── Mock offlineSync (usa IndexedDB que no existe en jsdom) ────
vi.mock('@/lib/offlineSync', () => ({
  openDB:              vi.fn().mockResolvedValue({}),
  saveSaleOffline:     vi.fn().mockResolvedValue('offline_mock_id'),
  getPendingSales:     vi.fn().mockResolvedValue([]),
  getPendingCount:     vi.fn().mockResolvedValue(0),
  markSaleSynced:      vi.fn().mockResolvedValue(undefined),
  markSaleSyncError:   vi.fn().mockResolvedValue(undefined),
  clearSyncedSales:    vi.fn().mockResolvedValue(undefined),
  cacheProducts:       vi.fn().mockResolvedValue(undefined),
  searchProductsOffline: vi.fn().mockResolvedValue([]),
  getCachedProducts:   vi.fn().mockResolvedValue([]),
  syncPendingSales:    vi.fn().mockResolvedValue({ synced: 0, failed: 0, errors: [] }),
  useOfflineSync: () => ({
    isOnline:       true,
    pendingCount:   0,
    isSyncing:      false,
    lastSyncResult: null,
    syncNow:        vi.fn().mockResolvedValue({ synced: 0, failed: 0, errors: [] }),
    saveOffline:    vi.fn().mockResolvedValue('offline_mock_id'),
    refreshPendingCount: vi.fn().mockResolvedValue(undefined),
    cacheProducts:  vi.fn().mockResolvedValue(undefined),
    searchProductsOffline: vi.fn().mockResolvedValue([]),
    getCachedProducts: vi.fn().mockResolvedValue([]),
  }),
}));

// ── Mock monitoring (Sentry) ────────────────────────────────────
vi.mock('@/lib/monitoring', () => ({
  initMonitoring:    vi.fn().mockResolvedValue(undefined),
  setMonitoringUser: vi.fn().mockResolvedValue(undefined),
  captureError:      vi.fn().mockResolvedValue(undefined),
  trackEvent:        vi.fn().mockResolvedValue(undefined),
  track: {
    sale:        vi.fn().mockResolvedValue(undefined),
    login:       vi.fn().mockResolvedValue(undefined),
    logout:      vi.fn().mockResolvedValue(undefined),
    stockAlert:  vi.fn().mockResolvedValue(undefined),
    offlineSale: vi.fn().mockResolvedValue(undefined),
    syncSuccess: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Mock window.open (para print/PDF) ─────────────────────────
vi.stubGlobal('open', vi.fn(() => ({
  document: { write: vi.fn(), close: vi.fn() },
  focus:    vi.fn(),
  print:    vi.fn(),
  close:    vi.fn(),
})));

// ── Mock React Router ──────────────────────────────────────────
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...(actual as object), useNavigate: () => vi.fn() };
});

// ── Silence console.error en tests ────────────────────────────
// (evita ruido de React warnings en la salida de tests)
const originalError = console.error.bind(console.error);
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning:') || args[0].includes('ReactDOM.render'))
  ) return;
  originalError(...args);
};
