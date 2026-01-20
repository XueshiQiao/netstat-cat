import { exec } from 'child_process'
import { promisify } from 'util'
import type { ProcessFetcher, ProcessInfo, ProcessNamePathInfo } from './process_fetcher'

const execAsync = promisify(exec)

export default class WinProcessFetcherImpl implements ProcessFetcher {
  private async _fetchProcessIdToNameMap(): Promise<Map<string, ProcessNamePathInfo>> {
    try {
      // Use tasklist for fast, lightweight name resolution
      const { stdout } = await execAsync('tasklist /fo csv /nh')
      const map = new Map<string, ProcessNamePathInfo>()
      const lines = stdout.split(/\r?\n/)

      lines.forEach((line) => {
        if (!line.trim()) return
        // CSV parsing for tasklist: "Image Name","PID",...
        const safeParts = line.match(/"([^"]*)"/g)
        if (safeParts && safeParts.length >= 2) {
          const pName = safeParts[0].replace(/"/g, '')
          const pPid = safeParts[1].replace(/"/g, '')
          map.set(pPid, { name: pName, path: '' })
        }
      })
      return map
    } catch (e) {
      console.error('Failed to get process map via tasklist', e)
      return new Map()
    }
  }
  async fetchProcessInfoList(): Promise<ProcessInfo[]> {
    const processIdToNameMap = await this._fetchProcessIdToNameMap()

    try {
      const { stdout } = await execAsync('netstat -ano')
      const lines = stdout.split(/\r?\n/)
      const results: any[] = []

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 4) continue
        if (parts[0] === 'Proto' || parts[0] === 'Active') continue

        let protocol = parts[0].toLowerCase()
        const local = parts[1]
        const remote = parts[2]
        let state = ''
        let pid = ''

        if (protocol === 'tcp') {
          state = parts[3]
          pid = parts[4]
        } else {
          state = ''
          pid = parts[3]
        }

        const isV6 = local.includes('[') || local.includes('::')
        if (isV6) {
          protocol = protocol === 'tcp' ? 'tcp6' : 'udp6'
        }

        const parseAddr = (addr: string) => {
          const lastColon = addr.lastIndexOf(':')
          let address: string | null = addr.substring(0, lastColon)
          const port = parseInt(addr.substring(lastColon + 1))

          if (address.startsWith('[') && address.endsWith(']')) {
            address = address.slice(1, -1)
          }

          if (address === '0.0.0.0' || address === '::' || address === '*') {
            address = null
          }

          return { address, port }
        }

        const nameInfo = processIdToNameMap.get(pid)

        results.push({
          protocol,
          local: parseAddr(local),
          remote: parseAddr(remote),
          state: state === 'LISTENING' ? 'LISTEN' : state,
          pid: parseInt(pid),
          processName: nameInfo ? nameInfo.name : ''
          // path NOT fetched here
        })
      }
      return results
    } catch (e) {
      console.error('Netstat exec failed:', e)
      throw e
    }
  }
  async fetchProcessNamePathInfo(pid: number): Promise<ProcessNamePathInfo> {
    return { name: '', path: '' }
  }
}
