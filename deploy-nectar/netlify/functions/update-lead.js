exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'PATCH') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nectar2026'
  if (event.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { id, replied, notes } = body
  if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) }

  const update = {}
  if (replied === true)  update.replied_at = new Date().toISOString()
  if (replied === false) update.replied_at = null
  if (notes !== undefined) update.notes = notes

  await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(update),
  })

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
}
