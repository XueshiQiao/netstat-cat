import { useState, useEffect, useMemo } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import { parseQuery } from './utils/queryParser'
import { pathCache } from './utils/processCache'
import logo from './assets/pure_cat_logo.png'

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
  processPath?: string
}

type ProtocolFilter = 'all' | 'tcp' | 'udp'
type IpVerFilter = 'all' | '4' | '6'
type StateFilter = 'all' | 'listen' | 'established' | 'other'

function App() {
  const [data, setData] = useState<NetstatItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  // Filter States
  const [searchText, setSearchText] = useState('')
  const [filterProtocol, setFilterProtocol] = useState<ProtocolFilter>('all')
  const [filterIpVer, setFilterIpVer] = useState<IpVerFilter>('all')
  const [filterState, setFilterState] = useState<StateFilter>('all')

  const handleMinimize = () => window.electron.ipcRenderer.send('window-minimize')
  const handleMaximize = () => window.electron.ipcRenderer.send('window-maximize')
  const handleClose = () => window.electron.ipcRenderer.send('window-close')

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  const toggleTheme = () => setDarkMode(!darkMode)

  const handleProcessHover = async (_index: number, item: NetstatItem) => {
    // 1. Check if path is already in item (fastest)
    if (item.processPath !== undefined) {
      console.log('Path already in item:', item.processPath)
      return
    }

    // 2. Check local LRU cache
    const cachedPath = pathCache.get(item.pid)
    if (cachedPath !== undefined) {
      console.log('Path found in cache:', cachedPath)
      updateItemPath(item.pid, item.protocol, item.local.port, cachedPath)
      return
    }

    // 3. Fetch from Main Process
    try {
      // @ts-ignore
      const path = await window.electron.ipcRenderer.invoke('get-process-path', item.pid)
      pathCache.set(item.pid, path) // Store in cache
      updateItemPath(item.pid, item.protocol, item.local.port, path)
    } catch (e) {
      // ignore
      console.error('Error fetching process path:', e)
    }
  }

  const updateItemPath = (pid: number, protocol: string, localPort: number, path: string) => {
    setData((prevData) => {
      const newData = [...prevData]
      console.log('newData:', newData)
      const dataIndex = newData.findIndex(
        (d) => d.pid === pid && d.protocol === protocol && d.local.port === localPort
      )
      if (dataIndex !== -1) {
        newData[dataIndex] = { ...newData[dataIndex], processPath: path }
      }
      return newData
    })
  }

  const fetchData = async () => {
    // ... (fetch logic remains same)
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

  // ... (useEffects remain same)
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
    // ... (filter logic remains same)
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
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800 shadow-sm z-10 flex-shrink-0 drag-region transition-colors duration-200">
        {/* Title Bar / Header Row */}
        <div className="flex justify-between items-center w-full">
          <div className="px-8 py-3 flex items-center gap-3 select-none">
            <img src={logo} alt="Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Netstat Cat</h1>
          </div>

          <div className="flex items-center h-full self-start">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="h-full px-4 py-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors no-drag flex items-center justify-center"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>

            {/* Custom Window Controls */}
            <div className="flex no-drag h-full">
              <button
                onClick={handleMinimize}
                className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center group"
                title="Minimize"
              >
                <div className="w-3 h-[1px] bg-gray-600 dark:bg-gray-400 group-hover:bg-gray-900 dark:group-hover:bg-white"></div>
              </button>
              <button
                onClick={handleMaximize}
                className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center group"
                title="Maximize"
              >
                <div className="w-3 h-3 border border-gray-600 dark:border-gray-400 group-hover:border-gray-900 dark:group-hover:border-white"></div>
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-3 hover:bg-red-600 transition-colors flex items-center justify-center group"
                title="Close"
              >
                <svg
                  className="w-3 h-3 text-gray-600 dark:text-gray-400 group-hover:text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className="inline-flex rounded-md shadow-sm border border-gray-300 dark:border-gray-600 overflow-hidden"
                role="group"
              >
                <label
                  className={`flex items-center px-3 py-1.5 cursor-pointer select-none transition-colors border-r border-gray-300 dark:border-gray-600 ${autoRefresh ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-white dark:bg-gray-700'}`}
                >
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="hidden"
                  />
                  <div
                    className={`w-3 h-3 rounded-full mr-2 border ${autoRefresh ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400 dark:bg-gray-600 dark:border-gray-500'}`}
                  ></div>
                  <span
                    className={`text-xs font-medium ${autoRefresh ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    Auto
                  </span>
                </label>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 disabled:opacity-50 transition-colors flex items-center justify-center"
                  title="Refresh Now"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>

              <button
                onClick={() => window.electron.ipcRenderer.send('toggle-devtools')}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1 transition-colors"
                title="Toggle Developer Tools"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Buttons Row */}
          <div className="flex flex-wrap gap-6 items-end">
            {/* Protocol Buttons */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">
                Protocol
              </span>
              <div className="flex rounded-md shadow-sm" role="group">
                {(['all', 'tcp', 'udp'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterProtocol(p)}
                    className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${
                      filterProtocol === p
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* IP Version Buttons */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">
                IP Version
              </span>
              <div className="flex rounded-md shadow-sm" role="group">
                {(['all', '4', '6'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFilterIpVer(v)}
                    className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${
                      filterIpVer === v
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {v === 'all' ? 'ALL' : `IPv${v}`}
                  </button>
                ))}
              </div>
            </div>

            {/* State Buttons */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">
                Connection State
              </span>
              <div className="flex rounded-md shadow-sm" role="group">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'listen', label: 'Listen' },
                  { id: 'established', label: 'Est.' },
                  { id: 'other', label: 'Other' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setFilterState(s.id as StateFilter)}
                    className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${
                      filterState === s.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Items Count (Aligned Right) */}
            <div className="ml-auto text-sm text-gray-500 dark:text-gray-400 pb-1 transition-colors">
              <span className="font-bold text-gray-700 dark:text-gray-200">
                {filteredData.length}
              </span>
              <span className="mx-1">/</span>
              <span>{data.length} items</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="max-w-full px-4 mx-auto mt-2 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-2 rounded text-sm transition-colors">
            {error}
          </div>
        )}
      </div>

      <div className="flex-grow bg-white dark:bg-gray-800 max-w-full w-full mx-auto shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col transition-colors duration-200">
        {filteredData.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <span className="text-4xl mb-2">🔍</span>
            <p>No matching connections.</p>
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={filteredData}
            fixedHeaderContent={() => (
              <tr className="bg-gray-50 dark:bg-gray-700 transition-colors">
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-24 whitespace-nowrap">
                  Proto
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-64 whitespace-nowrap">
                  Local Address
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-64 whitespace-nowrap">
                  Remote Address
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-32 whitespace-nowrap">
                  State
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-24 whitespace-nowrap">
                  PID
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-full whitespace-nowrap">
                  Process
                </th>
              </tr>
            )}
            itemContent={(_index, item) => (
              <>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm align-top w-24 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                      item.protocol === 'tcp' ||
                      item.protocol === 'tcp4' ||
                      item.protocol === 'tcp6'
                        ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300'
                    }`}
                  >
                    {item.protocol}
                  </span>
                </td>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-700 dark:text-gray-300 align-top w-64 whitespace-nowrap">
                  {item.local.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:
                  {item.local.port}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-700 dark:text-gray-300 align-top w-64 whitespace-nowrap">
                  {item.remote.address || item.remote.port
                    ? `${item.remote.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:${item.remote.port}`
                    : '-'}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm align-top w-32 whitespace-nowrap">
                  {item.state ? (
                    <span
                      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                        item.state === 'ESTABLISHED'
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300'
                          : item.state === 'LISTEN' || item.state === 'LISTENING'
                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {item.state}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 align-top w-24 whitespace-nowrap">
                  {item.pid}
                </td>
                <td
                  className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 align-top truncate w-full"
                  title={item.processPath || item.processName}
                  onMouseEnter={() => handleProcessHover(_index, item)}
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
