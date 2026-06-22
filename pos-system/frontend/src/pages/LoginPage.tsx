import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Store, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase, getCurrentUser } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { setMonitoringUser } from '../../lib/monitoring';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser, setCompany, setBranch } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      if (import.meta.env.DEV) {
        console.debug('Supabase auth login result:', {
          user: authData?.user,
          session: authData?.session,
        });
      }

      const userData = await getCurrentUser();
      if (!userData) throw new Error('No se encontró perfil de usuario');

      setUser(userData);
      setCompany(userData.company);
      setBranch(userData.branch ?? null);

      // Identificar usuario en Sentry
      setMonitoringUser({
        id:        userData.id,
        email:     userData.email,
        name:      userData.name,
        companyId: userData.company_id,
        role:      userData.role,
      }).catch(() => {});

      toast.success(`Bienvenido, ${userData.name}`);
      navigate('/pos');
    } catch (err: any) {
      const message = err.message || String(err);
      setError(message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos'
        : message === 'Failed to fetch'
          ? 'No se pudo conectar al servicio de perfiles. Comprueba que la función de Supabase esté desplegada.'
          : message.includes('Cannot coerce the result to a single JSON object')
            ? 'No se pudo recuperar el perfil del usuario. Contacta a tu administrador.'
            : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      <style>{loginStyles}</style>

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-mark"><Store size={22}/></div>
          <span>POS System</span>
        </div>

        <div className="login-head">
          <h1>Iniciar sesión</h1>
          <p>Ingresa tus credenciales para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cajero@tienda.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label>Contraseña</label>
            <div className="pass-wrap">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowPass(s => !s)} className="toggle-pass">
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={14}/>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="login-btn">
            {loading ? <><Loader2 size={16} className="spin"/>Ingresando…</> : 'Ingresar'}
          </button>
        </form>

        <p className="login-footer">
          ¿Problemas para ingresar? Contacta a tu administrador.
        </p>
      </div>

      {/* Background pattern */}
      <div className="login-bg" aria-hidden/>
    </div>
  );
}

const loginStyles = `
  .login-root {
    min-height: 100vh;
    background: #0a0a0e;
    display: flex; align-items: center; justify-content: center;
    font-family: 'DM Sans', system-ui, sans-serif;
    padding: 20px;
    position: relative;
    overflow: hidden;
  }
  .login-bg {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 20% 20%, var(--c-primary)15 0%, transparent 60%),
      radial-gradient(ellipse 60% 60% at 80% 80%, #34d39910 0%, transparent 60%);
    pointer-events: none;
  }
  .login-card {
    width: 100%; max-width: 380px;
    background: #131318;
    border: 1px solid #1e1e25;
    border-radius: 20px;
    padding: 36px 32px;
    display: flex; flex-direction: column; gap: 24px;
    position: relative; z-index: 1;
    box-shadow: 0 24px 80px rgba(0,0,0,.5);
  }
  .login-logo {
    display: flex; align-items: center; gap: 10px;
    font-size: 18px; font-weight: 700; color: #e8e6e1;
  }
  .logo-mark {
    width: 40px; height: 40px; border-radius: 10px;
    background: var(--c-primary); display: flex; align-items: center; justify-content: center;
    color: #fff;
  }
  .login-head { display: flex; flex-direction: column; gap: 4px; }
  .login-head h1 { font-size: 22px; font-weight: 600; color: #e8e6e1; }
  .login-head p  { font-size: 13px; color: #4a4a55; }

  .login-form { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 12px; color: #6b6a65; font-weight: 500; }
  .field input {
    background: #0f0f11; border: 1px solid #2a2a30; border-radius: 10px;
    padding: 11px 14px; color: #e8e6e1; font-size: 14px; outline: none;
    transition: border-color .15s; width: 100%;
  }
  .field input:focus { border-color: var(--c-primary); }
  .field input::placeholder { color: #2a2a38; }
  .pass-wrap { position: relative; }
  .pass-wrap input { padding-right: 42px; }
  .toggle-pass {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: #4a4a55; cursor: pointer; padding: 2px;
    transition: color .1s;
  }
  .toggle-pass:hover { color: #9997a0; }

  .login-error {
    display: flex; align-items: center; gap: 8px;
    background: #1a0505; border: 1px solid #3b0000; border-radius: 8px;
    padding: 10px 12px; font-size: 13px; color: #f87171;
  }

  .login-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--c-primary); border: none; border-radius: 10px;
    padding: 13px; color: #fff; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all .15s; margin-top: 4px;
  }
  .login-btn:hover:not(:disabled) { background: var(--c-primary-hover); }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .login-footer { font-size: 12px; color: #2a2a38; text-align: center; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
