import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { TableVirtuoso } from 'react-virtuoso'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check } from '@tauri-apps/plugin-updater'
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
  uid?: number | null
  fileDescriptor?: string
  fileType?: string
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

  // Update
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'up-to-date' | 'error'
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const pendingUpdate = useRef<Awaited<ReturnType<typeof check>> | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isMacOS = navigator.platform.toUpperCase().includes('MAC')

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const appWindow = getCurrentWindow()
  const handleMinimize = () => appWindow.minimize()
  const handleMaximize = () => appWindow.toggleMaximize()
  const handleClose = () => appWindow.close()

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

  const handleCheckUpdate = async () => {
    if (updateStatus === 'checking' || updateStatus === 'downloading') return
    setUpdateStatus('checking')
    try {
      const update = await check()
      if (update) {
        pendingUpdate.current = update
        setUpdateStatus('available')
        showToast(`Update ${update.version} available`)
      } else {
        setUpdateStatus('up-to-date')
        setTimeout(() => setUpdateStatus('idle'), 3000)
      }
    } catch (e: any) {
      console.error('Update check failed:', e)
      setUpdateStatus('error')
      showToast(e.toString?.() || 'Update check failed', 'error')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    }
  }

  const handleInstallUpdate = async () => {
    const update = pendingUpdate.current
    if (!update) return
    setUpdateStatus('downloading')
    try {
      await update.downloadAndInstall()
      showToast('Update installed — relaunch to apply')
    } catch (e: any) {
      console.error('Update install failed:', e)
      setUpdateStatus('error')
      showToast(e.toString?.() || 'Update install failed', 'error')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    }
  }

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

    // 3. Fetch from Tauri backend
    try {
      const path = await invoke<string>('get_process_path', { pid: item.pid })
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

  const handleKillProcess = async (pid: number, processName: string) => {
    try {
      await invoke('kill_process', { pid })
      showToast(`Process "${processName}" (PID: ${pid}) killed`)
      await fetchData()
    } catch (err: any) {
      showToast(err.toString?.() || `Failed to kill process ${pid}`, 'error')
    }
  }

  const fetchData = async () => {
    // ... (fetch logic remains same)
    // If we are already loading, don't stack requests (prevents lag if request takes > 2s)
    if (loading) return

    setLoading(true)
    try {
      const result = await invoke<NetstatItem[]>('get_process_info_list')
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
    getCurrentWindow().show()
    fetchData()
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
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
            const matchesUid = matchString(item.uid ?? null)
            const matchesFd = matchString(item.fileDescriptor ?? null)

            if (
              !matchesProcess &&
              !matchesPid &&
              !matchesLocalPort &&
              !matchesRemotePort &&
              !matchesState &&
              !matchesUid &&
              !matchesFd
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
      <div className="bg-white dark:bg-gray-800 shadow-sm z-10 flex-shrink-0 drag-region transition-colors duration-200" data-tauri-drag-region>
        {/* Title Bar / Header Row */}
        <div className="flex justify-between items-center w-full" data-tauri-drag-region>
          <div className={`${isMacOS ? 'pl-24' : 'pl-8'} pr-8 py-3 flex items-center gap-3 select-none`} data-tauri-drag-region>
            <img src={logo} alt="Logo" className="w-8 h-8 object-contain pointer-events-none" />
            <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 pointer-events-none">Netstat Cat</h1>
          </div>

          <div className="flex items-center">
            {/* Update Check Button */}
            <button
              onClick={updateStatus === 'available' ? handleInstallUpdate : handleCheckUpdate}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors no-drag flex items-center justify-center disabled:opacity-50"
              title={
                updateStatus === 'checking' ? 'Checking for updates...' :
                updateStatus === 'available' ? 'Click to install update' :
                updateStatus === 'downloading' ? 'Downloading update...' :
                updateStatus === 'up-to-date' ? 'Up to date' :
                updateStatus === 'error' ? 'Update check failed' :
                'Check for updates'
              }
            >
              {(updateStatus === 'checking' || updateStatus === 'downloading') ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : updateStatus === 'available' ? (
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              ) : updateStatus === 'up-to-date' ? (
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              )}
            </button>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 mr-4 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors no-drag flex items-center justify-center"
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
            {/* Custom Window Controls (Windows only) */}
            {!isMacOS && (
              <div className="flex self-start no-drag">
                <button
                  onClick={handleMinimize}
                  className="w-[46px] py-3 hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors flex items-center justify-center"
                  title="Minimize"
                >
                  <svg className="w-[10px] h-[10px] text-gray-500 dark:text-gray-400" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                    <path d="M1 5h8" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  onClick={handleMaximize}
                  className="w-[46px] py-3 hover:bg-gray-200/70 dark:hover:bg-gray-600/70 transition-colors flex items-center justify-center"
                  title="Maximize"
                >
                  <svg className="w-[10px] h-[10px] text-gray-500 dark:text-gray-400" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                    <rect x="1" y="1" width="8" height="8" rx="1" strokeWidth="1.2" />
                  </svg>
                </button>
                <button
                  onClick={handleClose}
                  className="w-[46px] py-3 hover:bg-red-500 transition-colors flex items-center justify-center group"
                  title="Close"
                >
                  <svg className="w-[10px] h-[10px] text-gray-500 dark:text-gray-400 group-hover:text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor">
                    <path d="M1 1l8 8M9 1l-8 8" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters & Controls Row */}
        <div className="px-8 pb-4 w-full space-y-3 no-drag">
          {/* Search + Refresh Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-grow w-full">
              <input
                type="text"
                placeholder="Search Process, PID, UID, FD, Port (e.g. '80', 'pid=123', 'uid=501', 'fd=4', 'lport>1000 && state=LISTEN')"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono transition-colors"
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
                    className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${filterProtocol === p
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
                    className={`px-4 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${filterIpVer === v
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
                    className={`px-3 py-1.5 text-xs font-medium border first:rounded-l-lg last:rounded-r-lg transition-colors ${filterState === s.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Items Count */}
            <div className="flex flex-col gap-1 ml-auto">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                Results
              </span>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-medium transition-colors">
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  {filteredData.length}
                </span>
                <span className="mx-1.5 text-gray-400 dark:text-gray-500">/</span>
                <span className="text-gray-600 dark:text-gray-300">{data.length}</span>
                <span className="ml-1.5 text-gray-400 dark:text-gray-500 text-xs">items</span>
              </div>
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
            components={{
              TableRow: ({ style, ...props }) => <tr {...props} style={style} className="group" />,
            }}
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
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20 whitespace-nowrap">
                  PID
                </th>
                {/* <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20 whitespace-nowrap">
                  UID
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20 whitespace-nowrap">
                  FD
                </th> */}
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-600 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-full whitespace-nowrap">
                  Process
                </th>
                <th className="px-2 py-3 border-b-2 border-gray-200 dark:border-gray-600 w-10 sticky right-0 bg-gray-50 dark:bg-gray-700">
                </th>
              </tr>
            )}
            itemContent={(_index, item) => (
              <>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm align-top w-24 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${item.protocol === 'tcp' ||
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
                      className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${item.state === 'ESTABLISHED'
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
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 align-top w-20 whitespace-nowrap">
                  {item.pid}
                </td>
                {/* <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 align-top w-20 whitespace-nowrap">
                  {item.uid || '-'}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 align-top w-20 whitespace-nowrap font-mono">
                  {item.fileDescriptor || '-'}
                </td> */}
                <td
                  className="px-5 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 align-top truncate w-full"
                  title={item.processPath || item.processName}
                  onMouseEnter={() => handleProcessHover(_index, item)}
                >
                  {item.processName || '-'}
                </td>
                <td className="px-2 py-2 border-b border-gray-200 dark:border-gray-700 align-top w-10 sticky right-0 bg-white dark:bg-gray-800">
                  <button
                    onClick={() => handleKillProcess(item.pid, item.processName)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
                    title={`Kill process ${item.processName} (PID: ${item.pid})`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </>
            )}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-fade-in ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
