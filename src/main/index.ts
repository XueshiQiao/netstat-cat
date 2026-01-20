import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.icns?asset'
import { ProcessFetcherFactory } from './process_fetcher_factory'

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

  // Set dock icon for macOS
  if (process.platform === 'darwin' && app.dock) {
    // Use PNG for better compatibility
    const iconPath = join(process.cwd(), 'resources', 'icon.png')
    const dockIcon = nativeImage.createFromPath(iconPath)
    if (!dockIcon.isEmpty()) {
      // Resize to standard dock icon size for better quality
      const sizedIcon = dockIcon.resize({ width: 256, height: 256 })
      app.dock.setIcon(sizedIcon)
      console.log('Dock icon set successfully from:', iconPath)
    } else {
      console.error('Failed to load dock icon from:', iconPath)
    }
  }

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
  electronApp.setAppUserModelId('me.xueshi.netstat-cat')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()
  const processFetcher = ProcessFetcherFactory.create()

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
  ipcMain.handle('get-process-path', async (_event, _pid: number) => {
    // try {
    //   const psScript = `(Get-Process -Id ${pid}).Path`
    //   const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
    //   const cmd = `powershell -NoProfile -EncodedCommand ${encodedCommand}`
    //   const { stdout } = await execAsync(cmd)
    //   return stdout.trim()
    // } catch {
    //   return ''
    // }
    return ''
  })

  ipcMain.handle('get-process-info-list', async () => {
    try {
      return await processFetcher.fetchProcessInfoList()
    } catch (e) {
      console.error('Netstat exec failed:', e)
      throw e
    }
  })

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
