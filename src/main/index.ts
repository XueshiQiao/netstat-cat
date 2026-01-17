import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { exec } from 'child_process'
import { promisify } from 'util'

const netstat = require('node-netstat')
const execAsync = promisify(exec)

async function getProcessMap(): Promise<Map<string, string>> {
  if (process.platform === 'win32') {
    try {
      // tasklist /fo csv /nh returns: "Image Name","PID",...
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
  // Create the browser window.
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('get-netstat', async () => {
    // Get process names first (mostly for Windows)
    const processMap = await getProcessMap()

    return new Promise((resolve, reject) => {
      const results: any[] = []
      netstat({
        done: (err) => {
          if (err) reject(err)
          else resolve(results)
        }
      }, (item) => {
        // Enrich with process name if missing
        if (!item.processName && item.pid && processMap.has(item.pid.toString())) {
            item.processName = processMap.get(item.pid.toString())
        }
        results.push(item)
      })
    })
  })

  createWindow()

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