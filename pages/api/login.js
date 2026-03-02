export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body
  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' })
  }

  res.setHeader('Set-Cookie', `roundit_auth=${process.env.APP_PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`)
  res.status(200).json({ ok: true })
}
