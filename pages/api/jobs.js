import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { date } = req.query
    const query = supabase.from('jobs').select('*').order('created_at', { ascending: true })
    if (date) query.eq('session_date', date)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ jobs: data })
  }

  if (req.method === 'POST') {
    const { jobs } = req.body
    if (!jobs?.length) return res.status(400).json({ error: 'No jobs provided' })
    const { data, error } = await supabase.from('jobs').upsert(jobs, { onConflict: 'order_id,session_date' }).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ jobs: data })
  }

  if (req.method === 'PATCH') {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: 'Missing id or status' })
    const { data, error } = await supabase
      .from('jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ job: data[0] })
  }

  res.status(405).end()
}
