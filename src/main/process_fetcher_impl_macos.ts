import { exec } from 'child_process'
import { promisify } from 'util'
import type { ProcessFetcher, ProcessInfo, ProcessNamePathInfo } from './process_fetcher'

const execAsync = promisify(exec)

interface LsofEntry {
  p?: string
  c?: string
  u?: string
  P?: string
  f?: string
  t?: string
  n?: string
}

export default class MacOSProcessFetcherImpl implements ProcessFetcher {
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

  parseLsofEntry(entry: LsofEntry): ProcessInfo | null {
    if (!entry.p || !entry.c || !entry.n) {
      return null
    }

    const pid = parseInt(entry.p)
    const commandName = entry.c
    const uid = entry.u || ''
    const protocol = entry.P || ''
    const fileDescriptor = entry.f || ''
    const fileType = entry.t || ''
    const networkInfo = entry.n || ''

    // Parse network address information
    let local: { address: string | null; port: number } = { address: null, port: 0 }
    let remote: { address: string | null; port: number | null } = { address: null, port: null }
    let state = ''

    // Check if it's a listening socket or established connection
    if (networkInfo.includes('->')) {
      // Established connection: local->remote
      const parts = networkInfo.split('->')
      local = this.parseAddressPort(parts[0])
      remote = this.parseAddressPort(parts[1])
    } else {
      // Listening socket or no connection
      local = this.parseAddressPort(networkInfo)
      state = 'LISTEN'
    }

    // Determine protocol type with IPv6 support
    let protocolType = protocol.toLowerCase()
    if (networkInfo.includes('[') || (local.address && local.address.includes(':'))) {
      protocolType =
        protocolType === 'tcp' ? 'tcp6' : protocolType === 'udp' ? 'udp6' : protocolType
    }

    return {
      protocol: protocolType,
      local,
      remote,
      state,
      pid,
      processName: commandName,
      uid: parseInt(uid) || undefined,
      fileDescriptor,
      fileType
    }
  }

  parseAddressPort(addrStr: string): { address: string | null; port: number } {
    if (!addrStr) {
      return { address: null, port: 0 }
    }

    // Handle IPv6 addresses [::]:port or fe80::1:port
    let address: string | null = null
    let port = 0

    // IPv6 pattern
    const ipv6Match = addrStr.match(/^\[([^\]]+)\]:(\d+)$/)
    if (ipv6Match) {
      address = ipv6Match[1]
      port = parseInt(ipv6Match[2])
    } else {
      // IPv4 or wildcard pattern
      const lastColon = addrStr.lastIndexOf(':')
      if (lastColon !== -1) {
        address = addrStr.substring(0, lastColon)
        const portStr = addrStr.substring(lastColon + 1)
        port = parseInt(portStr, 10)
      }
    }

    // Handle wildcard addresses
    if (address === '*' || address === '0.0.0.0' || address === '::') {
      address = null
    }

    return { address, port }
  }

  async fetchProcessInfoList(): Promise<ProcessInfo[]> {
    const { stdout } = await execAsync('lsof -i -n -P -F pcuPftsn')

    const lines = stdout.split('\n')
    const results: ProcessInfo[] = []

    let currentEntry: LsofEntry = {}
    let currentFd = ''
    let currentType = ''
    let currentProto = ''
    let currentNetwork = ''
    let currentPid = ''
    let currentCmd = ''
    let currentUid = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const fieldCode = line[0]
      const fieldValue = line.slice(1)

      // New PID means new process - save previous entry if complete
      if (fieldCode === 'p') {
        // Save previous connection if we have network info
        if (currentPid && currentNetwork) {
          const entry: LsofEntry = {
            p: currentPid,
            c: currentCmd,
            u: currentUid,
            f: currentFd,
            t: currentType,
            P: currentProto,
            n: currentNetwork
          }
          const parsed = this.parseLsofEntry(entry)
          if (parsed) {
            results.push(parsed)
          }
        }

        // Start new process
        currentPid = fieldValue
        currentEntry = { p: currentPid }
        currentFd = ''
        currentType = ''
        currentProto = ''
        currentNetwork = ''
        currentCmd = ''
        currentUid = ''
        continue
      }

      // Store fields in current entry
      if (fieldCode === 'c') {
        currentCmd = fieldValue
        currentEntry.c = currentCmd
      } else if (fieldCode === 'u') {
        currentUid = fieldValue
        currentEntry.u = currentUid
      } else if (fieldCode === 'f') {
        currentFd = fieldValue
      } else if (fieldCode === 't') {
        currentType = fieldValue
      } else if (fieldCode === 'P') {
        currentProto = fieldValue
      } else if (fieldCode === 'n') {
        // Save previous connection if we had one
        if (currentPid && currentNetwork && currentFd) {
          const entry: LsofEntry = {
            p: currentPid,
            c: currentCmd,
            u: currentUid,
            f: currentFd,
            t: currentType,
            P: currentProto,
            n: currentNetwork
          }
          const parsed = this.parseLsofEntry(entry)
          if (parsed) {
            results.push(parsed)
          }
        }
        // Start new connection
        currentNetwork = fieldValue
      }
    }

    // Save the last entry
    if (currentPid && currentNetwork) {
      const entry: LsofEntry = {
        p: currentPid,
        c: currentCmd,
        u: currentUid,
        f: currentFd,
        t: currentType,
        P: currentProto,
        n: currentNetwork
      }
      const parsed = this.parseLsofEntry(entry)
      if (parsed) {
        results.push(parsed)
      }
    }

    return results
  }
  async fetchProcessNamePathInfo(pid: number): Promise<ProcessNamePathInfo> {
    return { name: '', path: '' }
  }
}
