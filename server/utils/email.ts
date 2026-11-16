export function isEmailConfigured(): boolean {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const key = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return Boolean((provider === 'resend' || provider === 'sendgrid') && key && from);
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; configured: boolean; error?: string }> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!isEmailConfigured() || !provider || !apiKey || !from) {
    return { sent: false, configured: false };
  }

  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          text: params.text,
          html: params.html || `<p>${params.text.replace(/\n/g, '<br/>')}</p>`,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        return { sent: false, configured: true, error: msg };
      }
      return { sent: true, configured: true };
    }

    if (provider === 'sendgrid') {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: params.to }] }],
          from: { email: from },
          subject: params.subject,
          content: [
            { type: 'text/plain', value: params.text },
            ...(params.html ? [{ type: 'text/html', value: params.html }] : []),
          ],
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        return { sent: false, configured: true, error: msg };
      }
      return { sent: true, configured: true };
    }

    return { sent: false, configured: false, error: 'Unsupported email provider.' };
  } catch (err) {
    return {
      sent: false,
      configured: true,
      error: err instanceof Error ? err.message : 'Email delivery error.',
    };
  }
}
