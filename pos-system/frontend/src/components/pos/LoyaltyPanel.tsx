import React, { useState } from 'react';
import { Star, Gift, ChevronDown, X } from 'lucide-react';
import { useLoyalty, getLoyaltyConfig } from '../../lib/loyalty';
import type { Customer } from '../../../shared/types';

interface Props {
  customer:          Customer | null;
  cartTotal:         number;
  setGlobalDiscount: (n: number) => void;
}

export default function LoyaltyPanel({ customer, cartTotal, setGlobalDiscount }: Props) {
  const config = getLoyaltyConfig();
  const {
    pointsToEarn,
    pointsToRedeem,
    redeemDiscount,
    maxRedeemable,
    setPointsToRedeem,
    applyRedeem,
    cancelRedeem,
  } = useLoyalty(customer, cartTotal, setGlobalDiscount);

  const [showRedeem, setShowRedeem] = useState(false);

  if (!config.enabled || !customer) return null;

  const availablePoints = customer.points ?? 0;
  const canRedeem = maxRedeemable >= config.minRedeem;

  return (
    <div className="loyalty-panel">
      <style>{loyaltyStyles}</style>

      {/* Points display */}
      <div className="loyalty-header">
        <div className="loyalty-customer">
          <Star size={13} color="#f59e0b" />
          <span className="loyalty-name">{customer.name}</span>
          <span className="loyalty-points">{availablePoints} pts</span>
        </div>
        {pointsToEarn > 0 && (
          <span className="loyalty-earn">+{pointsToEarn} pts</span>
        )}
      </div>

      {/* Redeem section */}
      {canRedeem && !showRedeem && pointsToRedeem === 0 && (
        <button onClick={() => setShowRedeem(true)} className="loyalty-redeem-btn">
          <Gift size={12} />
          Canjear {maxRedeemable} puntos (Bs {(maxRedeemable * config.redeemRate).toFixed(2)} de descuento)
        </button>
      )}

      {showRedeem && pointsToRedeem === 0 && (
        <div className="loyalty-redeem-form">
          <div className="loyalty-redeem-row">
            <label>Puntos a canjear</label>
            <div className="loyalty-redeem-input-wrap">
              <button
                onClick={() => setPointsToRedeem(Math.max(0, pointsToRedeem - config.minRedeem))}
                className="redeem-step-btn"
              >−</button>
              <input
                type="number"
                value={pointsToRedeem}
                onChange={e => setPointsToRedeem(parseInt(e.target.value) || 0)}
                min={0}
                max={maxRedeemable}
                step={config.minRedeem}
              />
              <button
                onClick={() => setPointsToRedeem(Math.min(maxRedeemable, pointsToRedeem + config.minRedeem))}
                className="redeem-step-btn"
              >+</button>
            </div>
          </div>
          <div className="loyalty-redeem-actions">
            <button onClick={() => setShowRedeem(false)} className="redeem-cancel">Cancelar</button>
            <button
              onClick={() => { setPointsToRedeem(maxRedeemable); applyRedeem(); setShowRedeem(false); }}
              className="redeem-all"
            >
              Canjear todos ({maxRedeemable} pts)
            </button>
          </div>
        </div>
      )}

      {/* Active redeem */}
      {pointsToRedeem > 0 && (
        <div className="loyalty-active-redeem">
          <Gift size={12} color="#f59e0b" />
          <span>Canjeando {pointsToRedeem} pts → descuento Bs {redeemDiscount.toFixed(2)}</span>
          <button onClick={() => { cancelRedeem(); setShowRedeem(false); }} className="redeem-remove">
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

const loyaltyStyles = `
  .loyalty-panel { display:flex; flex-direction:column; gap:5px; padding:8px 0; border-bottom:1px solid #1e1e25; margin-bottom:2px; }
  .loyalty-header { display:flex; align-items:center; justify-content:space-between; }
  .loyalty-customer { display:flex; align-items:center; gap:5px; }
  .loyalty-name { font-size:12px; color:#9997a0; }
  .loyalty-points { font-size:12px; font-weight:700; color:#f59e0b; background:#1a1a03; border:1px solid #d97706; border-radius:20px; padding:1px 7px; }
  .loyalty-earn { font-size:11px; color:#22c55e; background:#0f2d1a; border-radius:20px; padding:1px 7px; border:1px solid #16a34a; }

  .loyalty-redeem-btn { display:flex; align-items:center; gap:5px; background:none; border:1px dashed #d97706; border-radius:7px; color:#d97706; font-size:11px; padding:5px 10px; cursor:pointer; transition:all .1s; text-align:left; }
  .loyalty-redeem-btn:hover { background:#d9770611; }

  .loyalty-redeem-form { display:flex; flex-direction:column; gap:7px; background:#131318; border-radius:8px; padding:10px; border:1px solid #2a2a30; }
  .loyalty-redeem-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .loyalty-redeem-row label { font-size:11px; color:#6b6a65; }
  .loyalty-redeem-input-wrap { display:flex; align-items:center; gap:4px; }
  .loyalty-redeem-input-wrap input { width:56px; background:#1a1a1f; border:1px solid #2a2a30; border-radius:6px; padding:4px 8px; color:#e8e6e1; font-size:13px; font-weight:600; text-align:center; outline:none; }
  .redeem-step-btn { width:24px; height:24px; background:#1a1a1f; border:1px solid #2a2a30; border-radius:6px; color:#9997a0; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .1s; }
  .redeem-step-btn:hover { border-color:#d97706; color:#d97706; }
  .loyalty-redeem-actions { display:flex; gap:6px; }
  .redeem-cancel { flex:1; padding:5px; background:none; border:1px solid #2a2a30; border-radius:6px; color:#6b6a65; font-size:11px; cursor:pointer; }
  .redeem-all { flex:2; padding:5px; background:#d97706; border:none; border-radius:6px; color:#fff; font-size:11px; font-weight:600; cursor:pointer; }
  .redeem-all:hover { background:#b45309; }

  .loyalty-active-redeem { display:flex; align-items:center; gap:6px; background:#1a1000; border:1px solid #d9770655; border-radius:7px; padding:6px 10px; font-size:11px; color:#d97706; }
  .loyalty-active-redeem span { flex:1; }
  .redeem-remove { background:none; border:none; color:#d97706; cursor:pointer; display:flex; align-items:center; opacity:.6; }
  .redeem-remove:hover { opacity:1; }
`;
