import React, { useState } from 'react';
import {
  Users, Plus, Edit2, X, Save, Loader2,
  Shield, UserCheck, UserX, Search
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { User, UserRole } from '../../../shared/types';

// ── Role config ───────────────────────────────────────────────
const ROLES: { value: UserRole; label: string; color: string; desc: string }[] = [
  { value: 'admin',    label: 'Administrador', color: '#5c6df0', desc: 'Acceso completo excepto configuración de empresa' },
  { value: 'manager',  label: 'Gerente',       color: '#f59e0b', desc: 'Ventas, inventario y reportes' },
  { value: 'cashier',  label: 'Cajero',        color: '#34d399', desc: 'Solo acceso a la pantalla de caja' },
];

const roleColor = (r: UserRole) => ROLES.find(x => x.value === r)?.color ?? '#6b6a65';
const roleLabel = (r: UserRole) => ROLES.find(x => x.value === r)?.label ?? r;

// ── User Modal ────────────────────────────────────────────────
function UserModal({
  user: editUser,
  companyId,
  onClose,
}: {
  user?: User;
  companyId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!editUser;

  const [form, setForm] = useState({
    name:      editUser?.name ?? '',
    email:     editUser?.email ?? '',
    role:      editUser?.role ?? 'cashier' as UserRole,
    password:  '',
    is_active: editUser?.is_active ?? true,
    branch_id: editUser?.branch_id ?? null,
  });
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  // Load branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        // Update profile
        const { error } = await supabase
          .from('users')
          .update({ name: form.name, role: form.role, is_active: form.is_active, branch_id: form.branch_id })
          .eq('id', editUser!.id);
        if (error) throw error;
      } else {
        // Create auth user + profile via Supabase Admin (requires service role)
        // In production, call a backend Edge Function to create the user safely
        // For now, create via auth signup
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
        });
        if (authErr) throw authErr;

        const { error: profileErr } = await supabase.from('users').insert({
          company_id: companyId,
          auth_id: authData.user?.id,
          name: form.name,
          email: form.email,
          role: form.role,
          branch_id: form.branch_id,
          is_active: true,
        });
        if (profileErr) throw profileErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isValid = form.name && form.email && (isEdit || (form.password.length >= 8));

  return (
    <div className="usr-overlay" onClick={onClose}>
      <div className="usr-modal" onClick={e => e.stopPropagation()}>
        <div className="usr-modal-header">
          <h2>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="usr-modal-body">
          <div className="form-group">
            <label>Nombre completo *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="María López"/>
          </div>
          <div className="form-group">
            <label>Correo electrónico *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="cajero@tienda.com" disabled={isEdit}/>
          </div>
          {!isEdit && (
            <div className="form-group">
              <label>Contraseña * (mínimo 8 caracteres)</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                placeholder="••••••••" minLength={8}/>
            </div>
          )}
          <div className="form-group">
            <label>Rol *</label>
            <div className="role-selector">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set('role', r.value)}
                  className={`role-option ${form.role === r.value ? 'selected' : ''}`}
                  style={form.role === r.value ? { borderColor: r.color, background: r.color + '15' } : {}}
                >
                  <Shield size={14} color={form.role === r.value ? r.color : '#4a4a55'}/>
                  <div>
                    <div className="role-name" style={form.role === r.value ? { color: r.color } : {}}>{r.label}</div>
                    <div className="role-desc">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Sucursal</label>
            <select value={form.branch_id ?? ''} onChange={e => set('branch_id', e.target.value || null)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #404249', background: '#1a1a1f', color: '#fff' }}>
              <option value="">Sin asignar</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {isEdit && (
            <label className="toggle-label">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}/>
              <span>Usuario activo</span>
            </label>
          )}
        </div>
        <div className="usr-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? <><Loader2 size={14} className="spin"/>Guardando…</> : <><Save size={14}/>Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Users Page ───────────────────────────────────────────
export default function UsersPage() {
  const { company, user: currentUser } = useAppStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | undefined>();
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', company!.id)
        .order('name');
      if (error) throw error;
      return data as User[];
    },
    enabled: !!company?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('users').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  return (
    <div className="usr-layout">
      <style>{usrStyles}</style>

      <div className="usr-header">
        <div className="usr-title"><Users size={20}/><h1>Usuarios</h1><span className="usr-count">{users.length}</span></div>
        {canManage && (
          <button onClick={() => { setEditUser(undefined); setShowModal(true); }} className="btn-primary">
            <Plus size={16}/> Nuevo usuario
          </button>
        )}
      </div>

      {/* Role summary */}
      <div className="role-summary">
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r.value).length;
          return (
            <div key={r.value} className="role-summary-card">
              <Shield size={14} color={r.color}/>
              <span className="role-summary-label">{r.label}</span>
              <span className="role-summary-count" style={{ color: r.color }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="usr-search">
        <Search size={14}/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o correo…"/>
        {search && <button onClick={() => setSearch('')}><X size={12}/></button>}
      </div>

      {/* Users grid */}
      {isLoading ? (
        <div className="usr-loading"><Loader2 size={22} className="spin"/> Cargando…</div>
      ) : (
        <div className="users-grid">
          {filtered.map(u => (
            <div key={u.id} className={`user-card ${!u.is_active ? 'inactive' : ''}`}>
              <div className="user-card-top">
                <div className="user-card-avatar" style={{ background: roleColor(u.role) + '22', color: roleColor(u.role) }}>
                  {u.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="user-card-info">
                  <span className="user-card-name">{u.name}</span>
                  <span className="user-card-email">{u.email}</span>
                </div>
                {canManage && (
                  <div className="user-card-actions">
                    <button onClick={() => { setEditUser(u); setShowModal(true); }} className="icon-btn" title="Editar">
                      <Edit2 size={13}/>
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        className={`icon-btn ${u.is_active ? 'warn' : 'success'}`}
                        title={u.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {u.is_active ? <UserX size={13}/> : <UserCheck size={13}/>}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="user-card-bottom">
                <span className="role-badge" style={{ background: roleColor(u.role) + '20', color: roleColor(u.role) }}>
                  <Shield size={10}/>{roleLabel(u.role)}
                </span>
                <span className={`status-pill ${u.is_active ? 'active' : 'inactive'}`}>
                  {u.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <UserModal
          user={editUser}
          companyId={company!.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

const usrStyles = `
  .usr-layout {
    padding: 24px; background: #0f0f11; min-height: 100%;
    color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif;
    display: flex; flex-direction: column; gap: 18px;
  }
  .usr-header { display: flex; align-items: center; justify-content: space-between; }
  .usr-title { display: flex; align-items: center; gap: 10px; }
  .usr-title h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .usr-count { font-size: 12px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 20px; padding: 2px 10px; color: #6b6a65; }

  .btn-primary { display: flex; align-items: center; gap: 6px; background: #5c6df0; border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background: #4f60e6; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }

  .role-summary { display: flex; gap: 10px; flex-wrap: wrap; }
  .role-summary-card {
    display: flex; align-items: center; gap: 8px;
    background: #131318; border: 1px solid #1e1e25; border-radius: 10px;
    padding: 10px 16px; font-size: 13px;
  }
  .role-summary-label { color: #6b6a65; }
  .role-summary-count { font-weight: 700; font-size: 16px; }

  .usr-search {
    display: flex; align-items: center; gap: 8px;
    background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; padding: 0 12px;
    max-width: 400px; color: #6b6a65;
  }
  .usr-search input { background: none; border: none; color: #e8e6e1; font-size: 13px; padding: 9px 0; outline: none; flex: 1; }
  .usr-search input::placeholder { color: #3a3a42; }
  .usr-search button { background: none; border: none; color: #4a4a55; cursor: pointer; }

  .usr-loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: #4a4a55; padding: 60px; }

  .users-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .user-card {
    background: #131318; border: 1px solid #1e1e25; border-radius: 12px; padding: 16px;
    display: flex; flex-direction: column; gap: 12px; transition: border-color .15s;
  }
  .user-card:hover { border-color: #2a2a35; }
  .user-card.inactive { opacity: 0.5; }

  .user-card-top { display: flex; align-items: center; gap: 12px; }
  .user-card-avatar {
    width: 40px; height: 40px; border-radius: 10px; font-size: 14px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .user-card-info { flex: 1; min-width: 0; }
  .user-card-name { display: block; font-size: 14px; font-weight: 500; color: #e8e6e1; }
  .user-card-email { display: block; font-size: 12px; color: #4a4a55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .user-card-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .icon-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #6b6a65; cursor: pointer; padding: 5px; display: flex; align-items: center; transition: all .1s; }
  .icon-btn:hover { border-color: #5c6df0; color: #a5b4fc; }
  .icon-btn.warn:hover { border-color: #ef4444; color: #ef4444; }
  .icon-btn.success:hover { border-color: #22c55e; color: #22c55e; }

  .user-card-bottom { display: flex; align-items: center; justify-content: space-between; }
  .role-badge { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; }
  .status-pill { font-size: 11px; padding: 2px 9px; border-radius: 20px; }
  .status-pill.active { background: #0f2d1a; color: #22c55e; }
  .status-pill.inactive { background: #1a1a1f; color: #4a4a55; }

  /* Modal */
  .usr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .usr-modal { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 16px; width: 460px; max-width: 95vw; display: flex; flex-direction: column; }
  .usr-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #1e1e25; }
  .usr-modal-header h2 { font-size: 16px; font-weight: 600; }
  .usr-modal-header button { background: none; border: none; color: #6b6a65; cursor: pointer; }
  .usr-modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
  .usr-modal-footer { padding: 16px 24px; border-top: 1px solid #1e1e25; display: flex; justify-content: flex-end; gap: 8px; }

  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 12px; color: #6b6a65; }
  .form-group input {
    background: #131318; border: 1px solid #2a2a30; border-radius: 8px;
    padding: 9px 12px; color: #e8e6e1; font-size: 13px; outline: none; transition: border-color .15s;
  }
  .form-group input:focus { border-color: #5c6df0; }
  .form-group input:disabled { opacity: 0.4; cursor: not-allowed; }

  .role-selector { display: flex; flex-direction: column; gap: 6px; }
  .role-option {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 12px; background: #131318; border: 1px solid #2a2a30; border-radius: 8px;
    cursor: pointer; text-align: left; transition: all .1s;
  }
  .role-option:hover { border-color: #3a3a45; }
  .role-option.selected { }
  .role-name { font-size: 13px; font-weight: 500; color: #9997a0; }
  .role-desc { font-size: 11px; color: #4a4a55; margin-top: 2px; }

  .toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #9997a0; }
  .toggle-label input[type=checkbox] { accent-color: #5c6df0; width: 15px; height: 15px; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
