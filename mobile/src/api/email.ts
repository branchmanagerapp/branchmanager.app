/**
 * Email sending via SendGrid
 * Used for quotes, invoices, reminders
 */

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const FROM_EMAIL = 'info@peekskilltree.com';
const FROM_NAME = 'Second Nature Tree Service';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(params: EmailParams, apiKey: string): Promise<boolean> {
  const response = await fetch(SENDGRID_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      reply_to: { email: params.replyTo || FROM_EMAIL },
      subject: params.subject,
      content: [{ type: 'text/html', value: params.html }],
    }),
  });
  return response.ok;
}

export function buildQuoteEmail(clientName: string, quoteNum: number, total: number, portalUrl: string): EmailParams {
  return {
    to: '',
    subject: `Quote #${quoteNum} from Second Nature Tree Service`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1b5e20;">Second Nature Tree Service</h2>
        <p>Hi ${clientName},</p>
        <p>Here's your quote for <strong>$${total.toFixed(2)}</strong>.</p>
        <p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#1b5e20;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">View & Approve Quote</a></p>
        <p style="color:#666;font-size:13px;">Questions? Call us at (914) 391-5233 or reply to this email.</p>
      </div>
    `,
  };
}

export function buildInvoiceEmail(clientName: string, invNum: number, total: number, balance: number, payUrl: string): EmailParams {
  return {
    to: '',
    subject: `Invoice #${invNum} from Second Nature Tree Service — $${balance.toFixed(2)} due`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1b5e20;">Second Nature Tree Service</h2>
        <p>Hi ${clientName},</p>
        <p>Invoice #${invNum} for <strong>$${total.toFixed(2)}</strong>. Balance due: <strong>$${balance.toFixed(2)}</strong>.</p>
        <p><a href="${payUrl}" style="display:inline-block;padding:12px 24px;background:#1b5e20;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">View & Pay Invoice</a></p>
        <p style="color:#666;font-size:13px;">Questions? Call us at (914) 391-5233.</p>
      </div>
    `,
  };
}

export function buildReminderEmail(clientName: string, invNum: number, balance: number, daysOverdue: number): EmailParams {
  return {
    to: '',
    subject: `Reminder: Invoice #${invNum} — $${balance.toFixed(2)} ${daysOverdue > 0 ? `(${daysOverdue} days overdue)` : 'due'}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1b5e20;">Second Nature Tree Service</h2>
        <p>Hi ${clientName},</p>
        <p>This is a friendly reminder that Invoice #${invNum} has a balance of <strong>$${balance.toFixed(2)}</strong>${daysOverdue > 0 ? ` and is ${daysOverdue} days past due` : ''}.</p>
        <p>Please arrange payment at your earliest convenience.</p>
        <p style="color:#666;font-size:13px;">Questions? Call (914) 391-5233.</p>
      </div>
    `,
  };
}
