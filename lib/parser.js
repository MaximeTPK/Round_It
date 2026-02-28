import Papa from 'papaparse'

function normalizeKey(k) {
  return k.toLowerCase().trim().replace(/\s+/g, '_')
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const found = headers.find(h => normalizeKey(h).includes(c))
    if (found) return found
  }
  return null
}

export function parsePickingCSV(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (!data.length) throw new Error('Fichier Picking vide')
  const headers = Object.keys(data[0])
  const colOrderId = findCol(headers, ['order_id', 'order', 'id'])
  const colOwner = findCol(headers, ['owner_name', 'owner', 'nom'])
  const colAddress = findCol(headers, ['picking_address', 'picking', 'address', 'adresse'])
  if (!colAddress) throw new Error('Colonne adresse introuvable dans le fichier Picking')

  const grouped = {}
  for (const row of data) {
    const address = row[colAddress]?.toString().trim()
    const owner = colOwner ? row[colOwner]?.toString().trim() : address
    const orderId = colOrderId ? row[colOrderId]?.toString().trim() : '?'
    if (!address) continue
    const key = address.toLowerCase()
    if (!grouped[key]) {
      grouped[key] = { address, owner, type: 'picking', orders: [], serviceTime: 15 }
    }
    grouped[key].orders.push(orderId)
    grouped[key].serviceTime = Math.max(15, grouped[key].orders.length * 5)
  }
  return Object.values(grouped)
}

export function parseDeliveryCSV(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (!data.length) throw new Error('Fichier Delivery vide')
  const headers = Object.keys(data[0])
  const colOrderId = findCol(headers, ['order_id', 'order', 'id'])
  const colOwner = findCol(headers, ['owner_name', 'owner', 'nom'])
  const colAddress = findCol(headers, ['delivery_address', 'delivery', 'address', 'adresse'])
  if (!colAddress) throw new Error('Colonne adresse introuvable dans le fichier Delivery')

  const stops = []
  for (const row of data) {
    const address = row[colAddress]?.toString().trim()
    const owner = colOwner ? row[colOwner]?.toString().trim() : 'Particulier'
    const orderId = colOrderId ? row[colOrderId]?.toString().trim() : '?'
    if (!address) continue
    stops.push({ address, owner, type: 'delivery', orders: [orderId], serviceTime: 10 })
  }
  return stops
}
