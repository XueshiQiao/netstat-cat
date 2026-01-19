import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ProcessNamePathInfo {
  name: string
  path: string
}


interface ProcessInfo {
  protocol: string
  local: { address: string | null; port: number | null }
  remote: { address: string | null; port: number | null }
  state: string
  pid: number
  processName: string
  uid?: number  // uid is not supported on Windows
  fileDescriptor?: string  // fileDescriptor is not supported on Windows
  fileType?: string  // fileType is not supported on Windows
}

async function getWindowsProcessIdToNameMap(): Promise<Map<string, ProcessNamePathInfo>> {
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
  return new Map()
}

async function getWindowsProcessInfoList(): Promise<ProcessInfo[]> {
  const processIdToNameMap = await getWindowsProcessIdToNameMap()

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

interface LsofEntry {
  p?: string
  c?: string
  u?: string
  P?: string
  f?: string
  t?: string
  n?: string
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Fully frameless
    // Set icon for both Windows and Linux
    ...(process.platform === 'win32' || process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Window Controls IPC
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize()
  })
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => {
    mainWindow.close()
  })

  ipcMain.on('toggle-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.toggleDevTools()
    }
  })

  // Lazy load process path
  ipcMain.handle('get-process-path', async (_event, pid: number) => {
    try {
      const psScript = `(Get-Process -Id ${pid}).Path`
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
      const cmd = `powershell -NoProfile -EncodedCommand ${encodedCommand}`
      const { stdout } = await execAsync(cmd)
      return stdout.trim()
    } catch {
      return ''
    }
  })

  ipcMain.handle('get-process-info-list', async () => {
    try {
      if (process.platform === 'win32') {
        return await getWindowsProcessInfoList()
      } else if (process.platform === 'darwin') {
        return await getLsofResults()
      } else if (process.platform === 'linux') {
        //TODO(xueshi): Implement linux netstat
        throw new Error('Linux netstat not implemented')
      }
    } catch (e) {
      console.error('Netstat exec failed:', e)
      throw e
    }
  })

  async function getLsofResults(): Promise<ProcessInfo[]> {
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
          const parsed = parseLsofEntry(entry)
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
          const parsed = parseLsofEntry(entry)
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
      const parsed = parseLsofEntry(entry)
      if (parsed) {
        results.push(parsed)
      }
    }

    return results
  }

  function parseLsofEntry(entry: LsofEntry): ProcessInfo | null {
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
      local = parseAddressPort(parts[0])
      remote = parseAddressPort(parts[1])
    } else {
      // Listening socket or no connection
      local = parseAddressPort(networkInfo)
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

  function parseAddressPort(addrStr: string): { address: string | null; port: number } {
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

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})
