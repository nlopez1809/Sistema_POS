import { supabase } from './supabase';
import { useAppStore } from '../store';
import type { Sale } from '../../shared/types';

export interface SendTicketEmailOptions {
  to:           string;
  customerName?: string;
  sale:          Sale;
}

export function useEmail() {
  const { company, branch } = useAppStore();

  const sendTicketEmail = async ({ to, customerName, sale }: SendTicketEmailOptions) => {
    if (!company || !branch) throw new Error('Sin sesión de empresa');
    if (!sale.items || sale.items.length === 0) throw new Error('La venta no tiene ítems');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sin sesión de usuario');

    const payload = {
      to,
      customerName,
      companyName:   company.name,
      branchName:    branch.name,
      ticketNumber:  sale.ticket_number,
      date:          new Date(sale.created_at).toLocaleString('es-BO', {
        dateStyle: 'long', timeStyle: 'short',
      }),
      items:         sale.items.map(i => ({
        name:     i.name,
        quantity: i.quantity,
        price:    i.price,
        subtotal: i.subtotal,
      })),
      subtotal:      sale.subtotal,
      discount:      sale.discount,
      tax:           sale.tax,
      total:         sale.total,
      paidAmount:    sale.paid_amount,
      changeAmount:  sale.change_amount,
      paymentMethod: sale.payment_method,
      currency:      company.currency ?? 'Bs',
    };

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-ticket-email`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error ?? 'Error enviando email');
    }

    return response.json();
  };

  return { sendTicketEmail };
}
