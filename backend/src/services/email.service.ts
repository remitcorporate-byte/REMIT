import axios from 'axios';
import fs from 'node:fs';
import config from '../config';

export type EmailInput = { to: string; subject: string; text: string; html?: string };

export async function sendEmail(input: EmailInput) {
  if (config.email.resendApiKey) {
    await axios.post(
      'https://api.resend.com/emails',
      { from: config.email.from, to: [input.to], subject: input.subject, text: input.text, html: input.html },
      { headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' } },
    );
    return;
  }
  if (config.env === 'production') throw new Error('Email delivery is misconfigured: set RESEND_API_KEY');
  const message = `[Email] to=${input.to} subject=${input.subject}\n${input.text}`;
  console.log(message);
  // Test runners may capture stdout through a buffered pipe. Keep the exact
  // same development fallback available to the local E2E harness immediately.
  if (config.env === 'test' && process.env.SERVER_LOG) {
    try { fs.appendFileSync(process.env.SERVER_LOG, `${message}\n`); } catch { /* stdout remains the fallback */ }
  }
}
