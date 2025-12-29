const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let setupWindow;
let serverProcess;

const isDev = !app.isPackaged;

// Get the server path - in production it's in extraResources
const getServerPath = () => {
    if (isDev) {
        return path.join(__dirname, '..', 'server');
    }
    // With extraResources, files are in resources/server
    return path.join(process.resourcesPath, 'server');
};

// Get config path (in user's AppData)
const getConfigPath = () => {
    const configDir = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    return path.join(configDir, 'database.json');
};

const configExists = () => fs.existsSync(getConfigPath());

const loadConfig = () => {
    try {
        if (fs.existsSync(getConfigPath())) {
            return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
        }
    } catch (err) {
        console.error('Error loading config:', err);
    }
    return null;
};

const saveConfig = (config) => {
    try {
        fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving config:', err);
        return false;
    }
};

const createEnvFile = (config) => {
    const envContent = `DB_HOST=${config.host}
DB_PORT=${config.port}
DB_NAME=${config.database}
DB_USER=${config.user}
DB_PASSWORD=${config.password}
PORT=3001
NODE_ENV=production
JWT_SECRET=hitbyhuma_pos_secret_key_2024
JWT_EXPIRES_IN=7d
`;

    const serverPath = getServerPath();
    const envPath = path.join(serverPath, '.env');

    try {
        fs.writeFileSync(envPath, envContent);
        console.log('Created .env at:', envPath);
        return true;
    } catch (err) {
        console.error('Error creating .env:', err);
        return false;
    }
};

const testServerConnection = () => {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3001/health', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.database === 'connected'
                        ? { success: true }
                        : { success: false, error: 'Database: ' + json.database });
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response' });
                }
            });
        });
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ success: false, error: 'Connection timeout' });
        });
    });
};

function startServer() {
    return new Promise((resolve, reject) => {
        const serverPath = getServerPath();
        const serverIndex = path.join(serverPath, 'src', 'index.js');

        console.log('=== Starting Server ===');
        console.log('Server path:', serverPath);
        console.log('Server index:', serverIndex);
        console.log('Exists:', fs.existsSync(serverIndex));

        // Debug: List server contents
        try {
            if (fs.existsSync(serverPath)) {
                console.log('Server contents:', fs.readdirSync(serverPath));
            }
        } catch (e) { console.error('Debug error:', e); }

        if (!fs.existsSync(serverIndex)) {
            // Debug: List resources
            try {
                console.log('Resources:', fs.readdirSync(process.resourcesPath));
            } catch (e) { console.error('Cannot list resources:', e); }
            reject(new Error(`Server not found at ${serverIndex}`));
            return;
        }

        const env = { ...process.env, NODE_ENV: 'production', PORT: '3001' };

        serverProcess = spawn('node', [serverIndex], {
            cwd: serverPath,
            env: env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let resolved = false;

        serverProcess.stdout.on('data', (data) => {
            console.log(`Server: ${data}`);
            if (!resolved && data.toString().includes('Server running')) {
                resolved = true;
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => console.error(`Server Error: ${data}`));
        serverProcess.on('error', (err) => {
            if (!resolved) { resolved = true; reject(err); }
        });

        setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 5000);
    });
}

function stopServer() {
    if (serverProcess) { serverProcess.kill(); serverProcess = null; }
}

function createSetupWindow() {
    setupWindow = new BrowserWindow({
        width: 500, height: 700, resizable: false,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true,
        title: 'HIT by Huma POS - Setup'
    });
    setupWindow.loadFile(path.join(__dirname, 'setup.html'));
    setupWindow.on('closed', () => {
        setupWindow = null;
        if (!mainWindow) app.quit();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 900, minWidth: 1024, minHeight: 768,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: { nodeIntegration: false, contextIsolation: true },
        autoHideMenuBar: true,
        title: 'HIT by Huma POS'
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadURL('http://localhost:3001');
    }

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('test-db-connection', async (event, config) => {
    try {
        createEnvFile(config);
        stopServer();
        await startServer();
        await new Promise(r => setTimeout(r, 3000));
        const result = await testServerConnection();
        stopServer();
        return result;
    } catch (err) {
        stopServer();
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-db-config', async (event, config) => {
    try {
        saveConfig(config);
        createEnvFile(config);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.on('setup-complete', async () => {
    if (setupWindow) setupWindow.close();
    try {
        await startServer();
        await new Promise(r => setTimeout(r, 2000));
        createWindow();
    } catch (err) {
        console.error('Error starting app:', err);
    }
});

app.whenReady().then(async () => {
    console.log('=== HIT by Huma POS ===');
    console.log('Dev:', isDev);
    console.log('Server path:', getServerPath());

    if (!configExists()) {
        createSetupWindow();
    } else {
        try {
            const config = loadConfig();
            if (config) createEnvFile(config);
            await startServer();
            await new Promise(r => setTimeout(r, 2000));
            createWindow();
        } catch (err) {
            console.error('Startup error:', err);
            createSetupWindow();
        }
    }
});

app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => stopServer());
