import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

import { supabase, getCurrentUser } from './lib/supabase';
import { useAppStore } from './store';

import AppLayout        from './components/layout/AppLayout';
import LoginPage        from './pages/LoginPage';
import OnboardingWizard from './pages/OnboardingWizard';
import DashboardPage    from './pages/DashboardPage';
import POSPage          from './pages/POSPage';
import InventoryPage    from './pages/InventoryPage';
import ReportsPage      from './pages/ReportsPage';
import UsersPage        from './pages/UsersPage';
import CashSessionPage  from './pages/CashSessionPage';
import CustomersPage    from './pages/CustomersPage';
import SuppliersPage    from './pages/SuppliersPage';
import SettingsPage     from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

// ── Guards ────────────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireCompany({ children }: { children: React.ReactNode }) {
  const { user, company } = useAppStore();
  // User logged in but has no company → onboarding
  if (user && !company) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAppStore();
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ── Boot: restore session ─────────────────────────────────────
function AppBoot({ children }: { children: React.ReactNode }) {
  const { setUser, setCompany, setBranch, user } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    const restore = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && !user) {
          const profile = await getCurrentUser();
          if (profile) {
            setUser(profile);
            setCompany(profile.company   ?? null);
            setBranch(profile.branch     ?? null);
          }
        }
      } catch (e) {
        console.error('Session restore:', e);
      } finally {
        setLoading(false);
      }
    };
    restore();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') { setUser(null); setCompany(null); setBranch(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0e', color: '#6b6a65', gap: 12, fontFamily: 'sans-serif', fontSize: 14,
    }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
      Iniciando…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  return <>{children}</>;
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppBoot>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Onboarding — autenticado pero sin empresa */}
            <Route path="/onboarding" element={
              <RequireAuth>
                <OnboardingWizard />
              </RequireAuth>
            } />

            {/* App protegida */}
            <Route element={
              <RequireAuth>
                <RequireCompany>
                  <AppLayout />
                </RequireCompany>
              </RequireAuth>
            }>
              <Route index                element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"    element={<DashboardPage />} />
              <Route path="/pos"          element={<POSPage />} />
              <Route path="/inventory"    element={<InventoryPage />} />
              <Route path="/customers"    element={<CustomersPage />} />
              <Route path="/suppliers"    element={<SuppliersPage />} />
              <Route path="/reports"      element={<ReportsPage />} />
              <Route path="/caja"         element={<CashSessionPage />} />
              <Route path="/settings"     element={<SettingsPage />} />
              <Route path="/users"        element={
                <RequireRole roles={['admin','superadmin','manager']}>
                  <UsersPage />
                </RequireRole>
              } />
              <Route path="*"             element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </AppBoot>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a1f', color: '#e8e6e1',
            border: '1px solid #2a2a30', borderRadius: 10, fontSize: 13,
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#0f2d1a' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1a0505' } },
        }}
      />
    </QueryClientProvider>
  );
}
