import { useState, useEffect, useMemo } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import { parseQuery } from './utils/queryParser'

interface NetstatItem {
  protocol: string
  local: {
    address: string | null
    port: number
  }
  remote: {
    address: string | null
    port: number | null
  }
  state: string
  pid: number
  processName: string
}

type ProtocolFilter = 'all' | 'tcp' | 'udp'
type IpVerFilter = 'all' | '4' | '6'
type StateFilter = 'all' | 'listen' | 'established' | 'other'

function App() {
  const [data, setData] = useState<NetstatItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Filter States
  const [searchText, setSearchText] = useState('')
  const [filterProtocol, setFilterProtocol] = useState<ProtocolFilter>('all')
  const [filterIpVer, setFilterIpVer] = useState<IpVerFilter>('all')
  const [filterState, setFilterState] = useState<StateFilter>('all')

  const handleMinimize = () => window.electron.ipcRenderer.send('window-minimize')
  const handleMaximize = () => window.electron.ipcRenderer.send('window-maximize')
  const handleClose = () => window.electron.ipcRenderer.send('window-close')

  const fetchData = async () => {
    // If we are already loading, don't stack requests (prevents lag if request takes > 2s)
    if (loading) return

    setLoading(true)
    try {
      // @ts-ignore
      const result = await window.electron.ipcRenderer.invoke('get-netstat')
      setData(result)
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData()
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [autoRefresh])

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // 1. Protocol Filter
      if (filterProtocol !== 'all') {
        if (!item.protocol.startsWith(filterProtocol)) return false
      }

      // 2. IP Version Filter
      if (filterIpVer !== 'all') {
        const isV6 = item.protocol.endsWith('6')
        if (filterIpVer === '4' && isV6) return false
        if (filterIpVer === '6' && !isV6) return false
      }

      // 3. State Filter
      if (filterState !== 'all') {
        if (!item.state) {
          // If item has no state (like UDP often), hide if we require a specific state like LISTEN
          if (filterState !== 'other') return false
        } else {
          const s = item.state.toUpperCase()
          if (filterState === 'listen' && s !== 'LISTEN' && s !== 'LISTENING') return false
          if (filterState === 'established' && s !== 'ESTABLISHED') return false
          if (
            filterState === 'other' &&
            (s === 'LISTEN' || s === 'LISTENING' || s === 'ESTABLISHED')
          )
            return false
        }
      }

      // 4. Text Filter (Process Name, PID, Port - supports Wildcard & Range & Semantic Query)
      if (searchText) {
        const query = searchText.trim()

        // Try Semantic Query First
        const semanticFilter = parseQuery(query)
        if (semanticFilter) {
          if (!semanticFilter(item)) return false
        } else {
          // Fallback to Simple Text / Range Search
          const lowerQuery = query.toLowerCase()

          // Range Check (e.g. "80-443")
          const rangeMatch = lowerQuery.match(/^(\d+)-(\d+)$/)
          if (rangeMatch) {
            const min = parseInt(rangeMatch[1])
            const max = parseInt(rangeMatch[2])
            const localPort = item.local.port
            const remotePort = item.remote.port || 0
            const pid = item.pid

            // Check if any numeric field falls in range
            const portInRange =
              (localPort >= min && localPort <= max) || (remotePort >= min && remotePort <= max)
            const pidInRange = pid >= min && pid <= max

            if (!portInRange && !pidInRange) return false
          } else {
            // Normal/Wildcard Match
            // Handle explicit wildcards '*'
            const isWildcard = lowerQuery.includes('*')
            const regexString = lowerQuery
              .split('*')
              .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*')
            const regex = new RegExp(`^${regexString}$`, 'i')

            const matchString = (str: string | number | null) => {
              if (!str) return false
              const s = str.toString().toLowerCase()
              if (isWildcard) return regex.test(s)
              return s.includes(lowerQuery)
            }

            const matchesProcess = matchString(item.processName)
            const matchesPid = matchString(item.pid)
            const matchesLocalPort = matchString(item.local.port)
            const matchesRemotePort = matchString(item.remote.port)
            const matchesState = matchString(item.state)

            if (
              !matchesProcess &&
              !matchesPid &&
              !matchesLocalPort &&
              !matchesRemotePort &&
              !matchesState
            )
              return false
          }
        }
      }

      return true
    })
  }, [data, filterProtocol, filterIpVer, filterState, searchText])

  return (
    <div className="h-screen flex flex-col bg-gray-100 text-gray-900 overflow-hidden">
      <div className="bg-white shadow-sm z-10 flex-shrink-0 drag-region">
        {/* Title Bar / Header Row */}
        <div className="flex justify-between items-center w-full">
          <div className="px-8 py-3 flex items-center gap-2 select-none">
            <h1 className="text-xl font-bold text-blue-600">Netstat Cat</h1>
            <span className="text-lg">🐱</span>
          </div>

          {/* Custom Window Controls */}
          <div className="flex no-drag h-full self-start">
            <button
              onClick={handleMinimize}
              className="px-4 py-3 hover:bg-gray-100 transition-colors flex items-center justify-center group"
              title="Minimize"
            >
              <div className="w-3 h-[1px] bg-gray-600 group-hover:bg-gray-900"></div>
            </button>
            <button
              onClick={handleMaximize}
              className="px-4 py-3 hover:bg-gray-100 transition-colors flex items-center justify-center group"
              title="Maximize"
            >
              <div className="w-3 h-3 border border-gray-600 group-hover:border-gray-900"></div>
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-3 hover:bg-red-600 transition-colors flex items-center justify-center group"
              title="Close"
            >
              <svg className="w-3 h-3 text-gray-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters & Controls Row */}
        <div className="px-8 pb-4 w-full space-y-3 no-drag">
            {/* Search + Refresh Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-grow w-full">
                  <input
                    type="text"
                    placeholder="Search Process, PID, Port (e.g. '80', 'pid=123', 'lport>1000 && state=LISTEN')"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
                
                <div className="flex items-center gap-4 flex-shrink-0">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="font-medium text-gray-700 text-sm">Auto Refresh (2s)</span>
                    </label>
                    <button
                      onClick={fetchData}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded text-sm disabled:opacity-50 transition shadow-sm"
                    >
                      {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                      onClick={() => window.electron.ipcRenderer.send('toggle-devtools')}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Toggle Developer Tools"
                    >
                      🐞
                    </button>
                </div>
            </div>

            {/* Buttons Row */}
            <div className="flex flex-wrap gap-6 items-end">
                {/* Protocol Buttons */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Protocol</span>
                  <div className="flex rounded-md shadow-sm" role="group">
                    {(['all', 'tcp', 'udp'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setFilterProtocol(p)}
                        className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg ${
                          filterProtocol === p 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* IP Version Buttons */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">IP Version</span>
                  <div className="flex rounded-md shadow-sm" role="group">
                    {(['all', '4', '6'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setFilterIpVer(v)}
                        className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg ${
                          filterIpVer === v 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {v === 'all' ? 'ALL' : `IPv${v}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* State Buttons */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Connection State</span>
                  <div className="flex rounded-md shadow-sm" role="group">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'listen', label: 'Listen' },
                      { id: 'established', label: 'Est.' },
                      { id: 'other', label: 'Other' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setFilterState(s.id as StateFilter)}
                        className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg ${
                          filterState === s.id 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items Count (Aligned Right) */}
                <div className="ml-auto text-sm text-gray-500 pb-1">
                   <span className="font-bold text-gray-700">{filteredData.length}</span>
                   <span className="mx-1">/</span>
                   <span>{data.length} items</span>
                </div>
            </div>
        </div>

        {error && (
          <div className="max-w-full px-4 mx-auto mt-2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex-grow bg-white max-w-full w-full mx-auto shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {filteredData.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <span className="text-4xl mb-2">🔍</span>
            <p>No matching connections.</p>
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={filteredData}
            fixedHeaderContent={() => (
              <tr className="bg-gray-50">
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-24">
                  Proto
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-48">
                  Local Address
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-48">
                  Remote Address
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-32">
                  State
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-24">
                  PID
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Process
                </th>
              </tr>
            )}
            itemContent={(_index, item) => (
              <>
                <td className="px-5 py-2 border-b border-gray-200 text-sm align-top w-24">
                  <span
                    className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                      item.protocol === 'tcp' ||
                      item.protocol === 'tcp4' ||
                      item.protocol === 'tcp6'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {item.protocol}
                  </span>
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm font-mono text-gray-700 align-top w-48">
                  {item.local.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:
                  {item.local.port}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm font-mono text-gray-700 align-top w-48">
                  {item.remote.address || item.remote.port
                    ? `${item.remote.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:${item.remote.port}`
                    : '-'}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm align-top w-32">
                  {item.state ? (
                    <span
                      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                        item.state === 'ESTABLISHED'
                          ? 'bg-blue-100 text-blue-800'
                          : item.state === 'LISTEN' || item.state === 'LISTENING'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {item.state}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm text-gray-500 align-top w-24">
                  {item.pid}
                </td>
                <td
                  className="px-5 py-2 border-b border-gray-200 text-sm font-medium text-gray-900 group-hover:text-blue-600 align-top truncate max-w-xs"
                  title={item.processName}
                >
                  {item.processName || '-'}
                </td>
              </>
            )}
          />
        )}
      </div>
    </div>
  )
}

export default App
