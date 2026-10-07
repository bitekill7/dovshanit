import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'

app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
let allowClose = false

function enableAutoStart(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      enabled: true
    })
  } catch (error) {
    console.error('Failed to enable auto-start:', error)
  }
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.alt &&
      input.key.toLowerCase() === 'f4'
    ) {
      event.preventDefault()
    }
  })

  mainWindow.on('close', event => {
    if (!allowClose) event.preventDefault()
    allowClose = false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.on('dovshanit:close-app', event => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return

  allowClose = true
  mainWindow.close()
})

/** מצב מפלצת: כותב פתק טקסט לתיקייה ייעודית על שולחן העבודה. רק קבצי .txt, רק מהחלון הראשי. */
ipcMain.handle('dovshanit:write-note', async (event, name: unknown, text: unknown): Promise<boolean> => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false
  if (typeof name !== 'string' || typeof text !== 'string') return false

  const safeName = basename(name).replace(/[^\w.-]/g, '_')
  if (!safeName.endsWith('.txt')) return false

  try {
    const dir = join(app.getPath('desktop'), 'דובשנית')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, safeName), text.slice(0, 2000), 'utf8')
    return true
  } catch (error) {
    console.error('Failed to write note:', error)
    return false
  }
})

app.whenReady().then(() => {
  enableAutoStart()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  allowClose = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})