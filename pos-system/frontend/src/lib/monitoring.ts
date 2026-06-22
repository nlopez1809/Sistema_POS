// src/lib/monitoring.ts
// ─────────────────────────────────────────────────────────────
// Monitoreo de errores con Sentry.
// Activar: npm install @sentry/react
// Agregar en .env.local: VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
// ─────────────────────────────────────────────────────────────

// ── Types para cuando Sentry no está cargado ──────────────────
interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: Error, ctx?: Record<string, unknown>) => void;
  captureMessage: (msg: string, level?: string) => void;
  setUser: (user: { id: string; email?: string; username?: string } | null) => void;
  setTag: (key: string, value: string) => void;
  setContext: (key: string, ctx: Record<string, unknown>) => void;
  addBreadcrumb: (crumb: { message: string; category?: string; level?: string }) => void;
  withScope: (cb: (scope: ScopeLike) => void) => void;
}

interface ScopeLike {
  setTag: (key: string, value: string) => void;
  setContext: (key: string, ctx: Record<string, unknown>) => void;
  setLevel: (level: string) => void;
}

// ── Lazy load de Sentry ───────────────────────────────────────
let _sentry: SentryLike | null = null;

async function getSentry(): Promise<SentryLike | null> {
  if (_sentry) return _sentry;
  try {
    // Dynamic import — no rompe el build si @sentry/react no está instalado
    const mod = await import('@sentry/react');
    _sentry = mod as unknown as SentryLike;
    return _sentry;
  } catch {
    return null;
  }
}

// ── Init ──────────────────────────────────────────────────────
export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // no configurado → no hacer nada

  const Sentry = await getSentry();
  if (!Sentry) {
    console.warn('[monitoring] @sentry/react no instalado. npm install @sentry/react');
    return;
  }

  Sentry.init({
    dsn,
    environment:      import.meta.env.MODE ?? 'production',
    release:          import.meta.env.VITE_APP_VERSION ?? '1.0.0',
    tracesSampleRate: 0.1,     // 10% de transacciones — ajustar según plan
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      // Ignorar errores comunes que no son bugs reales
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      'Load failed',
      /^ChunkLoadError/,
    ],
    beforeSend(event: any) {
      // No enviar errores en desarrollo
      if (import.meta.env.DEV) return null;
      return event;
    },
  });

  console.info('[monitoring] Sentry inicializado');
}

// ── User context ──────────────────────────────────────────────
export async function setMonitoringUser(user: {
  id: string;
  email?: string;
  name?: string;
  companyId?: string;
  role?: string;
} | null): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  if (user) {
    Sentry.setUser({
      id:       user.id,
      email:    user.email,
      username: user.name,
    });
    if (user.companyId) Sentry.setTag('company_id', user.companyId);
    if (user.role)      Sentry.setTag('user_role',  user.role);
  } else {
    Sentry.setUser(null);
  }
}

// ── Error capture ─────────────────────────────────────────────
export async function captureError(
  error: Error,
  context?: {
    module?:   string;
    action?:   string;
    extra?:    Record<string, unknown>;
  }
): Promise<void> {
  // Siempre loguear en consola
  console.error('[monitoring]', error, context);

  const Sentry = await getSentry();
  if (!Sentry) return;

  Sentry.withScope((scope: ScopeLike) => {
    if (context?.module) scope.setTag('module', context.module);
    if (context?.action) scope.setTag('action', context.action);
    if (context?.extra)  scope.setContext('extra', context.extra);
    Sentry.captureException(error);
  });
}

// ── Business event tracking ───────────────────────────────────
export async function trackEvent(
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const Sentry = await getSentry();
  if (!Sentry) return;

  Sentry.addBreadcrumb({
    message,
    category: 'business',
    level:    'info',
  });
  if (data) Sentry.setContext('event_data', data);
}

// ── Critical operations breadcrumbs ──────────────────────────
export const track = {
  sale:       (amount: number, method: string) =>
    trackEvent(`Venta completada: ${method} Bs ${amount.toFixed(2)}`, { amount, method }),
  login:      (userId: string) =>
    trackEvent('Usuario inició sesión', { userId }),
  logout:     () =>
    trackEvent('Usuario cerró sesión'),
  stockAlert: (productName: string, qty: number) =>
    trackEvent(`Stock bajo: ${productName} (${qty} unidades)`, { productName, qty }),
  offlineSale: (localId: string) =>
    trackEvent('Venta guardada offline', { localId }),
  syncSuccess: (count: number) =>
    trackEvent(`${count} ventas offline sincronizadas`, { count }),
};

// ── Error Boundary helper (para uso en App.tsx) ───────────────
export function createErrorBoundaryProps() {
  return {
    onError: (error: Error) => captureError(error, { module: 'ErrorBoundary' }),
    fallback: ({ error }: { error: Error }) => (
      // JSX no disponible aquí, manejar en el componente
      null
    ),
  };
}
