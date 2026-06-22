import React, { useState } from 'react';
import {
  Wallet, Lock, Unlock, DollarSign, AlertTriangle,
  CheckCircle2, Loader2, X, Clock, TrendingUp
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { cashSessionsApi, salesApi } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ExpensesPanel from '../components/pos/ExpensesPanel';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

// ── Open Session Modal ────────────────────────────────────────
function OpenSessionModal({ onClose, registerId, userId }: {
  onClose: () => void; registerId: string; userId: string;
}) {
  const qc = useQueryClient();
  const { setCurrentSession } = useAppStore();
  const [amount, setAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () => cashSessionsApi.open(registerId, userId, parseFloat(amount) || 0),
    onSuccess: (session) => {
      setCurrentSession(session);
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      toast.success('Caja abierta');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-modal" onClick={e => e.stopPropagation()}>
        <div className="cs-modal-header">
          <Unlock size={18} color="#22c55e"/>
          <h2>Abrir caja</h2>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="cs-modal-body">
          <p className="cs-modal-desc">Ingresa el monto inicial de efectivo en caja para comenzar el turno.</p>
          <div className="form-group">
            <label>Fondo inicial (Bs)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              min="0"
              step="10"
            />
          </div>
          <div className="quick-amounts">
            {[0, 100, 200, 500].map(v => (
              <button key={v} onClick={() => setAmount(v.toString())} className="quick-btn">
                {v === 0 ? 'Sin fondo' : `Bs ${v}`}
              </button>
            ))}
          </div>
        </div>
        <div className="cs-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-success">
            {mutation.isPending ? <Loader2 size={14} className="spin"/> : <Unlock size={14}/>}
            Abrir caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Close Session Modal ───────────────────────────────────────
function CloseSessionModal({ session, salesTotal, onClose }: {
  session: any; salesTotal: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { setCurrentSession } = useAppStore();
  const [closing, setClosing] = useState('');
  const [notes, setNotes] = useState('');

  const expected = session.opening_amount + salesTotal;
  const closingNum = parseFloat(closing) || 0;
  const diff = closingNum - expected;

  const mutation = useMutation({
    mutationFn: () => cashSessionsApi.close(session.id, closingNum, notes),
    onSuccess: () => {
      setCurrentSession(null);
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['session-sales'] });
      toast.success('Caja cerrada exitosamente');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-modal wide" onClick={e => e.stopPropagation()}>
        <div className="cs-modal-header">
          <Lock size={18} color="#f59e0b"/>
          <h2>Cerrar caja</h2>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="cs-modal-body">
          {/* Summary */}
          <div className="close-summary">
            <div className="summary-row">
              <span>Fondo inicial</span>
              <span>{fmt(session.opening_amount)}</span>
            </div>
            <div className="summary-row">
              <span>Ventas en efectivo</span>
              <span className="positive">{fmt(salesTotal)}</span>
            </div>
            <div className="summary-row total">
              <span>Total esperado</span>
              <span>{fmt(expected)}</span>
            </div>
          </div>

          <div className="form-group">
            <label>Efectivo contado en caja (Bs)</label>
            <input
              type="number"
              value={closing}
              onChange={e => setClosing(e.target.value)}
              placeholder={expected.toFixed(2)}
              autoFocus
              min="0"
              step="10"
            />
          </div>

          {closing && (
            <div className={`diff-card ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'exact'}`}>
              {diff === 0
                ? <><CheckCircle2 size={16}/> Cuadre exacto</>
                : diff > 0
                  ? <><TrendingUp size={16}/> Sobrante: {fmt(Math.abs(diff))}</>
                  : <><AlertTriangle size={16}/> Faltante: {fmt(Math.abs(diff))}</>
              }
            </div>
          )}

          <div className="form-group">
            <label>Notas del cierre (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones del turno…"
            />
          </div>
        </div>
        <div className="cs-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!closing || mutation.isPending}
            className="btn-danger"
          >
            {mutation.isPending ? <Loader2 size={14} className="spin"/> : <Lock size={14}/>}
            Cerrar caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Cash Session Page ────────────────────────────────────
export default function CashSessionPage() {
  const { company, branch, user, currentSession, setCurrentSession } = useAppStore();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const qc = useQueryClient();

  // Get cash register for this branch
  const { data: register } = useQuery({
    queryKey: ['cash-register', branch?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('branch_id', branch!.id)
        .eq('is_active', true)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!branch?.id,
  });

  // Get current open session
  const { data: session } = useQuery({
    queryKey: ['cash-session', register?.id],
    queryFn: async () => {
      const s = await cashSessionsApi.getCurrent(register!.id);
      if (s && !currentSession) setCurrentSession(s);
      return s;
    },
    enabled: !!register?.id,
    refetchInterval: 60_000,
  });

  const activeSession = session ?? currentSession;

  // Sales in current session
  const { data: sessionSales = [] } = useQuery({
    queryKey: ['session-sales', activeSession?.id],
    queryFn: () => salesApi.list(company!.id, { limit: 200 }),
    enabled: !!activeSession?.id && !!company?.id,
    select: (data) => data.filter((s: any) =>
      s.cash_session_id === activeSession?.id && s.status === 'completed'
    ),
  });

  // Session stats
  const cashSales    = sessionSales.filter((s: any) => s.payment_method === 'cash').reduce((a: number, s: any) => a + s.total, 0);
  const cardSales    = sessionSales.filter((s: any) => s.payment_method === 'card').reduce((a: number, s: any) => a + s.total, 0);
  const qrSales      = sessionSales.filter((s: any) => s.payment_method === 'qr').reduce((a: number, s: any) => a + s.total, 0);
  const totalRevenue = sessionSales.reduce((a: number, s: any) => a + s.total, 0);

  // Past sessions
  const { data: pastSessions = [] } = useQuery({
    queryKey: ['past-sessions', register?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_sessions')
        .select('*, user:users(name)')
        .eq('cash_register_id', register!.id)
        .eq('status', 'closed')
        .order('opened_at', { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!register?.id,
  });

  const openedAt = activeSession ? new Date(activeSession.opened_at) : null;

  return (
    <div className="cs-layout">
      <style>{csStyles}</style>

      <div className="cs-header">
        <div className="cs-title">
          <Wallet size={20}/>
          <h1>Caja</h1>
          <span className={`session-badge ${activeSession ? 'open' : 'closed'}`}>
            {activeSession ? 'Abierta' : 'Cerrada'}
          </span>
        </div>
        <div className="cs-actions">
          {!activeSession ? (
            <button onClick={() => setShowOpen(true)} className="btn-success">
              <Unlock size={15}/> Abrir caja
            </button>
          ) : (
            <button onClick={() => setShowClose(true)} className="btn-danger-outline">
              <Lock size={15}/> Cerrar caja
            </button>
          )}
        </div>
      </div>

      {/* Active session info */}
      {activeSession ? (
        <>
          <div className="session-info-bar">
            <div className="session-info-item">
              <Clock size={13}/>
              <span>Abierta {openedAt ? format(openedAt, "dd MMM yyyy 'a las' HH:mm", { locale: es }) : '—'}</span>
            </div>
            <div className="session-info-item">
              <DollarSign size={13}/>
              <span>Fondo inicial: {fmt(activeSession.opening_amount)}</span>
            </div>
            <div className="session-info-item">
              <span>{sessionSales.length} ventas en este turno</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="stats-grid">
            <div className="stat-card highlight">
              <span className="stat-label">Total del turno</span>
              <span className="stat-value">{fmt(totalRevenue)}</span>
              <span className="stat-sub">{sessionSales.length} ventas</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Efectivo</span>
              <span className="stat-value cash">{fmt(cashSales)}</span>
              <span className="stat-sub">en caja</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Tarjeta / QR</span>
              <span className="stat-value card">{fmt(cardSales + qrSales)}</span>
              <span className="stat-sub">electrónico</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Efectivo total en caja</span>
              <span className="stat-value">{fmt(activeSession.opening_amount + cashSales)}</span>
              <span className="stat-sub">fondo + ventas</span>
            </div>
          </div>

          {/* Recent sales in session */}
          {sessionSales.length > 0 && (
            <div className="session-sales">
              <h3>Ventas de este turno</h3>
              <div className="sales-table-wrap">
                <table className="sales-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Hora</th>
                      <th>Método</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionSales.slice(0, 20).map((s: any) => (
                      <tr key={s.id}>
                        <td className="mono">{s.ticket_number}</td>
                        <td className="muted">{format(new Date(s.created_at), 'HH:mm')}</td>
                        <td>
                          <span className={`method-tag ${s.payment_method}`}>
                            {s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'card' ? 'Tarjeta' : 'QR'}
                          </span>
                        </td>
                        <td className="right bold">{fmt(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gastos del turno */}
          <ExpensesPanel sessionId={activeSession?.id} />
        </>
      ) : (
        <div className="no-session">
          <Wallet size={48} strokeWidth={1} color="#2a2a38"/>
          <p>La caja está cerrada.</p>
          <p className="no-session-sub">Abre la caja para comenzar a registrar ventas.</p>
          <button onClick={() => setShowOpen(true)} className="btn-success large">
            <Unlock size={18}/> Abrir caja ahora
          </button>
        </div>
      )}

      {/* Past sessions */}
      {pastSessions.length > 0 && (
        <div className="past-sessions">
          <h3>Turnos anteriores</h3>
          <div className="past-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Apertura</th>
                  <th>Cierre</th>
                  <th>Usuario</th>
                  <th className="right">Esperado</th>
                  <th className="right">Contado</th>
                  <th className="right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {pastSessions.map((s: any) => (
                  <tr key={s.id}>
                    <td className="muted">{format(new Date(s.opened_at), 'dd/MM HH:mm')}</td>
                    <td className="muted">{s.closed_at ? format(new Date(s.closed_at), 'dd/MM HH:mm') : '—'}</td>
                    <td>{s.user?.name ?? '—'}</td>
                    <td className="right">{s.expected_amount != null ? fmt(s.expected_amount) : '—'}</td>
                    <td className="right">{s.closing_amount != null ? fmt(s.closing_amount) : '—'}</td>
                    <td className={`right bold ${s.difference > 0 ? 'positive' : s.difference < 0 ? 'negative' : ''}`}>
                      {s.difference != null ? (s.difference >= 0 ? '+' : '') + fmt(s.difference) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showOpen && register && user && (
        <OpenSessionModal
          registerId={register.id}
          userId={user.id}
          onClose={() => setShowOpen(false)}
        />
      )}
      {showClose && activeSession && (
        <CloseSessionModal
          session={activeSession}
          salesTotal={cashSales}
          onClose={() => setShowClose(false)}
        />
      )}
    </div>
  );
}

const csStyles = `
  .cs-layout {
    padding: 24px; background: #0f0f11; min-height: 100%;
    color: #e8e6e1; font-family: 'DM Sans','Inter',sans-serif;
    display: flex; flex-direction: column; gap: 20px;
  }
  .cs-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .cs-title  { display: flex; align-items: center; gap: 10px; }
  .cs-title h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .cs-actions { display: flex; gap: 8px; }

  .session-badge { font-size: 12px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
  .session-badge.open   { background: #0f2d1a; color: #22c55e; }
  .session-badge.closed { background: #1a1a1f; color: #4a4a55; }

  .btn-success { display: flex; align-items: center; gap: 6px; background: #16a34a; border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 9px 16px; cursor: pointer; transition: background .15s; }
  .btn-success:hover { background: #15803d; }
  .btn-success.large { padding: 13px 22px; font-size: 15px; border-radius: 10px; }
  .btn-danger { display: flex; align-items: center; gap: 6px; background: #dc2626; border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; padding: 9px 16px; cursor: pointer; }
  .btn-danger:hover:not(:disabled) { background: #b91c1c; }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-danger-outline { display: flex; align-items: center; gap: 6px; background: transparent; border: 1px solid #dc2626; border-radius: 8px; color: #f87171; font-size: 13px; font-weight: 500; padding: 9px 16px; cursor: pointer; transition: all .15s; }
  .btn-danger-outline:hover { background: #dc262622; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }

  .session-info-bar {
    display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
    background: #131318; border: 1px solid #1e1e25; border-radius: 10px; padding: 12px 16px;
    font-size: 13px; color: #6b6a65;
  }
  .session-info-item { display: flex; align-items: center; gap: 6px; }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat-card {
    background: #131318; border: 1px solid #1e1e25; border-radius: 12px;
    padding: 18px 20px; display: flex; flex-direction: column; gap: 4px;
  }
  .stat-card.highlight { border-color: #5c6df044; background: #14141e; }
  .stat-label { font-size: 11px; color: #4a4a55; text-transform: uppercase; letter-spacing: .05em; }
  .stat-value { font-size: 24px; font-weight: 700; color: #e8e6e1; }
  .stat-value.cash { color: #22c55e; }
  .stat-value.card { color: #a5b4fc; }
  .stat-sub  { font-size: 11px; color: #3a3a42; }

  .session-sales h3, .past-sessions h3 { font-size: 14px; font-weight: 500; color: #6b6a65; margin-bottom: 10px; }
  .sales-table-wrap, .past-table-wrap { overflow: auto; border-radius: 10px; border: 1px solid #1e1e25; }
  .sales-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sales-table thead { background: #131318; }
  .sales-table th { padding: 9px 14px; text-align: left; font-weight: 500; color: #4a4a55; border-bottom: 1px solid #1e1e25; white-space: nowrap; }
  .sales-table th.right, .sales-table td.right { text-align: right; }
  .sales-table tbody tr { border-bottom: 1px solid #1a1a1f; transition: background .1s; }
  .sales-table tbody tr:hover { background: #131318; }
  .sales-table td { padding: 10px 14px; }
  .mono { font-family: monospace; font-size: 12px; color: #9997a0; }
  .muted { color: #4a4a55; }
  .bold { font-weight: 600; }
  .positive { color: #22c55e; }
  .negative { color: #ef4444; }

  .method-tag { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 500; }
  .method-tag.cash     { background: #0f2d1a; color: #22c55e; }
  .method-tag.card     { background: #1a1a2e; color: #a5b4fc; }
  .method-tag.qr       { background: #1a1a03; color: #d97706; }
  .method-tag.transfer { background: #1a1a1f; color: #6b7280; }

  .no-session {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 60px; text-align: center;
  }
  .no-session p { font-size: 16px; color: #4a4a55; }
  .no-session-sub { font-size: 13px; color: #2a2a38; }

  /* Modals */
  .cs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .cs-modal { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 16px; width: 400px; max-width: 95vw; display: flex; flex-direction: column; }
  .cs-modal.wide { width: 480px; }
  .cs-modal-header { display: flex; align-items: center; gap: 8px; padding: 18px 22px 14px; border-bottom: 1px solid #1e1e25; }
  .cs-modal-header h2 { font-size: 16px; font-weight: 600; flex: 1; }
  .cs-modal-header button { background: none; border: none; color: #6b6a65; cursor: pointer; }
  .cs-modal-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
  .cs-modal-footer { padding: 14px 22px; border-top: 1px solid #1e1e25; display: flex; justify-content: flex-end; gap: 8px; }
  .cs-modal-desc { font-size: 13px; color: #6b6a65; }

  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 12px; color: #6b6a65; }
  .form-group input, .form-group textarea {
    background: #131318; border: 1px solid #2a2a30; border-radius: 8px;
    padding: 10px 12px; color: #e8e6e1; font-size: 14px; outline: none; transition: border-color .15s; width: 100%;
  }
  .form-group input:focus, .form-group textarea:focus { border-color: #5c6df0; }
  .form-group textarea { resize: vertical; font-size: 13px; }

  .quick-amounts { display: flex; gap: 8px; flex-wrap: wrap; }
  .quick-btn { padding: 6px 12px; background: #131318; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 12px; cursor: pointer; transition: all .1s; }
  .quick-btn:hover { border-color: #5c6df0; color: #a5b4fc; }

  .close-summary { background: #0f0f11; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .summary-row { display: flex; justify-content: space-between; font-size: 13px; color: #6b6a65; }
  .summary-row.total { font-size: 15px; font-weight: 600; color: #e8e6e1; padding-top: 8px; border-top: 1px solid #2a2a30; margin-top: 4px; }
  .summary-row .positive { color: #22c55e; }

  .diff-card {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
  }
  .diff-card.exact    { background: #0f2d1a; color: #22c55e; border: 1px solid #16a34a; }
  .diff-card.positive { background: #0f2d1a; color: #22c55e; border: 1px solid #16a34a; }
  .diff-card.negative { background: #1a0505; color: #f87171; border: 1px solid #dc2626; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
