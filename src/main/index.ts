import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ProcessInfo {
  name: string
  path: string
}

async function getProcessMap(): Promise<Map<string, ProcessInfo>> {
  if (process.platform === 'win32') {
    try {
      // Use tasklist for fast, lightweight name resolution
      const { stdout } = await execAsync('tasklist /fo csv /nh')
      const map = new Map<string, ProcessInfo>()
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
  return new Map()
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
    } catch (e) {
      return ''
    }
  })

  ipcMain.handle('get-netstat', async () => {
    const processMap = await getProcessMap()

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

        const info = processMap.get(pid)

        results.push({
          protocol,
          local: parseAddr(local),
          remote: parseAddr(remote),
          state: state === 'LISTENING' ? 'LISTEN' : state,
          pid: parseInt(pid),
          processName: info ? info.name : ''
          // path NOT fetched here
        })
      }
      return results
    } catch (e) {
      console.error('Netstat exec failed:', e)
      throw e
    }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
