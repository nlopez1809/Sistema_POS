/**
 * loyalty.ts
 * ─────────────────────────────────────────────────────────────
 * Sistema de puntos de fidelización.
 *
 * Reglas configurables (guardadas en localStorage):
 *   - pref_loyaltyRate:  Bs por cada punto (ej: 10 = 1 pto cada Bs 10)
 *   - pref_redeemRate:   Bs de descuento por punto canjeado (ej: 0.50)
 *   - pref_loyaltyEnabled: boolean
 */

import { supabase } from './supabase';

// ── Config ────────────────────────────────────────────────────

export interface LoyaltyConfig {
  enabled:     boolean;
  earnRate:    number; // Bs para ganar 1 punto (ej: 10 → 1 pto por cada Bs 10 gastados)
  redeemRate:  number; // Bs de descuento por punto (ej: 0.50 → 1 pto = Bs 0.50)
  minRedeem:   number; // mínimo de puntos para canjear
}

export function getLoyaltyConfig(): LoyaltyConfig {
  return {
    enabled:    localStorage.getItem('pref_loyaltyEnabled') !== 'false',
    earnRate:   parseFloat(localStorage.getItem('pref_loyaltyEarnRate')  ?? '10'),
    redeemRate: parseFloat(localStorage.getItem('pref_loyaltyRedeemRate') ?? '0.50'),
    minRedeem:  parseInt(  localStorage.getItem('pref_loyaltyMinRedeem')  ?? '10'),
  };
}

export function saveLoyaltyConfig(cfg: LoyaltyConfig): void {
  localStorage.setItem('pref_loyaltyEnabled',    String(cfg.enabled));
  localStorage.setItem('pref_loyaltyEarnRate',   String(cfg.earnRate));
  localStorage.setItem('pref_loyaltyRedeemRate', String(cfg.redeemRate));
  localStorage.setItem('pref_loyaltyMinRedeem',  String(cfg.minRedeem));
}

// ── Calculations ──────────────────────────────────────────────

/** Puntos que gana el cliente por esta compra */
export function calcPointsEarned(total: number, config: LoyaltyConfig): number {
  if (!config.enabled || config.earnRate <= 0) return 0;
  return Math.floor(total / config.earnRate);
}

/** Descuento en Bs que equivalen N puntos */
export function calcRedeemValue(points: number, config: LoyaltyConfig): number {
  return parseFloat((points * config.redeemRate).toFixed(2));
}

/** Puntos máximos que puede canjear para no superar el total */
export function calcMaxRedeemable(
  availablePoints: number,
  total:           number,
  config:          LoyaltyConfig,
): number {
  if (!config.enabled || availablePoints < config.minRedeem) return 0;
  const maxByTotal  = Math.floor(total / config.redeemRate);
  return Math.min(availablePoints, maxByTotal);
}

// ── Supabase operations ───────────────────────────────────────

/** Suma puntos al cliente tras una venta */
export async function addPoints(customerId: string, points: number): Promise<void> {
  if (points <= 0) return;
  const { error } = await supabase.rpc('increment_customer_points', {
    p_customer_id: customerId,
    p_points:      points,
  });
  if (error) {
    // Fallback si la función RPC no existe: update directo
    const { data: current } = await supabase
      .from('customers')
      .select('points')
      .eq('id', customerId)
      .single();
    await supabase
      .from('customers')
      .update({ points: (current?.points ?? 0) + points })
      .eq('id', customerId);
  }
}

/** Descuenta puntos al cliente al canjear */
export async function redeemPoints(customerId: string, points: number): Promise<void> {
  if (points <= 0) return;
  const { data: current } = await supabase
    .from('customers')
    .select('points')
    .eq('id', customerId)
    .single();
  const newPoints = Math.max(0, (current?.points ?? 0) - points);
  await supabase
    .from('customers')
    .update({ points: newPoints })
    .eq('id', customerId);
}

/** Obtiene el saldo de puntos de un cliente */
export async function getCustomerPoints(customerId: string): Promise<number> {
  const { data } = await supabase
    .from('customers')
    .select('points')
    .eq('id', customerId)
    .single();
  return data?.points ?? 0;
}

// ── React Hook ────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import type { Customer } from '../../shared/types';

export interface LoyaltyState {
  config:           LoyaltyConfig;
  pointsToEarn:     number;      // puntos que ganará el cliente
  pointsToRedeem:   number;      // puntos que el cajero ingresó para canjear
  redeemDiscount:   number;      // Bs de descuento por canje
  maxRedeemable:    number;      // máximo canjeables
  setPointsToRedeem:(n: number) => void;
  applyRedeem:      () => void;  // aplica el canje al carrito
  cancelRedeem:     () => void;
  postSaleActions:  (customerId: string, saleTotal: number) => Promise<void>;
}

export function useLoyalty(customer: Customer | null, cartTotal: number, setGlobalDiscount: (n: number) => void): LoyaltyState {
  const [config]         = useState(getLoyaltyConfig);
  const [customerPoints, setCustomerPoints] = useState(customer?.points ?? 0);
  const [pointsToRedeem, setPointsToRedeemState] = useState(0);

  useEffect(() => {
    if (customer) {
      getCustomerPoints(customer.id)
        .then(setCustomerPoints)
        .catch(console.error);
    } else {
      setCustomerPoints(0);
    }
    setPointsToRedeemState(0);
  }, [customer?.id]);

  const pointsToEarn   = calcPointsEarned(cartTotal, config);
  const maxRedeemable  = calcMaxRedeemable(customerPoints, cartTotal, config);
  const redeemDiscount = calcRedeemValue(pointsToRedeem, config);

  const setPointsToRedeem = (n: number) => {
    const clamped = Math.max(0, Math.min(n, maxRedeemable));
    setPointsToRedeemState(clamped);
  };

  const applyRedeem = () => {
    if (pointsToRedeem > 0) setGlobalDiscount(redeemDiscount);
  };

  const cancelRedeem = () => {
    setPointsToRedeemState(0);
    setGlobalDiscount(0);
  };

  const postSaleActions = async (customerId: string, saleTotal: number) => {
    if (!config.enabled) return;
    // Si hubo canje, descontar puntos primero
    if (pointsToRedeem > 0) {
      await redeemPoints(customerId, pointsToRedeem);
    }
    // Sumar puntos ganados por la compra
    const earned = calcPointsEarned(saleTotal, config);
    if (earned > 0) {
      await addPoints(customerId, earned);
    }
  };

  return {
    config,
    pointsToEarn,
    pointsToRedeem,
    redeemDiscount,
    maxRedeemable,
    setPointsToRedeem,
    applyRedeem,
    cancelRedeem,
    postSaleActions,
  };
}
