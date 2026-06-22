// supabase/functions/send-ticket-email/index.ts
// Deploy: supabase functions deploy send-ticket-email
//
// Variables de entorno necesarias en Supabase:
//   RESEND_API_KEY   → obtener en resend.com (gratis hasta 3000 emails/mes)
//   FROM_EMAIL       → el correo verificado en Resend, ej: noreply@tudominio.com

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketEmailPayload {
  to:          string;            // email del cliente
  customerName?: string;
  companyName:  string;
  branchName:   string;
  ticketNumber: string;
  date:         string;
  items: Array<{
    name:     string;
    quantity: number;
    price:    number;
    subtotal: number;
  }>;
  subtotal:      number;
  discount:      number;
  tax:           number;
  total:         number;
  paidAmount:    number;
  changeAmount:  number;
  paymentMethod: string;
  currency:      string;
}

function formatMoney(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}

function buildEmailHTML(data: TicketEmailPayload): string {
  const fmt = (n: number) => formatMoney(n, data.currency);

  const methodLabel: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', qr: 'QR',
    transfer: 'Transferencia', mixed: 'Mixto',
  };

  const itemsHTML = data.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
        ${item.name}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;text-align:center;">
        ${item.quantity}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:right;">
        ${fmt(item.price)}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#111827;text-align:right;">
        ${fmt(item.subtotal)}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo de compra — ${data.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:#1a1a2e;padding:28px 32px;text-align:center;">
      <h1 style="color:white;font-size:22px;margin:0 0 4px;">${data.companyName}</h1>
      <p style="color:#a5b4fc;margin:0;font-size:13px;">${data.branchName}</p>
    </div>

    <!-- Ticket info -->
    <div style="background:#f0f0f8;padding:14px 32px;display:flex;justify-content:space-between;font-size:12px;color:#6b7280;">
      <span>🎫 Ticket: <strong style="color:#374151;">${data.ticketNumber}</strong></span>
      <span>📅 ${data.date}</span>
    </div>

    <!-- Greeting -->
    <div style="padding:24px 32px 8px;">
      ${data.customerName
        ? `<p style="font-size:15px;color:#374151;margin:0 0 16px;">Hola, <strong>${data.customerName}</strong>. Gracias por tu compra.</p>`
        : `<p style="font-size:15px;color:#374151;margin:0 0 16px;">Gracias por tu compra. Aquí está tu recibo.</p>`
      }
    </div>

    <!-- Items -->
    <div style="padding:0 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;color:#9ca3af;padding:6px 0;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;">Producto</th>
            <th style="text-align:center;font-size:11px;color:#9ca3af;padding:6px 0;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;">Cant.</th>
            <th style="text-align:right;font-size:11px;color:#9ca3af;padding:6px 0;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;">Precio</th>
            <th style="text-align:right;font-size:11px;color:#9ca3af;padding:6px 0;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="padding:16px 32px 24px;">
      <div style="background:#f9fafb;border-radius:8px;padding:14px 18px;">
        ${data.discount > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#6b7280;">
          <span>Subtotal</span><span>${fmt(data.subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#059669;">
          <span>Descuento</span><span>-${fmt(data.discount)}</span>
        </div>
        ` : ''}
        ${data.tax > 0 ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#d97706;">
          <span>IVA</span><span>${fmt(data.tax)}</span>
        </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #e5e7eb;font-size:18px;font-weight:700;color:#111827;">
          <span>TOTAL</span><span>${fmt(data.total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#9ca3af;">
          <span>Pagó (${methodLabel[data.paymentMethod] ?? data.paymentMethod})</span>
          <span>${fmt(data.paidAmount)}</span>
        </div>
        ${data.changeAmount > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#9ca3af;">
          <span>Cambio</span><span>${fmt(data.changeAmount)}</span>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f3f4f6;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;">
      <p style="margin:0 0 4px;">¡Gracias por preferirnos!</p>
      <p style="margin:0;">Conserva este correo como comprobante de tu compra.</p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') ?? 'noreply@tudominio.com';

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY no configurado en Supabase secrets');
    }

    const payload: TicketEmailPayload = await req.json();

    if (!payload.to || !payload.ticketNumber) {
      throw new Error('Faltan campos requeridos: to, ticketNumber');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.to)) {
      throw new Error(`Email inválido: ${payload.to}`);
    }

    const html = buildEmailHTML(payload);

    // Send via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${payload.companyName} <${FROM_EMAIL}>`,
        to:      [payload.to],
        subject: `Tu recibo de compra — ${payload.ticketNumber}`,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.json();
      throw new Error(`Resend error: ${JSON.stringify(err)}`);
    }

    const result = await resendResponse.json();

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
