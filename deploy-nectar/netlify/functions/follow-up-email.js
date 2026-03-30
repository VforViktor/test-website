// Scheduled function — kører dagligt kl. 9:00 UTC
// Sender opfølgningsmail til leads der er 3 dage gamle og ikke besvaret

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  const RESEND_KEY   = process.env.RESEND_KEY
  const FROM_EMAIL   = process.env.FROM_EMAIL || 'onboarding@resend.dev'
  const SITE_URL     = process.env.URL || 'https://nectarprojekter.dk'

  // Leads der er mellem 2,5 og 3,5 dage gamle, ikke besvaret, ingen follow-up sendt endnu
  const now       = new Date()
  const from      = new Date(now - 3.5 * 24 * 60 * 60 * 1000).toISOString()
  const to        = new Date(now - 2.5 * 24 * 60 * 60 * 1000).toISOString()

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?created_at=gte.${from}&created_at=lte.${to}&replied_at=is.null&follow_up_sent_at=is.null&select=id,name,email`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  )

  if (!res.ok) {
    console.error('Supabase query failed:', await res.text())
    return { statusCode: 500, body: 'Supabase error' }
  }

  const leads = await res.json()
  console.log(`Follow-up: ${leads.length} leads at behandle`)

  for (const lead of leads) {
    // Send follow-up mail til leadet
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Nectar Boligfond <${FROM_EMAIL}>`,
        to: lead.email,
        reply_to: 'kontakt@nectarprojekter.dk',
        subject: 'Har du haft tid til at kigge præsentationen igennem?',
        html: followUpEmail(lead.name, SITE_URL),
      }),
    })

    if (!emailRes.ok) {
      console.error(`Kunne ikke sende follow-up til ${lead.email}:`, await emailRes.text())
      continue
    }

    // Opdatér follow_up_sent_at i Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ follow_up_sent_at: new Date().toISOString() }),
    })

    console.log(`Follow-up sendt til ${lead.email}`)
  }

  return { statusCode: 200, body: `Sendt ${leads.length} follow-up mails` }
}

function followUpEmail(name, siteUrl) {
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
    <p style="margin:0 0 16px;font-size:15px;color:#4a4a48;line-height:1.7;">For et par dage siden sendte vi dig investeringspræsentationen for Nectar Valby Boligfond. Vi ville høre, om du har haft mulighed for at kigge den igennem?</p>
    <p style="margin:0 0 32px;font-size:15px;color:#4a4a48;line-height:1.7;">Vi er naturligvis til rådighed for spørgsmål eller et uforpligtende møde, hvis casen vækker interesse. Du er meget velkommen til at svare direkte på denne mail.</p>
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
    <div style="text-align:center;margin-bottom:36px;">
      <a href="${pdfUrl}" style="display:inline-block;background:#1C3829;color:#fff;text-decoration:none;padding:14px 32px;border-radius:7px;font-size:14px;font-weight:700;">Se præsentationen igen (PDF)</a>
    </div>
    <p style="margin:0;font-size:14px;color:#8B8B89;line-height:1.7;">Med venlig hilsen<br><strong style="color:#1A1A18;">Thomas Borg &amp; Bjørk Krogshave</strong><br>Nectar Asset Management</p>
  </div>
  <div style="background:#f4f1ed;padding:20px 48px;border-top:1px solid #e8e3dc;">
    <p style="margin:0;font-size:11px;color:#9B9996;line-height:1.6;">⚠ Henvender sig udelukkende til professionelle investorer jf. FAIF-lovgivningen (nr. 23.144). Ønsker du ikke at modtage yderligere henvendelser, bedes du svare på denne mail.</p>
  </div>
</div>
</body></html>`
}
