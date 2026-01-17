import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function getProcessMap(): Promise<Map<string, string>> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync('tasklist /fo csv /nh')
      const map = new Map<string, string>()
      const lines = stdout.split(/\r?\n/)
      
      lines.forEach(line => {
        if (!line.trim()) return
        const safeParts = line.match(/"([^"]*)"/g)
        if (safeParts && safeParts.length >= 2) {
             const pName = safeParts[0].replace(/"/g, '')
             const pPid = safeParts[1].replace(/"/g, '')
             map.set(pPid, pName)
        }
      })
      return map
    } catch (e) {
      console.error('Failed to get process map', e)
      return new Map()
    }
  }
  return new Map()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
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
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('toggle-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.webContents.toggleDevTools()
  })

  ipcMain.handle('get-netstat', async () => {
    const processMap = await getProcessMap()
    
    try {
      // Execute netstat directly
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

        // TCP has 5 columns: Proto, Local, Remote, State, PID
        // UDP has 4 columns: Proto, Local, Remote, PID
        if (protocol === 'tcp') {
            state = parts[3]
            pid = parts[4]
        } else {
            state = ''
            pid = parts[3]
        }

        // Identify IPv6 explicitly
        const isV6 = local.includes('[') || local.includes('::')
        if (isV6) {
            protocol = protocol === 'tcp' ? 'tcp6' : 'udp6'
        }

        const parseAddr = (addr: string, protocolVer: string) => {
            const lastColon = addr.lastIndexOf(':')
            let address = addr.substring(0, lastColon)
            const port = parseInt(addr.substring(lastColon + 1))
            
            if (address.startsWith('[') && address.endsWith(']')) {
                address = address.slice(1, -1)
            }

            // Normalize wildcards for the UI to display 0.0.0.0 or [::]
            if (address === '0.0.0.0' || address === '::' || address === '*') {
                address = null 
            }
            
            return { address, port }
        }

        results.push({
          protocol,
          local: parseAddr(local, protocol),
          remote: parseAddr(remote, protocol),
          state: state === 'LISTENING' ? 'LISTEN' : state,
          pid: parseInt(pid),
          processName: processMap.get(pid) || ''
        })
      }
      return results
    } catch (e) {
      console.error('Netstat exec failed:', e)
      throw e
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
