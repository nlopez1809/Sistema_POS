import React, { useState } from 'react';
import {
  Settings, Building2, MapPin, Save, Loader2,
  Globe, DollarSign, Bell, Shield, Palette, CheckCircle2
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

type Tab = 'company' | 'branches' | 'preferences' | 'security';

// ── Company Settings ──────────────────────────────────────────
function CompanySettings({ company }: { company: any }) {
  const qc = useQueryClient();
  const { setCompany } = useAppStore();
  const [form, setForm] = useState({
    name: company?.name ?? '',
    ruc: company?.ruc ?? '',
    address: company?.address ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    currency: company?.currency ?? 'BOB',
    timezone: company?.timezone ?? 'America/La_Paz',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('companies').update(form).eq('id', company.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCompany(data);
      qc.invalidateQueries({ queryKey: ['company'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currencies = [
    { code: 'BOB', label: 'Boliviano (Bs)' },
    { code: 'USD', label: 'Dólar americano ($)' },
    { code: 'PEN', label: 'Sol peruano (S/)' },
    { code: 'COP', label: 'Peso colombiano ($)' },
    { code: 'ARS', label: 'Peso argentino ($)' },
    { code: 'MXN', label: 'Peso mexicano ($)' },
    { code: 'CLP', label: 'Peso chileno ($)' },
  ];

  const timezones = [
    'America/La_Paz', 'America/Lima', 'America/Bogota',
    'America/Buenos_Aires', 'America/Santiago', 'America/Mexico_City',
    'America/Caracas', 'America/Guayaquil',
  ];

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <Building2 size={16} />
        <div>
          <h3>Datos de la empresa</h3>
          <p>Información que aparece en tus tickets y documentos</p>
        </div>
      </div>

      <div className="settings-form">
        <div className="form-group full">
          <label>Nombre de la empresa *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mi Tienda SRL" />
        </div>
        <div className="form-group">
          <label>RUC / NIT</label>
          <input value={form.ruc} onChange={e => set('ruc', e.target.value)} placeholder="1234567" />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+591 2 2000000" />
        </div>
        <div className="form-group full">
          <label>Correo electrónico</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="info@mitienda.com" />
        </div>
        <div className="form-group full">
          <label>Dirección</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Av. Principal #123" />
        </div>
        <div className="form-group">
          <label><DollarSign size={11} /> Moneda</label>
          <select value={form.currency} onChange={e => set('currency', e.target.value)}>
            {currencies.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label><Globe size={11} /> Zona horaria</label>
          <select value={form.timezone} onChange={e => set('timezone', e.target.value)}>
            {timezones.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '')}</option>)}
          </select>
        </div>

        {/* Plan badge */}
        <div className="plan-badge-wrap full">
          <div className="plan-badge">
            <Shield size={14} color="#5c6df0" />
            <span>Plan actual: <strong>{company?.plan?.toUpperCase()}</strong></span>
            <a href="#upgrade" className="upgrade-link">Mejorar plan →</a>
          </div>
        </div>

        <div className="form-actions full">
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="btn-primary">
            {mutation.isPending
              ? <><Loader2 size={14} className="spin" />Guardando…</>
              : saved
                ? <><CheckCircle2 size={14} />Guardado</>
                : <><Save size={14} />Guardar cambios</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Branches Settings ─────────────────────────────────────────
function BranchesSettings({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('branches').select('*').eq('company_id', companyId).order('name');
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from('branches').update(form).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('branches').insert({ ...form, company_id: companyId, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success(editId ? 'Sucursal actualizada' : 'Sucursal creada');
      setEditId(null); setNewBranch(false); setForm({ name: '', address: '', phone: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (b: any) => { setEditId(b.id); setNewBranch(false); setForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' }); };
  const startNew  = () => { setEditId(null); setNewBranch(true); setForm({ name: '', address: '', phone: '' }); };
  const cancel    = () => { setEditId(null); setNewBranch(false); };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <MapPin size={16} />
        <div>
          <h3>Sucursales</h3>
          <p>Gestiona los puntos de venta de tu empresa</p>
        </div>
        <button onClick={startNew} className="btn-primary sm">+ Nueva sucursal</button>
      </div>

      {isLoading ? <div className="settings-loading"><Loader2 size={16} className="spin" /></div> : (
        <div className="branches-list">
          {branches.map((b: any) => (
            <div key={b.id} className={`branch-row ${editId === b.id ? 'editing' : ''}`}>
              {editId === b.id ? (
                <div className="branch-edit-form">
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre" />
                  <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Dirección" />
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Teléfono" />
                  <div className="branch-edit-actions">
                    <button onClick={cancel} className="btn-ghost sm">Cancelar</button>
                    <button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="btn-primary sm">
                      {saveMutation.isPending ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="branch-info">
                    <span className="branch-name"><MapPin size={13} />{b.name}</span>
                    {b.address && <span className="branch-meta">{b.address}</span>}
                    {b.phone && <span className="branch-meta">{b.phone}</span>}
                  </div>
                  <div className="branch-actions">
                    <span className={`branch-status ${b.is_active ? 'active' : 'inactive'}`}>{b.is_active ? 'Activa' : 'Inactiva'}</span>
                    <button onClick={() => startEdit(b)} className="action-btn"><Settings size={13} /></button>
                  </div>
                </>
              )}
            </div>
          ))}

          {newBranch && (
            <div className="branch-row editing">
              <div className="branch-edit-form">
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre de la sucursal" autoFocus />
                <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Dirección" />
                <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Teléfono" />
                <div className="branch-edit-actions">
                  <button onClick={cancel} className="btn-ghost sm">Cancelar</button>
                  <button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="btn-primary sm">
                    {saveMutation.isPending ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Crear
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Preferences ───────────────────────────────────────────────
function PreferencesSettings() {
  const [prefs, setPrefs] = useState({
    printOnSale:     localStorage.getItem('pref_print')           !== 'false',
    askCustomer:     localStorage.getItem('pref_askCustomer')     === 'true',
    taxRate:         localStorage.getItem('pref_taxRate')         ?? '0',
    taxMode:         localStorage.getItem('pref_taxMode')         ?? 'included',
    lowStockAlert:   localStorage.getItem('pref_lowStockAlert')   !== 'false',
    loyaltyEnabled:  localStorage.getItem('pref_loyaltyEnabled')  !== 'false',
    loyaltyEarnRate: localStorage.getItem('pref_loyaltyEarnRate') ?? '10',
    loyaltyRedeemRate: localStorage.getItem('pref_loyaltyRedeemRate') ?? '0.50',
    loyaltyMinRedeem:  localStorage.getItem('pref_loyaltyMinRedeem')  ?? '10',
  });

  const save = (k: string, v: string | boolean) => {
    const val = String(v);
    localStorage.setItem(`pref_${k}`, val);
    setPrefs(p => ({ ...p, [k]: typeof v === 'boolean' ? v : val }));
    toast.success('Preferencia guardada');
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <Palette size={16} />
        <div><h3>Preferencias</h3><p>Personaliza el comportamiento del sistema</p></div>
      </div>

      <div className="prefs-list">
        {[
          { key: 'printOnSale',   label: 'Imprimir ticket automáticamente al cobrar', type: 'toggle' },
          { key: 'askCustomer',   label: 'Preguntar cliente en cada venta',            type: 'toggle' },
          { key: 'lowStockAlert', label: 'Mostrar alertas de stock bajo en el POS',   type: 'toggle' },
        ].map(({ key, label }) => (
          <div key={key} className="pref-row">
            <span className="pref-label">{label}</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={!!prefs[key as keyof typeof prefs]}
                onChange={e => save(key, e.target.checked)}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </label>
          </div>
        ))}

        {/* IVA */}
        <div className="prefs-section-divider">Impuestos (IVA)</div>
        <div className="pref-row">
          <span className="pref-label">Tasa de IVA (%)</span>
          <input type="number" value={prefs.taxRate} onChange={e => save('taxRate', e.target.value)}
            className="pref-input" min="0" max="30" step="0.5" placeholder="0" />
        </div>
        <div className="pref-row">
          <span className="pref-label">IVA en el precio</span>
          <select value={prefs.taxMode} onChange={e => save('taxMode', e.target.value)} className="pref-select">
            <option value="included">Incluido en el precio (precio IVA inc.)</option>
            <option value="added">Se suma al total (precio + IVA)</option>
          </select>
        </div>

        {/* Puntos de fidelización */}
        <div className="prefs-section-divider">Programa de puntos</div>
        <div className="pref-row">
          <span className="pref-label">Activar programa de puntos</span>
          <label className="toggle-switch">
            <input type="checkbox" checked={!!prefs.loyaltyEnabled} onChange={e => save('loyaltyEnabled', e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
        </div>
        {prefs.loyaltyEnabled && (
          <>
            <div className="pref-row">
              <span className="pref-label">
                Bs para ganar 1 punto
                <span className="pref-hint">Ej: 10 = el cliente gana 1 pto por cada Bs 10 gastados</span>
              </span>
              <input type="number" value={prefs.loyaltyEarnRate} onChange={e => save('loyaltyEarnRate', e.target.value)}
                className="pref-input" min="1" step="1" />
            </div>
            <div className="pref-row">
              <span className="pref-label">
                Bs de descuento por punto canjeado
                <span className="pref-hint">Ej: 0.50 = 1 punto = Bs 0.50 de descuento</span>
              </span>
              <input type="number" value={prefs.loyaltyRedeemRate} onChange={e => save('loyaltyRedeemRate', e.target.value)}
                className="pref-input" min="0.01" step="0.10" />
            </div>
            <div className="pref-row">
              <span className="pref-label">
                Mínimo de puntos para canjear
              </span>
              <input type="number" value={prefs.loyaltyMinRedeem} onChange={e => save('loyaltyMinRedeem', e.target.value)}
                className="pref-input" min="1" step="1" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────
export default function SettingsPage() {
  const { company } = useAppStore();
  const [tab, setTab] = useState<Tab>('company');

  const tabItems: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'company',     label: 'Empresa',      icon: Building2 },
    { id: 'branches',    label: 'Sucursales',   icon: MapPin },
    { id: 'preferences', label: 'Preferencias', icon: Palette },
    { id: 'security',    label: 'Seguridad',    icon: Shield },
  ];

  return (
    <div className="cfg-layout">
      <style>{cfgStyles}</style>

      <div className="cfg-header">
        <Settings size={20} />
        <h1>Configuración</h1>
      </div>

      <div className="cfg-tabs">
        {tabItems.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`cfg-tab ${tab === id ? 'active' : ''}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      <div className="cfg-body">
        {tab === 'company'     && <CompanySettings company={company} />}
        {tab === 'branches'    && company && <BranchesSettings companyId={company.id} />}
        {tab === 'preferences' && <PreferencesSettings />}
        {tab === 'security'    && (
          <div className="settings-section">
            <div className="settings-section-header">
              <Shield size={16} /><div><h3>Seguridad</h3><p>Configuración de acceso y permisos</p></div>
            </div>
            <div className="security-items">
              {[
                ['Autenticación', 'Supabase Auth con JWT', '✓ Activo'],
                ['Row Level Security', 'Aislamiento multi-tenant en PostgreSQL', '✓ Activo'],
                ['HTTPS', 'Cifrado en tránsito', '✓ Activo'],
                ['Backups automáticos', 'Respaldos diarios en Supabase', '✓ Activo'],
              ].map(([label, desc, status]) => (
                <div key={label} className="security-item">
                  <div>
                    <div className="security-label">{label}</div>
                    <div className="security-desc">{desc}</div>
                  </div>
                  <span className="security-status">{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const cfgStyles = `
  .cfg-layout { padding: 24px; background: #0f0f11; min-height: 100%; color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif; display: flex; flex-direction: column; gap: 20px; }
  .cfg-header { display: flex; align-items: center; gap: 10px; }
  .cfg-header h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .cfg-tabs { display: flex; gap: 2px; border-bottom: 1px solid #1e1e25; }
  .cfg-tab { display: flex; align-items: center; gap: 7px; background: none; border: none; border-bottom: 2px solid transparent; padding: 9px 16px; color: #6b6a65; font-size: 13px; cursor: pointer; margin-bottom: -1px; transition: all .15s; }
  .cfg-tab.active { color: #a5b4fc; border-bottom-color: #5c6df0; }
  .cfg-tab:hover:not(.active) { color: #e8e6e1; }
  .cfg-body { max-width: 700px; }

  .settings-section { display: flex; flex-direction: column; gap: 18px; }
  .settings-section-header { display: flex; align-items: flex-start; gap: 12px; padding-bottom: 4px; border-bottom: 1px solid #1e1e25; }
  .settings-section-header > svg { margin-top: 3px; color: #5c6df0; flex-shrink: 0; }
  .settings-section-header h3 { font-size: 15px; font-weight: 600; margin: 0 0 3px; }
  .settings-section-header p  { font-size: 12px; color: #4a4a55; margin: 0; }
  .settings-section-header .btn-primary { margin-left: auto; }

  .settings-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group.full { grid-column: 1 / -1; }
  .form-group label { font-size: 12px; color: #6b6a65; display: flex; align-items: center; gap: 4px; }
  .form-group input, .form-group select { background: #131318; border: 1px solid #2a2a30; border-radius: 8px; padding: 9px 12px; color: #e8e6e1; font-size: 13px; outline: none; transition: border-color .15s; width: 100%; }
  .form-group input:focus, .form-group select:focus { border-color: #5c6df0; }
  .form-group select option { background: #1a1a1f; }
  .plan-badge-wrap.full { grid-column: 1 / -1; }
  .plan-badge { display: flex; align-items: center; gap: 10px; background: #14141e; border: 1px solid #5c6df033; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #9997a0; }
  .plan-badge strong { color: #a5b4fc; }
  .upgrade-link { margin-left: auto; color: #5c6df0; font-size: 12px; text-decoration: none; }
  .upgrade-link:hover { color: #a5b4fc; }
  .form-actions.full { grid-column: 1 / -1; display: flex; justify-content: flex-end; }

  .btn-primary { display: flex; align-items: center; gap: 6px; background: #5c6df0; border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: all .15s; }
  .btn-primary:hover:not(:disabled) { background: #4f60e6; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary.sm { font-size: 12px; padding: 6px 12px; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }
  .btn-ghost.sm { font-size: 12px; padding: 6px 12px; }
  .action-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #6b6a65; cursor: pointer; padding: 5px 7px; transition: all .1s; display: flex; align-items: center; }
  .action-btn:hover { border-color: #5c6df0; color: #a5b4fc; }

  .settings-loading { display: flex; align-items: center; justify-content: center; padding: 30px; color: #4a4a55; }
  .branches-list { display: flex; flex-direction: column; gap: 8px; }
  .branch-row { background: #131318; border: 1px solid #1e1e25; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: border-color .1s; }
  .branch-row.editing { border-color: #5c6df044; }
  .branch-info { display: flex; flex-direction: column; gap: 4px; }
  .branch-name { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #e8e6e1; }
  .branch-meta { font-size: 11px; color: #4a4a55; }
  .branch-actions { display: flex; align-items: center; gap: 8px; }
  .branch-status { font-size: 11px; padding: 2px 9px; border-radius: 20px; }
  .branch-status.active { background: #0f2d1a; color: #22c55e; }
  .branch-status.inactive { background: #1a1a1f; color: #4a4a55; }
  .branch-edit-form { display: flex; gap: 8px; align-items: center; flex: 1; flex-wrap: wrap; }
  .branch-edit-form input { background: #0f0f11; border: 1px solid #2a2a30; border-radius: 6px; padding: 7px 10px; color: #e8e6e1; font-size: 13px; outline: none; flex: 1; min-width: 100px; }
  .branch-edit-form input:focus { border-color: #5c6df0; }
  .branch-edit-actions { display: flex; gap: 6px; }

  .prefs-list { display: flex; flex-direction: column; gap: 0; border: 1px solid #1e1e25; border-radius: 12px; overflow: hidden; }
  .pref-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #1e1e25; gap: 12px; }
  .pref-row:last-child { border-bottom: none; }
  .pref-label { font-size: 13px; color: #9997a0; display: flex; flex-direction: column; gap: 2px; }
  .pref-hint { font-size: 11px; color: #4a4a55; }
  .pref-input { background: #131318; border: 1px solid #2a2a30; border-radius: 7px; padding: 7px 10px; color: #e8e6e1; font-size: 13px; outline: none; width: 80px; text-align: right; }
  .pref-input:focus { border-color: #5c6df0; }
  .pref-select { background: #131318; border: 1px solid #2a2a30; border-radius: 7px; padding: 7px 10px; color: #e8e6e1; font-size: 12px; outline: none; max-width: 220px; }
  .pref-select:focus { border-color: #5c6df0; }
  .pref-select option { background: #1a1a1f; }
  .prefs-section-divider { padding: 8px 18px 6px; font-size: 11px; font-weight: 600; color: #4a4a55; text-transform: uppercase; letter-spacing: .06em; background: #0f0f11; border-bottom: 1px solid #1e1e25; }

  .toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .toggle-track { position: absolute; inset: 0; background: #2a2a30; border-radius: 22px; transition: background .2s; cursor: pointer; }
  .toggle-switch input:checked + .toggle-track { background: #5c6df0; }
  .toggle-thumb { position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: transform .2s; }
  .toggle-switch input:checked + .toggle-track .toggle-thumb { transform: translateX(18px); }

  .security-items { display: flex; flex-direction: column; gap: 0; border: 1px solid #1e1e25; border-radius: 12px; overflow: hidden; }
  .security-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #1e1e25; }
  .security-item:last-child { border: none; }
  .security-label { font-size: 13px; font-weight: 500; color: #e8e6e1; margin-bottom: 2px; }
  .security-desc  { font-size: 11px; color: #4a4a55; }
  .security-status { font-size: 11px; color: #22c55e; font-weight: 600; background: #0f2d1a; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
