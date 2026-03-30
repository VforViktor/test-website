exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  let payload
  try { payload = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const { type, data } = payload
  const resendId = data?.email_id

  if (!resendId) return { statusCode: 200, body: 'No email_id' }

  const fieldMap = {
    'email.delivered': 'email_delivered_at',
    'email.opened':    'email_opened_at',
  }

  const field = fieldMap[type]
  if (!field) return { statusCode: 200, body: 'Event not tracked' }

  await fetch(`${SUPABASE_URL}/rest/v1/leads?email_resend_id=eq.${resendId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ [field]: new Date().toISOString() }),
  })

  return { statusCode: 200, body: 'OK' }
}
