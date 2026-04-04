/**
 * Email sender — wraps Resend API.
 * Falls back to console logging in development when RESEND_API_KEY is not set.
 */
import { Resend } from 'resend';

let resend = null;

function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      return null; // dev fallback
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Send an email.
 * @param {Object} options
 * @param {string}   options.from     - sender address
 * @param {string}   options.to       - recipient address
 * @param {string}   options.replyTo  - reply-to address
 * @param {string}   options.subject
 * @param {string}   options.html
 * @param {string}   options.text
 * @returns {Promise<{ id: string | null, delivered: boolean }>}
 */
export async function sendEmail({ from, to, replyTo, subject, html, text }) {
  const client = getResend();

  if (!client) {
    // Dev mode — log to console, don't actually send
    console.log('\n[EMAIL — dev mode, not sent]');
    console.log(`  From:    ${from}`);
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:    ${text?.slice(0, 200)}…\n`);
    return { id: `dev_${Date.now()}`, delivered: false };
  }

  const result = await client.emails.send({
    from,
    to:       [to],
    reply_to: replyTo,
    subject,
    html,
    text,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return { id: result.data?.id ?? null, delivered: true };
}
