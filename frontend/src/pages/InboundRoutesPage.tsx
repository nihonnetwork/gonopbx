import { useEffect, useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Route, Filter, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { useI18n } from '../context/I18nContext'

interface InboundRoute {
  id: number
  did: string
  trunk_id: number
  destination_extension: string
  description: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

interface SIPTrunk {
  id: number
  name: string
  enabled: boolean
}

interface SIPPeer {
  extension: string
  caller_id: string | null
  enabled: boolean
}

interface RingGroup {
  extension: string
  name: string
  enabled: boolean
}

interface IVRMenu {
  extension: string
  name: string
  enabled: boolean
}

interface ConferenceRoom {
  extension: string
  name: string
  enabled: boolean
}

interface AvailableDidGroup {
  trunk_id: number
  trunk_name: string
  dids: string[]
}

interface DestinationOption {
  value: string
  label: string
}

export default function InboundRoutesPage() {
  const { tr } = useI18n()
  const [routes, setRoutes] = useState<InboundRoute[]>([])
  const [trunks, setTrunks] = useState<SIPTrunk[]>([])
  const [peers, setPeers] = useState<SIPPeer[]>([])
  const [groups, setGroups] = useState<RingGroup[]>([])
  const [ivrs, setIvrs] = useState<IVRMenu[]>([])
  const [conferences, setConferences] = useState<ConferenceRoom[]>([])
  const [availableDids, setAvailableDids] = useState<AvailableDidGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<InboundRoute | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterDid, setFilterDid] = useState('')

  const [form, setForm] = useState({
    did: '',
    trunk_id: null as number | null,
    destination_extension: '',
    description: '',
    enabled: true,
  })

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [routeData, trunkData, peerData, groupData, ivrData, confData, didData] = await Promise.all([
        api.getRoutes(),
        api.getTrunks(),
        api.getSipPeers(),
        api.getRingGroups(),
        api.getIvrMenus(),
        api.getConferenceRooms(),
        api.getAvailableDids(),
      ])
      setRoutes(routeData)
      setTrunks(trunkData)
      setPeers(peerData)
      setGroups(groupData)
      setIvrs(ivrData)
      setConferences(confData)
      setAvailableDids(didData)
    } catch (e: any) {
      setError(e.message || tr('Inbound-Routen konnten nicht geladen werden', 'Inbound routes could not be loaded'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const destinationOptions = useMemo<DestinationOption[]>(() => {
    const options: DestinationOption[] = []
    peers.filter(p => p.enabled).sort((a, b) => a.extension.localeCompare(b.extension)).forEach(peer => {
      options.push({
        value: peer.extension,
        label: `${peer.extension}${peer.caller_id ? ` – ${peer.caller_id}` : ''}`,
      })
    })
    groups.filter(g => g.enabled).sort((a, b) => a.extension.localeCompare(b.extension)).forEach(group => {
      options.push({
        value: group.extension,
        label: `${group.extension} – ${tr('Gruppe', 'Group')} ${group.name}`,
      })
    })
    ivrs.filter(i => i.enabled).sort((a, b) => a.extension.localeCompare(b.extension)).forEach(ivr => {
      options.push({
        value: ivr.extension,
        label: `${ivr.extension} – ${tr('IVR', 'IVR')} ${ivr.name}`,
      })
    })
    conferences.filter(c => c.enabled).sort((a, b) => a.extension.localeCompare(b.extension)).forEach(conf => {
      options.push({
        value: conf.extension,
        label: `${conf.extension} – ${tr('Konferenz', 'Conference')} ${conf.name}`,
      })
    })
    return options.sort((a, b) => a.value.localeCompare(b.value))
  }, [peers, groups, ivrs, conferences, tr])

  const trunkOptions = useMemo(() => {
    const options: AvailableDidGroup[] = trunks
      .filter(t => t.enabled)
      .map(t => ({ trunk_id: t.id, trunk_name: t.name, dids: [] }))

    if (editing?.trunk_id && !options.find(t => t.trunk_id === editing.trunk_id)) {
      options.unshift({
        trunk_id: editing.trunk_id,
        trunk_name: tr(`Leitung ${editing.trunk_id}`, `Trunk ${editing.trunk_id}`),
        dids: editing.did ? [editing.did] : [],
      })
    }

    return options
  }, [trunks, editing, tr])

  const didOptions = useMemo(() => {
    if (!form.trunk_id) return [] as string[]
    const trunk = availableDids.find(t => t.trunk_id === form.trunk_id)
    const dids: string[] = trunk ? [...trunk.dids] : []
    if (editing?.did && !dids.includes(editing.did)) dids.unshift(editing.did)
    return dids
  }, [form.trunk_id, availableDids, editing])

  const destinationLabel = (ext: string) => {
    const peer = peers.find(p => p.extension === ext)
    if (peer) return `${ext}${peer.caller_id ? ` – ${peer.caller_id}` : ''}`
    const group = groups.find(g => g.extension === ext)
    if (group) return `${ext} – ${tr('Gruppe', 'Group')} ${group.name}`
    const ivr = ivrs.find(i => i.extension === ext)
    if (ivr) return `${ext} – ${tr('IVR', 'IVR')} ${ivr.name}`
    const conf = conferences.find(c => c.extension === ext)
    if (conf) return `${ext} – ${tr('Konferenz', 'Conference')} ${conf.name}`
    return ext
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      did: '',
      trunk_id: null,
      destination_extension: '',
      description: '',
      enabled: true,
    })
    setError('')
    setShowForm(true)
  }

  const openEdit = (route: InboundRoute) => {
    setEditing(route)
    setForm({
      did: route.did,
      trunk_id: route.trunk_id,
      destination_extension: route.destination_extension,
      description: route.description || '',
      enabled: route.enabled,
    })
    setError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        trunk_id: form.trunk_id || 0,
        description: form.description || null,
      }
      if (editing) {
        await api.updateRoute(editing.id, payload)
      } else {
        await api.createRoute(payload)
      }
      setShowForm(false)
      await fetchAll()
    } catch (err: any) {
      setError(err.message || tr('Fehler beim Speichern', 'Error while saving'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (route: InboundRoute) => {
    if (!confirm(tr(`Inbound-Route ${route.did} wirklich löschen?`, `Really delete inbound route ${route.did}?`))) return
    try {
      await api.deleteRoute(route.id)
      await fetchAll()
    } catch (err: any) {
      alert(err.message || tr('Fehler beim Löschen', 'Error while deleting'))
    }
  }

  const filteredRoutes = routes.filter(route => !filterDid || route.did.includes(filterDid))

  const routeCountByTrunk = useMemo(() => {
    const map = new Map<number, number>()
    routes.forEach(route => map.set(route.trunk_id, (map.get(route.trunk_id) || 0) + 1))
    return map
  }, [routes])

  if (loading) {
    return <div className="p-6 text-gray-500">{tr('Lade Inbound-Routen…', 'Loading inbound routes...')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{tr('Inbound Routes', 'Inbound routes')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tr('Weisen Sie DIDs eines Trunks gezielt Nebenstellen, Gruppen, IVRs oder Konferenzen zu.', 'Map trunk DIDs directly to extensions, groups, IVRs, or conferences.')}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {tr('Neue Route', 'New route')}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-gray-500 dark:text-gray-400">{tr('Routen', 'Routes')}</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{routes.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-gray-500 dark:text-gray-400">{tr('Trunks', 'Trunks')}</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{trunks.filter(t => t.enabled).length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="text-gray-500 dark:text-gray-400">{tr('DIDs verfügbar', 'DIDs available')}</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{availableDids.reduce((sum, g) => sum + g.dids.length, 0)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{tr('Filter', 'Filter')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            value={filterDid}
            onChange={(e) => setFilterDid(e.target.value)}
            placeholder={tr('DID filtern, z.B. +49', 'Filter DID, e.g. +49')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-end gap-2">
            <button
              onClick={fetchAll}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              {tr('Aktualisieren', 'Refresh')}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{tr('Konfigurierte Routen', 'Configured routes')}</h2>
        </div>
        {filteredRoutes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{tr('Keine Inbound-Routen gefunden', 'No inbound routes found')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('DID', 'DID')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Trunk', 'Trunk')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Ziel', 'Destination')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Beschreibung', 'Description')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Status', 'Status')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Aktionen', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRoutes.map((route) => {
                  const trunk = trunkOptions.find(t => t.trunk_id === route.trunk_id)
                  return (
                    <tr key={route.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{route.did}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{trunk?.trunk_name || `Trunk ${route.trunk_id}`}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{destinationLabel(route.destination_extension)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{route.description || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${route.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {route.enabled ? tr('Aktiv', 'Active') : tr('Inaktiv', 'Inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEdit(route)}
                            className="p-2 text-gray-500 hover:text-blue-600"
                            title={tr('Bearbeiten', 'Edit')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(route)}
                            className="p-2 text-gray-500 hover:text-red-600"
                            title={tr('Löschen', 'Delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {editing ? tr('Inbound-Route bearbeiten', 'Edit inbound route') : tr('Inbound-Route anlegen', 'Create inbound route')}
                </h3>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Trunk', 'Trunk')}</label>
                  <select
                    value={form.trunk_id ?? ''}
                    onChange={(e) => {
                      const nextId = e.target.value ? Number(e.target.value) : null
                      setForm({ ...form, trunk_id: nextId, did: '' })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  >
                    <option value="">{tr('Leitung wählen', 'Select trunk')}</option>
                    {trunkOptions.map(t => (
                      <option key={t.trunk_id} value={t.trunk_id}>{t.trunk_name} {routeCountByTrunk.has(t.trunk_id) ? `(${routeCountByTrunk.get(t.trunk_id)})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('DID', 'DID')}</label>
                  <select
                    value={form.did}
                    onChange={(e) => setForm({ ...form, did: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    disabled={!form.trunk_id}
                    required
                  >
                    <option value="">{tr('Rufnummer wählen', 'Select number')}</option>
                    {didOptions.map(did => <option key={did} value={did}>{did}</option>)}
                  </select>
                  <div className="text-xs text-gray-500 mt-1">{tr('Nur freie DIDs werden angezeigt. Bereits zugewiesene DIDs bleiben beim Bearbeiten erhalten.', 'Only free DIDs are shown. Already assigned DIDs stay available while editing.')}</div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Ziel', 'Destination')}</label>
                  <select
                    value={form.destination_extension}
                    onChange={(e) => setForm({ ...form, destination_extension: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  >
                    <option value="">{tr('Ziel auswählen', 'Select destination')}</option>
                    {destinationOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Beschreibung', 'Description')}</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={tr('Optional', 'Optional')}
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3">
                  <input
                    id="route-enabled"
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="route-enabled" className="text-sm text-gray-700 dark:text-gray-300">{tr('Route aktivieren', 'Enable route')}</label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                >
                  {tr('Abbrechen', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium"
                >
                  <Route className="w-4 h-4" />
                  {saving ? tr('Speichern…', 'Saving...') : tr('Speichern', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
