exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  const RESEND_KEY = process.env.RESEND_KEY
  // Change FROM_EMAIL once nectaram.com domain is verified in Resend
  const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'
  const SITE_URL = process.env.URL || 'https://yoursite.netlify.app'

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { name, email, phone, company, amount, fundtype, message, source } = body
  const leadSource = source || 'kontakt'

  if (!name || !email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mangler påkrævede felter' }) }
  }

  // 1. Gem lead, hent ID tilbage
  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      name, email,
      phone: phone || null,
      company: company || null,
      investment_amount: amount || null,
      investment_type: fundtype || null,
      message: message || null,
      source: leadSource,
    }),
  })

  if (!dbRes.ok) {
    console.error('Supabase error:', await dbRes.text())
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Kunne ikke gemme lead' }) }
  }

  const [lead] = await dbRes.json()

  // 2. Send bekræftelsesmail til lead
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Nectar Boligfond <${FROM_EMAIL}>`,
      to: email,
      reply_to: 'kontakt@nectarprojekter.dk',
      subject: 'Tak for din interesse — Nectar Valby Boligfond',
      html: confirmationEmail(name, SITE_URL),
    }),
  })

  const emailData = emailRes.ok ? await emailRes.json() : null

  // 3. Gem Resend email-ID og afsendelsestidspunkt
  if (lead?.id && emailData?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email_resend_id: emailData.id,
        email_sent_at: new Date().toISOString(),
      }),
    })
  }

  // 4. Intern notifikation
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Nectar Lead System <${FROM_EMAIL}>`,
      to: ['t.borg@nectaram.com', 'hello@vforviktor.com', 'kontakt@nectarprojekter.dk'],
      subject: `Nyt lead: ${name} — ${amount || 'ikke oplyst'}`,
      html: internalEmail({ name, email, phone, company, amount, fundtype, message }, SITE_URL),
    }),
  })

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
}

function confirmationEmail(name, siteUrl) {
  const pdfUrl = `${siteUrl}/Nectar%20Valby%20Boligfond%20ApS_investeringspræsentation.pdf`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1ed;">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;">
  <div style="background:#1C3829;padding:40px 48px;">
    <p style="margin:0;font-family:Georgia,serif;font-weight:700;font-size:24px;color:#fff;letter-spacing:0.04em;">Nectar</p>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.5);letter-spacing:0.1em;text-transform:uppercase;">Valby Boligfond</p>
  </div>
  <div style="padding:48px;">
    <p style="margin:0 0 20px;font-size:16px;color:#1A1A18;line-height:1.7;">Hej ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#4a4a48;line-height:1.7;">Tak for din interesse i Nectar Valby Boligfond ApS. Vi har modtaget din henvendelse og tager fat i dig inden for kort tid.</p>
    <p style="margin:0 0 32px;font-size:15px;color:#4a4a48;line-height:1.7;">Vi har vedlagt adgang til vores fulde investeringspræsentation, som indeholder en gennemgang af casen, budgetforudsætninger, risikoanalyse, investeringsstruktur og finansielle modeller.</p>
    <div style="text-align:center;margin-bottom:36px;">
      <a href="${pdfUrl}" style="display:inline-block;background:#1C3829;color:#fff;text-decoration:none;padding:14px 32px;border-radius:7px;font-size:14px;font-weight:700;letter-spacing:0.02em;">Download investeringspræsentation (PDF)</a>
    </div>
    <div style="background:#f4f1ed;border-radius:8px;padding:28px;margin-bottom:32px;">
      <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#6B6762;text-transform:uppercase;letter-spacing:0.08em;">Nøgletal — Horsekildevej 2–6, Valby</p>
      <table style="width:100%;"><tr>
        <td style="text-align:center;padding:8px;">
          <p style="margin:0;font-size:26px;font-weight:700;color:#C9A059;font-family:Georgia,serif;">8,31%</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6B6762;text-transform:uppercase;letter-spacing:0.06em;">Forventet IRR</p>
        </td>
        <td style="text-align:center;padding:8px;border-left:1px solid #e8e3dc;border-right:1px solid #e8e3dc;">
          <p style="margin:0;font-size:26px;font-weight:700;color:#C9A059;font-family:Georgia,serif;">10,58%</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6B6762;text-transform:uppercase;letter-spacing:0.06em;">Egenk. p.a.</p>
        </td>
        <td style="text-align:center;padding:8px;">
          <p style="margin:0;font-size:26px;font-weight:700;color:#C9A059;font-family:Georgia,serif;">2028</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6B6762;text-transform:uppercase;letter-spacing:0.06em;">Første udlodning</p>
        </td>
      </tr></table>
    </div>
    <p style="margin:0 0 8px;font-size:15px;color:#4a4a48;line-height:1.7;">Fonden investerer i en klassisk Valby-ejendom fra 1914 med 61 boliglejemål og en forventet lejereserve på ~20%. Nectar investerer selv 10% af egenkapitalen.</p>
    <p style="margin:0 0 32px;font-size:15px;color:#4a4a48;line-height:1.7;">Du er velkommen til at svare direkte på denne mail med spørgsmål eller ønske om et møde.</p>
    <p style="margin:0;font-size:14px;color:#8B8B89;line-height:1.7;">Med venlig hilsen<br><strong style="color:#1A1A18;">Thomas Borg &amp; Bjørk Krogshave</strong><br>Nectar Asset Management</p>
  </div>
  <div style="background:#f4f1ed;padding:20px 48px;border-top:1px solid #e8e3dc;">
    <p style="margin:0;font-size:11px;color:#9B9996;line-height:1.6;">⚠ Henvender sig udelukkende til professionelle investorer jf. FAIF-lovgivningen (nr. 23.144). Investering kan medføre tab af hele indskuddet. Historiske afkast er ikke garanti for fremtidige resultater.</p>
  </div>
</div>
</body></html>`
}

function internalEmail(lead, siteUrl) {
  const adminUrl = `${siteUrl}/admin.html`
  const rows = [
    ['Navn', lead.name],
    ['E-mail', `<a href="mailto:${lead.email}" style="color:#1C3829;">${lead.email}</a>`],
    ['Telefon', lead.phone || '—'],
    ['Virksomhed', lead.company || '—'],
    ['Investeringsbeløb', lead.amount || '—'],
    ['Type af midler', lead.fundtype || '—'],
    ['Besked', lead.message || '—'],
  ].map(([k, v]) => `<tr>
    <td style="padding:10px 16px;font-size:12px;color:#6B6762;background:#f4f1ed;font-weight:600;width:150px;text-transform:uppercase;letter-spacing:0.05em;">${k}</td>
    <td style="padding:10px 16px;font-size:14px;color:#1A1A18;">${v}</td>
  </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1ed;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;">
  <div style="background:#1C3829;padding:20px 32px;">
    <div style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C9A059;margin-right:10px;vertical-align:middle;"></div>
    <span style="font-size:12px;font-weight:700;color:#fff;letter-spacing:0.1em;text-transform:uppercase;vertical-align:middle;">Nyt lead — Nectar Boligfond</span>
  </div>
  <div style="padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#1A1A18;line-height:1.6;">Ny henvendelse fra <strong>${lead.name}</strong>. En bekræftelsesmail er sendt til leadet. Tag kontakt inden for 24 timer.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="margin-top:24px;text-align:center;">
      <a href="${adminUrl}" style="display:inline-block;background:#1C3829;color:#fff;text-decoration:none;padding:11px 24px;border-radius:6px;font-size:13px;font-weight:700;">Se lead i admin →</a>
    </div>
  </div>
</div>
</body></html>`
}
