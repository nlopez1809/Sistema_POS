// Agregar tabla expenses al schema SQL:
// CREATE TABLE IF NOT EXISTS expenses (
//   id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   company_id  UUID NOT NULL REFERENCES companies(id),
//   branch_id   UUID NOT NULL REFERENCES branches(id),
//   session_id  UUID REFERENCES cash_sessions(id),
//   user_id     UUID NOT NULL REFERENCES users(id),
//   category    TEXT NOT NULL,
//   description TEXT NOT NULL,
//   amount      NUMERIC(12,2) NOT NULL,
//   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );

import React, { useState } from 'react';
import {
  Receipt, Plus, X, Save, Loader2, Trash2, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

const EXPENSE_CATEGORIES = [
  'Servicio / delivery',
  'Suministros de limpieza',
  'Útiles de oficina',
  'Transporte',
  'Mantenimiento',
  'Alimentación',
  'Comunicaciones',
  'Servicios básicos',
  'Otro',
];

interface Expense {
  id:          string;
  company_id:  string;
  branch_id:   string;
  session_id?: string;
  user_id:     string;
  category:    string;
  description: string;
  amount:      number;
  created_at:  string;
}

// ── New Expense Modal ─────────────────────────────────────────
function ExpenseModal({ sessionId, onClose }: { sessionId?: string; onClose: () => void }) {
  const { company, branch, user } = useAppStore();
  const qc = useQueryClient();
  const [category,    setCategory]    = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount,      setAmount]      = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !branch || !user) throw new Error('Sin sesión');
      const { error } = await supabase.from('expenses').insert({
        company_id:  company.id,
        branch_id:   branch.id,
        session_id:  sessionId ?? null,
        user_id:     user.id,
        category,
        description: description.trim(),
        amount:      parseFloat(amount),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Gasto registrado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isValid = description.trim().length > 0 && parseFloat(amount) > 0;

  return (
    <div className="exp-overlay" onClick={onClose}>
      <div className="exp-modal" onClick={e => e.stopPropagation()}>
        <div className="exp-modal-header">
          <Receipt size={16} color="#f59e0b" />
          <h2>Registrar gasto</h2>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="exp-modal-body">
          <div className="form-group">
            <label>Categoría</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Descripción *</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Pago de mensajero, compra de bolsas…"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Monto (Bs) *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.50"
            />
          </div>
        </div>
        <div className="exp-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending} className="btn-warning">
            {mutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Guardar gasto
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Expenses Panel (embeddable in CashSessionPage) ────────────
export default function ExpensesPanel({ sessionId }: { sessionId?: string }) {
  const { company, branch } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const qc = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', company?.id, branch?.id, sessionId],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('*')
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false });
      if (sessionId) q = q.eq('session_id', sessionId);
      else           q = q.eq('branch_id', branch!.id).limit(50);
      const { data, error } = await q;
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!company?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Gasto eliminado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);

  return (
    <div className="exp-panel">
      <style>{expStyles}</style>

      <div className="exp-header">
        <button onClick={() => setCollapsed(c => !c)} className="exp-collapse-btn">
          <Receipt size={16} color="#f59e0b" />
          <span>Gastos del turno</span>
          {totalExpenses > 0 && (
            <span className="exp-total-badge">{fmt(totalExpenses)}</span>
          )}
          <ChevronDown size={14} className={collapsed ? 'rotated' : ''} />
        </button>
        <button onClick={() => setShowModal(true)} className="btn-warning-sm">
          <Plus size={13} /> Nuevo gasto
        </button>
      </div>

      {!collapsed && (
        <div className="exp-body">
          {isLoading ? (
            <div className="exp-loading"><Loader2 size={16} className="spin" /> Cargando…</div>
          ) : expenses.length === 0 ? (
            <div className="exp-empty">
              <Receipt size={28} strokeWidth={1} color="#2a2a38" />
              <p>Sin gastos registrados en este turno</p>
            </div>
          ) : (
            <>
              <div className="exp-list">
                {expenses.map(e => (
                  <div key={e.id} className="exp-row">
                    <div className="exp-row-left">
                      <span className="exp-category">{e.category}</span>
                      <span className="exp-description">{e.description}</span>
                      <span className="exp-time">
                        {format(new Date(e.created_at), 'HH:mm', { locale: es })}
                      </span>
                    </div>
                    <div className="exp-row-right">
                      <span className="exp-amount">-{fmt(e.amount)}</span>
                      <button
                        onClick={() => deleteMutation.mutate(e.id)}
                        className="exp-delete-btn"
                        title="Eliminar gasto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="exp-summary-row">
                <span>Total gastos del turno</span>
                <span className="exp-total">{fmt(totalExpenses)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {showModal && (
        <ExpenseModal
          sessionId={sessionId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

const expStyles = `
  .exp-panel { background:#131318; border:1px solid #1e1e25; border-radius:12px; overflow:hidden; }
  .exp-header { display:flex; align-items:center; gap:8px; padding:12px 16px; border-bottom:1px solid #1e1e25; }
  .exp-collapse-btn { display:flex; align-items:center; gap:8px; background:none; border:none; color:#9997a0; font-size:13px; font-weight:500; cursor:pointer; flex:1; text-align:left; }
  .exp-collapse-btn .rotated { transform:rotate(180deg); }
  .exp-total-badge { background:#1a1000; border:1px solid #d97706; border-radius:20px; padding:2px 8px; font-size:11px; color:#d97706; font-weight:600; }
  .btn-warning-sm { display:flex; align-items:center; gap:5px; background:#1a1000; border:1px solid #d97706; border-radius:7px; color:#d97706; font-size:12px; padding:5px 10px; cursor:pointer; transition:all .1s; white-space:nowrap; }
  .btn-warning-sm:hover { background:#d9770622; }

  .exp-body { padding:12px 16px; display:flex; flex-direction:column; gap:10px; }
  .exp-loading, .exp-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px; color:#3a3a42; font-size:12px; }
  .exp-loading { flex-direction:row; justify-content:center; }

  .exp-list { display:flex; flex-direction:column; gap:4px; }
  .exp-row { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; gap:12px; transition:background .1s; }
  .exp-row:hover { background:#1a1a1f; }
  .exp-row-left { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
  .exp-category { font-size:10px; color:#4a4a55; text-transform:uppercase; letter-spacing:.04em; }
  .exp-description { font-size:13px; color:#e8e6e1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .exp-time { font-size:11px; color:#3a3a42; }
  .exp-row-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .exp-amount { font-size:14px; font-weight:600; color:#f87171; }
  .exp-delete-btn { background:none; border:none; color:#3a3a42; cursor:pointer; padding:3px; display:flex; align-items:center; transition:color .1s; }
  .exp-delete-btn:hover { color:#ef4444; }

  .exp-summary-row { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#1a1000; border-radius:8px; font-size:13px; color:#9997a0; margin-top:4px; }
  .exp-total { font-weight:700; color:#f87171; font-size:15px; }

  /* Modal */
  .exp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); display:flex; align-items:center; justify-content:center; z-index:100; }
  .exp-modal { background:#1a1a1f; border:1px solid #2a2a30; border-radius:16px; width:400px; max-width:95vw; display:flex; flex-direction:column; }
  .exp-modal-header { display:flex; align-items:center; gap:8px; padding:18px 22px 14px; border-bottom:1px solid #1e1e25; }
  .exp-modal-header h2 { font-size:16px; font-weight:600; flex:1; }
  .exp-modal-header button { background:none; border:none; color:#6b6a65; cursor:pointer; }
  .exp-modal-body { padding:18px 22px; display:flex; flex-direction:column; gap:14px; }
  .exp-modal-footer { padding:14px 22px; border-top:1px solid #1e1e25; display:flex; justify-content:flex-end; gap:8px; }
  .form-group { display:flex; flex-direction:column; gap:5px; }
  .form-group label { font-size:12px; color:#6b6a65; }
  .form-group input, .form-group select { background:#131318; border:1px solid #2a2a30; border-radius:8px; padding:9px 12px; color:#e8e6e1; font-size:13px; outline:none; transition:border-color .15s; width:100%; }
  .form-group input:focus, .form-group select:focus { border-color:#f59e0b; }
  .form-group select option { background:#1a1a1f; }
  .btn-ghost { display:flex; align-items:center; gap:6px; background:none; border:1px solid #2a2a30; border-radius:8px; color:#9997a0; font-size:13px; padding:8px 14px; cursor:pointer; }
  .btn-warning { display:flex; align-items:center; gap:6px; background:#d97706; border:none; border-radius:8px; color:#fff; font-size:13px; font-weight:500; padding:8px 14px; cursor:pointer; transition:background .15s; }
  .btn-warning:hover:not(:disabled) { background:#b45309; }
  .btn-warning:disabled { opacity:0.5; cursor:not-allowed; }
  .spin { animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
`;
