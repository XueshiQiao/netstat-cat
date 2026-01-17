import { useState, useEffect, useMemo } from 'react'
import { TableVirtuoso } from 'react-virtuoso'

interface NetstatItem {
  protocol: string
  local: {
    address: string
    port: number
  }
  remote: {
    address: string
    port: number
  }
  state: string
  pid: number
  processName: string
}

function App() {
  const [data, setData] = useState<NetstatItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

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

  return (
    <div className="h-screen flex flex-col bg-gray-100 text-gray-900 overflow-hidden">
      <div className="p-4 bg-white shadow-sm z-10 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
            <span>Netstat Cat</span>
            <span className="text-xl">🐱</span>
          </h1>
          <div className="flex items-center gap-4">
             <div className="text-sm text-gray-500 mr-4">
               {data.length} items
             </div>
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
          </div>
        </div>
        {error && (
          <div className="max-w-7xl mx-auto mt-2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex-grow bg-white max-w-7xl w-full mx-auto shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {data.length === 0 && !loading ? (
           <div className="flex flex-col items-center justify-center h-full text-gray-500">
             <span className="text-4xl mb-2">📭</span>
             <p>No connections found.</p>
           </div>
        ) : (
          <TableVirtuoso
            data={data}
            fixedHeaderContent={() => (
              <tr className="bg-gray-50">
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Proto</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-48">Local Address</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-48">Remote Address</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-32">State</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-24">PID</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Process</th>
              </tr>
            )}
            itemContent={(index, item) => (
              <>
                <td className="px-5 py-2 border-b border-gray-200 text-sm align-top">
                  <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                    item.protocol === 'tcp' || item.protocol === 'tcp4' || item.protocol === 'tcp6' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.protocol}
                  </span>
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm font-mono text-gray-700 align-top">
                  {item.local.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:{item.local.port}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm font-mono text-gray-700 align-top">
                  {item.remote.address || item.remote.port ? (
                    `${item.remote.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0')}:${item.remote.port}`
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm align-top">
                   {item.state ? (
                     <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                        item.state === 'ESTABLISHED' ? 'bg-blue-100 text-blue-800' :
                        item.state === 'LISTEN' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                     }`}>
                       {item.state}
                     </span>
                   ) : '-'}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm text-gray-500 align-top">
                  {item.pid}
                </td>
                <td className="px-5 py-2 border-b border-gray-200 text-sm font-medium text-gray-900 group-hover:text-blue-600 align-top truncate max-w-xs" title={item.processName}>
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