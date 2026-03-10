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

function parseNumber(val) {
  if (val == null) return 0
  const str = val.toString().trim().replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function parseTime(val) {
  if (val == null || val.toString().trim() === '') return null
  const str = val.toString().trim().replace('h', ':').replace('H', ':')
  const match = str.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1])
  const m = parseInt(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function parseBool(val) {
  if (val == null) return false
  const str = val.toString().trim().toLowerCase()
  return ['oui', 'yes', 'true', '1', 'strict', 'o', 'y'].includes(str)
}

function extractTimeWindow(row, colFrom, colTo, colStrict) {
  return {
    timeFrom: colFrom ? parseTime(row[colFrom]) : null,
    timeTo: colTo ? parseTime(row[colTo]) : null,
    timeStrict: colStrict ? parseBool(row[colStrict]) : false,
  }
}

export function parsePickingCSV(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (!data.length) throw new Error('Fichier Picking vide')

  const headers = Object.keys(data[0])
  const colOrderId = findCol(headers, ['order_id', 'order', 'id'])
  const colOwner = findCol(headers, ['owner_name', 'owner', 'nom'])
  const colAddress = findCol(headers, ['picking_address', 'picking', 'address', 'adresse'])
  const colParcels = findCol(headers, ['parcels', 'colis', 'nb_colis', 'quantity', 'qty'])
  const colVolume = findCol(headers, ['volume_m3', 'volume', 'vol_m3', 'vol'])
  const colFrom = findCol(headers, ['time_from', 'heure_debut', 'from', 'debut', 'start_time'])
  const colTo = findCol(headers, ['time_to', 'heure_fin', 'to', 'fin', 'end_time'])
  const colStrict = findCol(headers, ['time_strict', 'strict', 'contrainte'])

  if (!colAddress) throw new Error('Colonne adresse introuvable dans le fichier Picking')

  const grouped = {}
  for (const row of data) {
    const address = row[colAddress]?.toString().trim()
    const owner = colOwner ? row[colOwner]?.toString().trim() : address
    const orderId = colOrderId ? row[colOrderId]?.toString().trim() : '?'
    if (!address) continue

    const parcels = colParcels ? Math.round(parseNumber(row[colParcels])) : 0
    const volumeM3 = colVolume ? parseNumber(row[colVolume]) : 0
    const tw = extractTimeWindow(row, colFrom, colTo, colStrict)
    const key = address.toLowerCase()

    if (!grouped[key]) {
      grouped[key] = {
        address,
        owner,
        type: 'picking',
        orders: [],
        orderVolumes: [],
        parcels: 0,
        volumeM3: 0,
        priority: 'medium',
        serviceTime: 15,
        timeFrom: tw.timeFrom,
        timeTo: tw.timeTo,
        timeStrict: tw.timeStrict,
      }
    }
    grouped[key].orders.push(orderId)
    grouped[key].orderVolumes.push(volumeM3)
    grouped[key].parcels += parcels
    grouped[key].volumeM3 += volumeM3
    if (tw.timeFrom !== null && (grouped[key].timeFrom === null || tw.timeFrom < grouped[key].timeFrom)) {
      grouped[key].timeFrom = tw.timeFrom
    }
    if (tw.timeTo !== null && (grouped[key].timeTo === null || tw.timeTo > grouped[key].timeTo)) {
      grouped[key].timeTo = tw.timeTo
    }
    if (tw.timeStrict) grouped[key].timeStrict = true
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
  const colParcels = findCol(headers, ['parcels', 'colis', 'nb_colis', 'quantity', 'qty'])
  const colVolume = findCol(headers, ['volume_m3', 'volume', 'vol_m3', 'vol'])
  const colFrom = findCol(headers, ['time_from', 'heure_debut', 'from', 'debut', 'start_time'])
  const colTo = findCol(headers, ['time_to', 'heure_fin', 'to', 'fin', 'end_time'])
  const colStrict = findCol(headers, ['time_strict', 'strict', 'contrainte'])

  if (!colAddress) throw new Error('Colonne adresse introuvable dans le fichier Delivery')

  const stops = []
  for (const row of data) {
    const address = row[colAddress]?.toString().trim()
    const owner = colOwner ? row[colOwner]?.toString().trim() : 'Particulier'
    const orderId = colOrderId ? row[colOrderId]?.toString().trim() : '?'
    if (!address) continue

    const parcels = colParcels ? Math.round(parseNumber(row[colParcels])) : 0
    const volumeM3 = colVolume ? parseNumber(row[colVolume]) : 0
    const tw = extractTimeWindow(row, colFrom, colTo, colStrict)

    stops.push({
      address,
      owner,
      type: 'delivery',
      orders: [orderId],
      orderVolumes: [volumeM3],
      parcels,
      volumeM3,
      priority: 'medium',
      serviceTime: 10,
      timeFrom: tw.timeFrom,
      timeTo: tw.timeTo,
      timeStrict: tw.timeStrict,
    })
  }
  return stops
}
