// Meta Lead Ads Webhook
// Receives leads from Meta native lead forms, saves to Supabase, sends emails.
//
// Setup in Meta:
//   1. Go to your Facebook Page → Publishing Tools → Meta Lead Ads → Leads Setup
//   2. Under "CRM integration" choose "Webhooks"
//   3. Callback URL: https://nectar-boligfond.netlify.app/.netlify/functions/meta-lead-webhook
//   4. Verify Token: set to the value of META_VERIFY_TOKEN env var
//   5. Subscribe to: leadgen
//
// Required env vars (set in Netlify):
//   META_VERIFY_TOKEN    — any random string you choose, e.g. "nectar_meta_2026"
//   META_PAGE_ACCESS_TOKEN — long-lived Page Access Token from Meta Graph API Explorer
//   SUPABASE_URL
//   SUPABASE_KEY
//   RESEND_KEY
//   FROM_EMAIL

exports.handler = async (event) => {
  // ── Webhook verification (GET) ──────────────────────────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {}
    const mode      = params['hub.mode']
    const token     = params['hub.verify_token']
    const challenge = params['hub.challenge']

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge }
    }
    return { statusCode: 403, body: 'Forbidden' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // ── Receive lead event (POST) ───────────────────────────────
  let payload
  try { payload = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const entries = payload?.entry ?? []

  for (const entry of entries) {
    for (const change of (entry.changes ?? [])) {
      if (change.field !== 'leadgen') continue

      const leadgenId = change.value?.leadgen_id
      if (!leadgenId) continue

      await processMetaLead(leadgenId)
    }
  }

  return { statusCode: 200, body: 'OK' }
}

async function processMetaLead(leadgenId) {
  const META_TOKEN    = process.env.META_PAGE_ACCESS_TOKEN
  const SUPABASE_URL  = process.env.SUPABASE_URL
  const SUPABASE_KEY  = process.env.SUPABASE_KEY
  const RESEND_KEY    = process.env.RESEND_KEY
  const FROM_EMAIL    = process.env.FROM_EMAIL || 'onboarding@resend.dev'
  const SITE_URL      = process.env.URL || 'https://nectar-boligfond.netlify.app'

  // 1. Hent leaddata fra Meta Graph API
  const graphRes = await fetch(
    `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${META_TOKEN}`
  )
  if (!graphRes.ok) {
    console.error('Meta Graph API error:', await graphRes.text())
    return
  }

  const graphData = await graphRes.json()
  const fields = {}
  for (const { name, values } of (graphData.field_data ?? [])) {
    fields[name] = values?.[0] ?? null
  }

  const name    = fields['full_name'] || fields['first_name'] || 'Ukendt'
  const email   = fields['email'] || null
  const phone   = fields['phone_number'] || null
  const company = fields['company_name'] || null
  const amount  = fields['investment_amount'] || null

  if (!email) {
    console.error('No email in Meta lead', leadgenId)
    return
  }

  // 2. Gem i Supabase
  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      name,
      email,
      phone: phone || null,
      company: company || null,
      investment_amount: amount || null,
      source: 'meta-lead-ad',
    }),
  })

  if (!dbRes.ok) {
    console.error('Supabase error:', await dbRes.text())
    return
  }

  const [lead] = await dbRes.json()

  // 3. Send bekræftelsesmail til lead
  const pdfUrl = `${SITE_URL}/Nectar%20Valby%20Boligfond%20ApS_investeringspræsentation.pdf`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Nectar Boligfond <${FROM_EMAIL}>`,
      to: email,
      reply_to: 'hello@vforviktor.com',
      subject: 'Tak for din interesse — Nectar Valby Boligfond',
      html: confirmationEmail(name, pdfUrl),
    }),
  })

  const emailData = emailRes.ok ? await emailRes.json() : null

  // 4. Gem Resend email-ID
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

  // 5. Intern notifikation
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Nectar Lead System <${FROM_EMAIL}>`,
      to: 'hello@vforviktor.com',
      subject: `Nyt Meta lead: ${name} — ${amount || 'ikke oplyst'}`,
      html: internalEmail({ name, email, phone, company, amount }),
    }),
  })
}

function confirmationEmail(name, pdfUrl) {
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
    <p style="margin:0 0 32px;font-size:15px;color:#4a4a48;line-height:1.7;">Herunder finder du adgang til vores fulde investeringspræsentation med budgetforudsætninger, risikoanalyse og finansielle modeller.</p>
    <div style="text-align:center;margin-bottom:36px;">
      <a href="${pdfUrl}" style="display:inline-block;background:#1C3829;color:#fff;text-decoration:none;padding:14px 32px;border-radius:7px;font-size:14px;font-weight:700;">Download investeringspræsentation (PDF)</a>
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
    <p style="margin:0 0 32px;font-size:15px;color:#4a4a48;line-height:1.7;">Du er velkommen til at svare direkte på denne mail med spørgsmål eller ønske om et møde.</p>
    <p style="margin:0;font-size:14px;color:#8B8B89;line-height:1.7;">Med venlig hilsen<br><strong style="color:#1A1A18;">Thomas Borg &amp; Bjørk Krogshave</strong><br>Nectar Asset Management</p>
  </div>
  <div style="background:#f4f1ed;padding:20px 48px;border-top:1px solid #e8e3dc;">
    <p style="margin:0;font-size:11px;color:#9B9996;line-height:1.6;">⚠ Henvender sig udelukkende til professionelle investorer jf. FAIF-lovgivningen (nr. 23.144). Investering kan medføre tab af hele indskuddet.</p>
  </div>
</div>
</body></html>`
}

function internalEmail({ name, email, phone, company, amount }) {
  const rows = [
    ['Navn', name],
    ['E-mail', `<a href="mailto:${email}" style="color:#1C3829;">${email}</a>`],
    ['Telefon', phone || '—'],
    ['Virksomhed', company || '—'],
    ['Investeringsbeløb', amount || '—'],
    ['Kilde', 'Meta Lead Ad'],
  ].map(([k, v]) => `<tr>
    <td style="padding:10px 16px;font-size:12px;color:#6B6762;background:#f4f1ed;font-weight:600;width:150px;text-transform:uppercase;letter-spacing:0.05em;">${k}</td>
    <td style="padding:10px 16px;font-size:14px;color:#1A1A18;">${v}</td>
  </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1ed;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;">
  <div style="background:#1C3829;padding:20px 32px;">
    <span style="font-size:12px;font-weight:700;color:#fff;letter-spacing:0.1em;text-transform:uppercase;">Nyt Meta Lead — Nectar Boligfond</span>
  </div>
  <div style="padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#1A1A18;line-height:1.6;">Ny henvendelse fra <strong>${name}</strong> via Meta Lead Ad. En bekræftelsesmail med PDF er sendt automatisk.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>
</div>
</body></html>`
}
