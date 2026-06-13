import { useEffect, useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Users } from 'lucide-react'
import { api } from '../services/api'
import { useI18n } from '../context/I18nContext'

interface ConferenceRoom {
  id: number
  name: string
  extension: string
  pin: string | null
  admin_pin: string | null
  max_participants: number
  inbound_trunk_id: number | null
  inbound_did: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

interface AvailableDidGroup {
  trunk_id: number
  trunk_name: string
  dids: string[]
}

export default function ConferenceRoomsPage() {
  const { tr } = useI18n()
  const [rooms, setRooms] = useState<ConferenceRoom[]>([])
  const [availableDids, setAvailableDids] = useState<AvailableDidGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ConferenceRoom | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    extension: '',
    pin: '',
    admin_pin: '',
    max_participants: 10,
    inbound_trunk_id: null as number | null,
    inbound_did: '',
    enabled: true,
  })

  const fetchAll = async () => {
    try {
      const [roomData, didData] = await Promise.all([
        api.getConferenceRooms(),
        api.getAvailableDids(),
      ])
      setRooms(roomData)
      setAvailableDids(didData)
    } catch (e: any) {
      setError(e.message || tr('Konferenzräume konnten nicht geladen werden', 'Conference rooms could not be loaded'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const availableExtensions = useMemo(() => {
    const used = new Set(rooms.map(room => room.extension))
    const list: string[] = []
    for (let i = 7000; i <= 7999; i++) {
      const ext = String(i)
      if (!used.has(ext)) list.push(ext)
    }
    if (editing?.extension && !list.includes(editing.extension)) {
      list.unshift(editing.extension)
    }
    return list
  }, [rooms, editing])

  const trunkOptions = useMemo(() => {
    const options = [...availableDids]
    if (editing?.inbound_trunk_id && !options.find(t => t.trunk_id === editing.inbound_trunk_id)) {
      options.unshift({
        trunk_id: editing.inbound_trunk_id,
        trunk_name: tr(`Leitung ${editing.inbound_trunk_id}`, `Trunk ${editing.inbound_trunk_id}`),
        dids: editing.inbound_did ? [editing.inbound_did] : [],
      })
    }
    return options
  }, [availableDids, editing, tr])

  const didOptions = useMemo(() => {
    if (!form.inbound_trunk_id) return []
    const trunk = trunkOptions.find(t => t.trunk_id === form.inbound_trunk_id)
    const dids = trunk ? [...trunk.dids] : []
    if (editing?.inbound_did && !dids.includes(editing.inbound_did)) {
      dids.unshift(editing.inbound_did)
    }
    return dids
  }, [form.inbound_trunk_id, trunkOptions, editing])

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '',
      extension: '',
      pin: '',
      admin_pin: '',
      max_participants: 10,
      inbound_trunk_id: null,
      inbound_did: '',
      enabled: true,
    })
    setError('')
    setShowForm(true)
  }

  const openEdit = (room: ConferenceRoom) => {
    setEditing(room)
    setForm({
      name: room.name,
      extension: room.extension,
      pin: room.pin || '',
      admin_pin: room.admin_pin || '',
      max_participants: room.max_participants || 10,
      inbound_trunk_id: room.inbound_trunk_id || null,
      inbound_did: room.inbound_did || '',
      enabled: room.enabled,
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
        pin: form.pin || null,
        admin_pin: form.admin_pin || null,
        inbound_trunk_id: form.inbound_did ? form.inbound_trunk_id : null,
        inbound_did: form.inbound_did || null,
      }
      if (editing) {
        await api.updateConferenceRoom(editing.id, payload)
      } else {
        await api.createConferenceRoom(payload)
      }
      setShowForm(false)
      await fetchAll()
    } catch (err: any) {
      setError(err.message || tr('Fehler beim Speichern', 'Error while saving'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (room: ConferenceRoom) => {
    if (!confirm(tr(`Konferenzraum ${room.name} wirklich löschen?`, `Really delete conference room ${room.name}?`))) return
    try {
      await api.deleteConferenceRoom(room.id)
      await fetchAll()
    } catch (err: any) {
      alert(err.message || tr('Fehler beim Löschen', 'Error while deleting'))
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-500">{tr('Lade Konferenzräume…', 'Loading conference rooms...')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{tr('Konferenzräume', 'Conference rooms')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tr('Richten Sie ConfBridge-Konferenzräume mit optionaler PIN und Einwahlrufnummer ein.', 'Configure ConfBridge conference rooms with optional PIN and inbound DID.')}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {tr('Konferenzraum hinzufügen', 'Add conference room')}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {editing ? tr('Konferenzraum bearbeiten', 'Edit conference room') : tr('Neuer Konferenzraum', 'New conference room')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Name', 'Name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Nebenstelle', 'Extension')}</label>
              <select
                value={form.extension}
                onChange={e => setForm({ ...form, extension: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              >
                <option value="">{tr('Auswählen…', 'Select...')}</option>
                {availableExtensions.map(ext => <option key={ext} value={ext}>{ext}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Teilnehmer-PIN', 'Participant PIN')}</label>
              <input
                type="text"
                value={form.pin}
                onChange={e => setForm({ ...form, pin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder={tr('Optional', 'Optional')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Admin-PIN', 'Admin PIN')}</label>
              <input
                type="text"
                value={form.admin_pin}
                onChange={e => setForm({ ...form, admin_pin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder={tr('Optional', 'Optional')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Max. Teilnehmer', 'Max participants')}</label>
              <input
                type="number"
                min="2"
                max="100"
                value={form.max_participants}
                onChange={e => setForm({ ...form, max_participants: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Leitung', 'Trunk')}</label>
              <select
                value={form.inbound_trunk_id || ''}
                onChange={e => setForm({ ...form, inbound_trunk_id: e.target.value ? Number(e.target.value) : null, inbound_did: '' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">{tr('Keine', 'None')}</option>
                {trunkOptions.map(trunk => <option key={trunk.trunk_id} value={trunk.trunk_id}>{trunk.trunk_name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{tr('Einwahlrufnummer', 'Inbound DID')}</label>
              <select
                value={form.inbound_did}
                onChange={e => setForm({ ...form, inbound_did: e.target.value })}
                disabled={!form.inbound_trunk_id}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">{tr('Keine', 'None')}</option>
                {didOptions.map(did => <option key={did} value={did}>{did}</option>)}
              </select>
            </div>

            <label className="flex items-center gap-2 mt-7 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => setForm({ ...form, enabled: e.target.checked })}
                className="rounded border-gray-300"
              />
              {tr('Aktiv', 'Enabled')}
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
            >
              {tr('Abbrechen', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {saving ? tr('Speichert…', 'Saving...') : tr('Speichern', 'Save')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left">{tr('Name', 'Name')}</th>
                <th className="px-4 py-3 text-left">{tr('Nebenstelle', 'Extension')}</th>
                <th className="px-4 py-3 text-left">{tr('PIN', 'PIN')}</th>
                <th className="px-4 py-3 text-left">{tr('Admin-PIN', 'Admin PIN')}</th>
                <th className="px-4 py-3 text-left">{tr('Teilnehmer', 'Participants')}</th>
                <th className="px-4 py-3 text-left">{tr('DID', 'DID')}</th>
                <th className="px-4 py-3 text-left">{tr('Status', 'Status')}</th>
                <th className="px-4 py-3 text-right">{tr('Aktionen', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {tr('Keine Konferenzräume vorhanden.', 'No conference rooms configured.')}
                  </td>
                </tr>
              ) : rooms.map(room => (
                <tr key={room.id} className="text-gray-800 dark:text-gray-200">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />{room.name}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{room.extension}</td>
                  <td className="px-4 py-3">{room.pin || '-'}</td>
                  <td className="px-4 py-3">{room.admin_pin || '-'}</td>
                  <td className="px-4 py-3">{room.max_participants}</td>
                  <td className="px-4 py-3">{room.inbound_did || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${room.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {room.enabled ? tr('Aktiv', 'Enabled') : tr('Inaktiv', 'Disabled')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(room)} className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(room)} className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
