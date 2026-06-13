import { useEffect, useMemo, useState } from 'react'
import { Download, Filter, Play, RefreshCw, Search, Mic2 } from 'lucide-react'
import { api } from '../services/api'
import { useI18n } from '../context/I18nContext'

interface Recording {
  id: number
  call_date: string | null
  src: string | null
  dst: string | null
  duration: number | null
  disposition: string | null
  filename: string
  size_bytes: number | null
  mime_type: string | null
}

export default function RecordingsPage() {
  const { tr, lang } = useI18n()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSrc, setFilterSrc] = useState('')
  const [filterDst, setFilterDst] = useState('')
  const [filterDisposition, setFilterDisposition] = useState('')
  const [selectedAudioUrl, setSelectedAudioUrl] = useState('')
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const fetchRecordings = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('limit', '100')
      if (filterSrc) params.append('src', filterSrc)
      if (filterDst) params.append('dst', filterDst)
      if (filterDisposition) params.append('disposition', filterDisposition)
      const data = await api.getRecordings(params.toString())
      setRecordings(data)
    } catch (error) {
      console.error(tr('Aufzeichnungen konnten nicht geladen werden:', 'Failed to fetch recordings:'), error)
      setRecordings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecordings()
  }, [])

  useEffect(() => {
    return () => {
      if (selectedAudioUrl) URL.revokeObjectURL(selectedAudioUrl)
    }
  }, [selectedAudioUrl])

  const formatDate = (value: string | null) => {
    if (!value) return '-'
    return new Date(value).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatSize = (size: number | null) => {
    if (!size) return '-'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const clearFilters = () => {
    setFilterSrc('')
    setFilterDst('')
    setFilterDisposition('')
    setTimeout(fetchRecordings, 100)
  }

  const openAudio = async (recording: Recording) => {
    setBusyId(recording.id)
    try {
      if (selectedAudioUrl) {
        URL.revokeObjectURL(selectedAudioUrl)
      }
      const blob = await api.fetchRecordingBlob(recording.id, 'play')
      const url = URL.createObjectURL(blob)
      setSelectedAudioUrl(url)
      setSelectedRecording(recording)
    } finally {
      setBusyId(null)
    }
  }

  const downloadRecording = async (recording: Recording) => {
    setBusyId(recording.id)
    try {
      const blob = await api.fetchRecordingBlob(recording.id, 'download')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = recording.filename || `recording-${recording.id}.wav`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setBusyId(null)
    }
  }

  const totalSize = useMemo(() => recordings.reduce((sum, item) => sum + (item.size_bytes || 0), 0), [recordings])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Mic2 className="w-6 h-6" />
            {tr('Anrufaufzeichnungen', 'Call recordings')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tr('Gesamtgröße', 'Total size')}: {formatSize(totalSize)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{tr('Filter', 'Filter')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            value={filterSrc}
            onChange={(e) => setFilterSrc(e.target.value)}
            placeholder={tr('Quelle, z.B. 1000', 'Source, e.g. 1000')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            value={filterDst}
            onChange={(e) => setFilterDst(e.target.value)}
            placeholder={tr('Ziel, z.B. 1001', 'Destination, e.g. 1001')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            value={filterDisposition}
            onChange={(e) => setFilterDisposition(e.target.value)}
            placeholder={tr('Disposition, z.B. ANSWERED', 'Disposition, e.g. ANSWERED')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-end gap-2">
            <button onClick={fetchRecordings} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Search className="w-4 h-4" />
              {tr('Suchen', 'Search')}
            </button>
            <button onClick={clearFilters} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{tr('Aufzeichnungen', 'Recordings')}</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{tr('Laden...', 'Loading...')}</div>
        ) : recordings.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{tr('Keine Aufzeichnungen gefunden', 'No recordings found')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Zeit', 'Time')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Von', 'From')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Nach', 'To')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Dauer', 'Duration')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Größe', 'Size')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{tr('Aktionen', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {recordings.map((recording) => (
                  <tr key={recording.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatDate(recording.call_date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{recording.src || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{recording.dst || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{formatDuration(recording.duration)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{formatSize(recording.size_bytes)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openAudio(recording)}
                          disabled={busyId === recording.id}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          <Play className="w-4 h-4" />
                          {tr('Abspielen', 'Play')}
                        </button>
                        <button
                          onClick={() => downloadRecording(recording)}
                          disabled={busyId === recording.id}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-60"
                        >
                          <Download className="w-4 h-4" />
                          {tr('Download', 'Download')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedRecording && selectedAudioUrl && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{tr('Aktuelle Wiedergabe', 'Current playback')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRecording.src || '-'} → {selectedRecording.dst || '-'}</p>
            </div>
            <button
              onClick={() => {
                URL.revokeObjectURL(selectedAudioUrl)
                setSelectedAudioUrl('')
                setSelectedRecording(null)
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {tr('Schließen', 'Close')}
            </button>
          </div>
          <audio controls autoPlay className="w-full" src={selectedAudioUrl} />
        </div>
      )}
    </div>
  )
}
