import { useState } from 'react'

const STATUS_LABELS = {
  fr: { available: 'Disponible', assigned: 'En tournée', maintenance: 'Maintenance' },
  en: { available: 'Available', assigned: 'Assigned', maintenance: 'Maintenance' },
}
const STATUS_COLORS = { available: '#059669', assigned: '#2563EB', maintenance: '#D97706' }
const STATUS_BG = { available: '#F0FDF4', assigned: '#EFF6FF', maintenance: '#FFFBEB' }
const STATUS_ICONS = { available: '🟢', assigned: '🚛', maintenance: '🔧' }

const TRUCK_COLORS = ['#2ECC8F', '#0891B2', '#0D9488', '#7C3AED', '#B45309', '#BE123C', '#15803D', '#C2410C']

export default function FleetPanel({ trucks, plan, lang, isManager, onUpdateTruck, onAddTruck, onDeleteTruck, allProfiles }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editParcels, setEditParcels] = useState('')
  const [editVolume, setEditVolume] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const fr = lang === 'fr'

  // Match trucks with plan data
  const getTruckPlan = (truckId) => {
    if (!plan || plan.length === 0) return null
    for (const day of plan) {
      const t = day.trucks.find(t => t.truckId === truckId)
      if (t && t.stops.length > 0) return t
    }
    return null
  }

  const getCreatorNames = (truckPlan) => {
    if (!truckPlan || !allProfiles) return []
    const ids = new Set()
    truckPlan.stops.forEach(s => {
      const cid = s.created_by || s.user_id
      if (cid) ids.add(cid)
    })
    return [...ids].map(id => {
      const p = allProfiles.find(pp => pp.id === id)
      return p?.full_name || p?.email?.split('@')[0] || '?'
    })
  }

  const startEdit = (truck) => {
    setEditingId(truck.id)
    setEditName(truck.name)
    setEditParcels(truck.max_parcels || '')
    setEditVolume(truck.max_volume_m3 || '')
  }

  const saveEdit = () => {
    if (!editingId) return
    onUpdateTruck(editingId, {
      name: editName.trim() || 'Camion',
      max_parcels: editParcels ? parseInt(editParcels) : null,
      max_volume_m3: editVolume ? parseFloat(editVolume) : null,
    })
    setEditingId(null)
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    onAddTruck(newName.trim())
    setNewName('')
    setShowAddForm(false)
  }

  const assignedCount = trucks.filter(t => {
    const tp = getTruckPlan(t.id)
    return tp && tp.stops.length > 0
  }).length
  const availableCount = trucks.filter(t => t.status === 'available' && !getTruckPlan(t.id)).length
  const maintenanceCount = trucks.filter(t => t.status === 'maintenance').length

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ padding: '5px 12px', background: '#F0FDF4', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#059669', border: '1px solid #BBF7D0' }}>
          🟢 {availableCount} {fr ? 'dispo' : 'free'}
        </div>
        <div style={{ padding: '5px 12px', background: '#EFF6FF', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#2563EB', border: '1px solid #BFDBFE' }}>
          🚛 {assignedCount}/{trucks.length} {fr ? 'en tournée' : 'assigned'}
        </div>
        {maintenanceCount > 0 && (
          <div style={{ padding: '5px 12px', background: '#FFFBEB', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#D97706', border: '1px solid #FDE68A' }}>
            🔧 {maintenanceCount} {fr ? 'maintenance' : 'maintenance'}
          </div>
        )}
      </div>

      {/* Truck cards */}
      {trucks.filter(t => t.active !== false).map((truck, ti) => {
        const truckPlan = getTruckPlan(truck.id) || getTruckPlan(ti + 1)
        const hasRoute = truckPlan && truckPlan.stops.length > 0
        const effectiveStatus = truck.status === 'maintenance' ? 'maintenance' : hasRoute ? 'assigned' : 'available'
        const creators = getCreatorNames(truckPlan)
        const isEditing = editingId === truck.id
        const color = TRUCK_COLORS[ti % TRUCK_COLORS.length]

        return (
          <div key={truck.id} style={{
            border: '1px solid ' + (hasRoute ? color + '40' : 'var(--border)'),
            borderRadius: 10,
            background: hasRoute ? color + '08' : 'var(--white)',
            borderLeft: '4px solid ' + (effectiveStatus === 'maintenance' ? '#D97706' : hasRoute ? color : '#D6EAE4'),
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{STATUS_ICONS[effectiveStatus]}</span>

              {isEditing ? (
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 600, outline: 'none', fontFamily: 'DM Sans,sans-serif' }}
                  autoFocus />
              ) : (
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{truck.name}</span>
              )}

              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                background: STATUS_BG[effectiveStatus], color: STATUS_COLORS[effectiveStatus],
              }}>
                {STATUS_LABELS[lang]?.[effectiveStatus] || effectiveStatus}
              </span>

              {isManager && !isEditing && (
                <span onClick={() => startEdit(truck)} style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer', padding: '2px 4px' }} title={fr ? 'Modifier' : 'Edit'}>✏️</span>
              )}
            </div>

            {/* Edit form */}
            {isEditing && isManager && (
              <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{fr ? 'Max colis' : 'Max parcels'}</div>
                    <input value={editParcels} onChange={e => setEditParcels(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="∞" style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, outline: 'none', textAlign: 'center' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{fr ? 'Max m³' : 'Max m³'}</div>
                    <input value={editVolume} onChange={e => setEditVolume(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                      placeholder="∞" style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, outline: 'none', textAlign: 'center' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{fr ? 'Statut' : 'Status'}</div>
                    <select value={truck.status || 'available'} onChange={e => onUpdateTruck(truck.id, { status: e.target.value })}
                      style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                      <option value="available">{fr ? 'Disponible' : 'Available'}</option>
                      <option value="maintenance">{fr ? 'Maintenance' : 'Maintenance'}</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveEdit}
                    style={{ flex: 1, padding: '6px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✓ {fr ? 'Enregistrer' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)}
                    style={{ flex: 1, padding: '6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>
                    {fr ? 'Annuler' : 'Cancel'}
                  </button>
                  <button onClick={() => { if (confirm(fr ? 'Supprimer ce camion ?' : 'Delete this truck?')) { onDeleteTruck(truck.id); setEditingId(null) } }}
                    style={{ padding: '6px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 11, fontWeight: 600, color: 'var(--danger)', cursor: 'pointer' }}>
                    🗑
                  </button>
                </div>
              </div>
            )}

            {/* Route summary */}
            {hasRoute && !isEditing && (
              <div style={{ padding: '0 12px 10px' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500 }}>📍 {truckPlan.stops.length} stops</span>
                  <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500 }}>🗺 {truckPlan.totalDistance} km</span>
                  <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 500 }}>🏠 {fr ? 'retour' : 'return'} {truckPlan.returnTime}</span>
                </div>
                {truckPlan.totalParcels > 0 && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>📦 {truckPlan.totalParcels} {fr ? 'colis' : 'parcels'}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>📐 {truckPlan.totalVolumeM3} m³</span>
                    {truck.max_parcels && <span style={{ fontSize: 9, color: truckPlan.totalParcels > truck.max_parcels ? 'var(--danger)' : 'var(--muted)' }}>({Math.round(truckPlan.totalParcels / truck.max_parcels * 100)}%)</span>}
                    {truck.max_volume_m3 && <span style={{ fontSize: 9, color: truckPlan.totalVolumeM3 > truck.max_volume_m3 ? 'var(--danger)' : 'var(--muted)' }}>({Math.round(truckPlan.totalVolumeM3 / truck.max_volume_m3 * 100)}%)</span>}
                  </div>
                )}
                {/* Alerts */}
                {truckPlan.stops.some(s => s.lateBy > 0) && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 500 }}>⚠️ {truckPlan.stops.filter(s => s.lateBy > 0).length} {fr ? 'retard(s)' : 'late'}</div>
                )}
                {truckPlan.stops.some(s => s.needsTwoDrivers) && (
                  <div style={{ fontSize: 10, color: '#7C3AED', fontWeight: 500 }}>💪 {truckPlan.stops.filter(s => s.needsTwoDrivers).length} {fr ? 'stop(s) 2 chauffeurs' : '2-driver stop(s)'}</div>
                )}
                {creators.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>👤 {creators.join(', ')}</div>
                )}
              </div>
            )}

            {/* Capacity bar */}
            {!isEditing && (truck.max_parcels || truck.max_volume_m3) && (
              <div style={{ padding: '0 12px 8px' }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--muted)' }}>
                  {truck.max_parcels && <span>{fr ? 'Cap.' : 'Cap.'} {truck.max_parcels} {fr ? 'colis' : 'parcels'}</span>}
                  {truck.max_volume_m3 && <span>{fr ? 'Cap.' : 'Cap.'} {truck.max_volume_m3} m³</span>}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!hasRoute && !isEditing && effectiveStatus === 'available' && (
              <div style={{ padding: '0 12px 10px', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
                {fr ? 'Aucune tournée assignée' : 'No route assigned'}
              </div>
            )}
            {effectiveStatus === 'maintenance' && !isEditing && (
              <div style={{ padding: '0 12px 10px', fontSize: 10, color: '#D97706', fontStyle: 'italic' }}>
                🔧 {fr ? 'En maintenance — indisponible' : 'Under maintenance — unavailable'}
              </div>
            )}
          </div>
        )
      })}

      {/* Add truck button */}
      {isManager && !showAddForm && (
        <button onClick={() => setShowAddForm(true)}
          style={{ padding: '10px', border: '1.5px dashed var(--border)', borderRadius: 10, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>
          + {fr ? 'Ajouter un camion' : 'Add a truck'}
        </button>
      )}
      {isManager && showAddForm && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder={fr ? 'Nom du camion' : 'Truck name'}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif' }}
            autoFocus />
          <button onClick={handleAdd} disabled={!newName.trim()}
            style={{ padding: '8px 14px', background: !newName.trim() ? 'var(--border)' : 'var(--navy)', color: !newName.trim() ? 'var(--muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            +
          </button>
          <button onClick={() => { setShowAddForm(false); setNewName('') }}
            style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
