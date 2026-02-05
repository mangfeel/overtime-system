/**
 * main.js - Electron 메인 ?�로?�스
 * 
 * ?�간?�근무�?�??�스?�톱 ?�의 메인 ?�로?�스
 * - ???�도???�성 �?관�? * - IPC ?�신 ?�들?? * - electron-store 기반 ?�체 ?�이???�?? * - ?�사관�????�이???�기 ?�용 ?�근
 * - ?�동 ?�데?�트
 * - .hrm ?�호??백업/복원
 * - ?�사관�????�이?�스 검�?(v1.2.0)
 * 
 * @version 1.2.0
 * @since 2026-02-05
 * 
 * [변�??�력]
 * v1.2.0 (2026-02-06) - ?�이?�스 검�??�스??추�?
 *   - check-hr-license IPC ?�들?? ?�사??electron-store?�서 ?�이?�스 ?�인
 *   - ?�이?�스 만료??검�? *   - 캐시 ?�효 ?�간(24?�간) 검�? * 
 * v1.1.0 (2026-02-05) - .hrm ?�호??백업 ?�입
 *   - AES-256-CBC ?�호??백업/복원 IPC ?�들??추�?
 *   - backup-save-hrm: ?�이???�호?????�???�이?�로�???.hrm ?�일 ?�?? *   - backup-load-hrm: ?�기 ?�이?�로�???.hrm/.json ?�일 ?�기 ??복호?? *   - .json ?�위 ?�환 (복원 ??.json ?�문 ?�일??지??
 * 
 * v1.0.0 (2026-02-05) - 초기 릴리�? *   - Phase 1: Electron ?�로?�트 초기?? *   - electron-store 기반 ?�체 ?�이???�?? *   - ?�사관�???electron-store ?�기 ?�용 ?�근
 *   - ?�사???�치 ?�인 �??�이?�스 검�? *   - ?�동 ?�데?�트 (GitHub Release 기반)
 *   - ?�이?�로�? ?�일 ?�스?? ?�쇄 IPC ?�들?? */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===== electron-store ?�정 =====

const Store = require('electron-store');

/**
 * ?�체 ?�이???�?�소 (?�간?�근�??�이??
 * ?�이?�는 C:\Users\?�용??AppData\Roaming\overtime-system\overtime-data.json ???�?�됨
 */
const store = new Store({
    name: 'overtime-data',
    encryptionKey: 'overtime-system-encryption-key-2026',
    defaults: {
        // ?�간?�근�?기록
        hr_overtime_daily: {},
        // 근태 기록
        hr_attendance_records: {},
        // 공휴???�정
        hr_overtime_holidays: null,
        // ?�간???�형 ?�정
        hr_overtime_settings: null,
        // �????�한 ?�정
        hr_overtime_limits: null
    }
});

console.log('[Main] ?�체 store 경로:', store.path);

/**
 * ?�사관�????�이???�기 ?�용 ?�?�소
 * 경로: C:\Users\?�용??AppData\Roaming\hr-system\hr-system-data.json
 * ?�️ ?�기 ?�용 - ?��? ?�기 금�?
 */
let hrStore = null;

/**
 * ?�사관�???store 초기??(?�기 ?�용)
 * @returns {boolean} 초기???�공 ?��?
 */
function initHRStore() {
    try {
        // ?�사관�????�이??경로 ?�인
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        
        if (!fs.existsSync(hrDataFile)) {
            console.warn('[Main] ?�사관�????�이???�일 ?�음:', hrDataFile);
            return false;
        }
        
        // ?�사관�??�과 ?�일???�정?�로 Store ?�기 (?�기??
        hrStore = new Store({
            name: 'hr-system-data',
            cwd: hrUserData,                    // ?�사관�????�이??경로 지??            encryptionKey: 'hr-system-encryption-key-2026',  // ?�일 ?�호????            watch: true                          // ?�일 변�?감�?
        });
        
        console.log('[Main] ?�사관�???store ?�결 ?�공:', hrDataFile);
        return true;
        
    } catch (error) {
        console.error('[Main] ?�사관�???store ?�결 ?�패:', error.message);
        hrStore = null;
        return false;
    }
}

// ===== ?�이?�스 검�??�정 (v1.2.0) =====

/** ?�이?�스 캐시 ?�효 ?�간 (?�간) */
const LICENSE_CACHE_HOURS = 24;

/**
 * ??v1.2.0: ?�사관�??�의 ?�이?�스 ?�보 ?�인
 * electron-store?�서 hr_license_info ?��? ?�어 검�? * @returns {Object} { valid, status, message, license? }
 */
function checkHRLicense() {
    try {
        // 1. hrStore ?�결 ?�인
        if (!hrStore) {
            if (!initHRStore()) {
                return {
                    valid: false,
                    status: 'no_hr_app',
                    message: '?�사관�????�이?�에 ?�근?????�습?�다.'
                };
            }
        }
        
        // 2. electron-store?�서 ?�이?�스 ?�보 ?�기
        const licenseInfo = hrStore.get('hr_license_info');
        
        if (!licenseInfo) {
            console.log('[Main] ?�사???�이?�스 ?�보 ?�음 (electron-store)');
            return {
                valid: false,
                status: 'not_found',
                message: '?�사관�??�스?�에 ?�록???�이?�스가 ?�습?�다.\n?�사관�??�스?�에???�이?�스�?먼�? ?�성?�하?�요.'
            };
        }
        
        // 3. ?�효???�인
        if (!licenseInfo.valid) {
            return {
                valid: false,
                status: 'invalid',
                message: '?�사관�??�스?�의 ?�이?�스가 ?�효?��? ?�습?�다.',
                license: licenseInfo
            };
        }
        
        // 4. 만료???�인
        if (licenseInfo.expire_date) {
            const expireDate = new Date(licenseInfo.expire_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (today > expireDate) {
                return {
                    valid: false,
                    status: 'expired',
                    message: `?�이?�스가 만료?�었?�니?? (만료?? ${licenseInfo.expire_date})\n?�사관�??�스?�에???�이?�스�?갱신?�세??`,
                    license: licenseInfo
                };
            }
        }
        
        // 5. 캐시 ?�간 ?�인 (24?�간 ?�내 검증된 것인지)
        if (licenseInfo.cached_at) {
            const cachedTime = new Date(licenseInfo.cached_at).getTime();
            const now = Date.now();
            const hoursPassed = (now - cachedTime) / (1000 * 60 * 60);
            
            if (hoursPassed > LICENSE_CACHE_HOURS) {
                // 캐시 만료 - ?��?�?만료?�이 ?�직 ?�았?�면 ?�용 (?�프?�인 ?��?
                console.log('[Main] ?�이?�스 캐시 만료 (' + Math.round(hoursPassed) + '?�간 경과), 만료??기�? ?�용');
            }
        }
        
        // 6. ?�효???�이?�스
        console.log('[Main] ?�이?�스 ?�인 ?�공:', {
            status: licenseInfo.status,
            plan: licenseInfo.plan_type,
            expire: licenseInfo.expire_date,
            days_remaining: licenseInfo.days_remaining
        });
        
        return {
            valid: true,
            status: 'active',
            message: '?�이?�스가 ?�효?�니??',
            license: {
                plan_type: licenseInfo.plan_type,
                expire_date: licenseInfo.expire_date,
                days_remaining: licenseInfo.days_remaining,
                cached_at: licenseInfo.cached_at
            }
        };
        
    } catch (error) {
        console.error('[Main] ?�이?�스 ?�인 ?�류:', error);
        return {
            valid: false,
            status: 'error',
            message: '?�이?�스 ?�인 �??�류가 발생?�습?�다: ' + error.message
        };
    }
}

// ===== .hrm ?�호??백업 ?�정 =====

/** 백업 ?�일 ?�호????(AES-256-CBC) */
const BACKUP_ENCRYPTION_KEY = 'overtime-backup-encryption-2026';
const BACKUP_ALGORITHM = 'aes-256-cbc';

/**
 * ?�이???�호??(AES-256-CBC)
 * @param {string} plainText - ?�호?�할 ?�문 (JSON 문자??
 * @returns {string} ?�호?�된 문자??(iv:encrypted ?�식)
 */
function encryptBackup(plainText) {
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(BACKUP_ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // ?�더 + IV + ?�호�?결합
    return 'OTHRM1' + iv.toString('hex') + ':' + encrypted;
}

/**
 * ?�이??복호??(AES-256-CBC)
 * @param {string} encryptedText - ?�호?�된 문자?? * @returns {string} 복호?�된 ?�문 (JSON 문자??
 * @throws {Error} 복호???�패 ?? */
function decryptBackup(encryptedText) {
    // ?�더 ?�인
    if (!encryptedText.startsWith('OTHRM1')) {
        throw new Error('?�효?��? ?��? .hrm ?�일 ?�식?�니??');
    }
    const data = encryptedText.substring(6); // 'OTHRM1' ?�거
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const separatorIndex = data.indexOf(':');
    if (separatorIndex === -1) {
        throw new Error('?�호???�이??구조가 ?�바르�? ?�습?�다.');
    }
    const iv = Buffer.from(data.substring(0, separatorIndex), 'hex');
    const encrypted = data.substring(separatorIndex + 1);
    const decipher = crypto.createDecipheriv(BACKUP_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ===== ?�동 ?�데?�트 ?�정 =====

const { autoUpdater } = require('electron-updater');

// ?�데?�트 로그 ?�정
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Private ?�?�소 ?�증 ??setFeedURL 방식 (?�실???�증)
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'mangfeel',
    repo: 'overtime-system',
    private: true,
    token: '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'
});

// ?�동 ?�운로드 비활?�화 (?�용???�인 ???�운로드)
autoUpdater.autoDownload = false;

// ?�동 ?�치 비활?�화 (?�용???�인 ???�치)
autoUpdater.autoInstallOnAppQuit = true;

// ===== ?�역 변??=====

/** @type {BrowserWindow} 메인 ?�도??*/
let mainWindow = null;

/** @type {BrowserWindow} ?�데?�트 진행�??�도??*/
let progressWindow = null;

/** @type {boolean} 개발 모드 ?��? */
const isDev = !app.isPackaged;

/** @type {Object} ?�데?�트 ?�보 */
let updateInfo = null;

/** @type {string[]} ?�시 ?�일 경로 목록 (??종료 ????��) */
let tempFiles = [];

// ===== ?�도???�성 =====

/**
 * 메인 ?�도???�성
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        title: '?�간?�근무�?�?,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: isDev
        },
        frame: true,
        autoHideMenuBar: true,
        show: false
    });

    // 메인 ?�이지 로드 (로그???�이 바로 진입)
    mainWindow.loadFile('메인_?�간??html');

    // 준�??�료 ???�시
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
        
        // ?�로?�션 모드?�서�??�데?�트 ?�인
        if (!isDev) {
            setTimeout(() => {
                checkForUpdates();
            }, 3000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // ?��? 링크 보안
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    console.log('[Main] ?�도???�성 ?�료');
}

// ===== ?�동 ?�데?�트 ?�수 =====

/**
 * ?�데?�트 진행�??�도???�성
 */
function createProgressWindow() {
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.focus();
        return;
    }
    
    progressWindow = new BrowserWindow({
        width: 400,
        height: 150,
        parent: mainWindow,
        modal: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        frame: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    const progressHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Malgun Gothic', sans-serif;
                background: rgba(255, 255, 255, 0.98);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                padding: 24px;
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .title {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                margin-bottom: 16px;
                text-align: center;
            }
            .progress-container {
                background: #e9ecef;
                border-radius: 8px;
                height: 24px;
                overflow: hidden;
                margin-bottom: 12px;
            }
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #f59e0b 0%, #ef4444 100%);
                border-radius: 8px;
                transition: width 0.3s ease;
                width: 0%;
            }
            .progress-text {
                text-align: center;
                font-size: 13px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="title">?�� ?�데?�트 ?�운로드 �?..</div>
        <div class="progress-container">
            <div class="progress-bar" id="progressBar"></div>
        </div>
        <div class="progress-text" id="progressText">0% (0 / 0 MB)</div>
        <script>
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('update-progress', (event, data) => {
                document.getElementById('progressBar').style.width = data.percent + '%';
                document.getElementById('progressText').textContent = 
                    data.percent + '% (' + data.mbDownloaded + ' / ' + data.mbTotal + ' MB)';
            });
        </script>
    </body>
    </html>
    `;
    
    progressWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(progressHtml));
    
    progressWindow.on('closed', () => {
        progressWindow = null;
    });
    
    console.log('[Updater] 진행�??�도???�성');
}

/**
 * ?�데?�트 진행�??�도???�기
 */
function closeProgressWindow() {
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.close();
        progressWindow = null;
    }
    if (mainWindow) {
        mainWindow.setProgressBar(-1);
    }
}

/**
 * ?�데?�트 ?�인
 */
function checkForUpdates() {
    console.log('[Updater] ?�데?�트 ?�인 ?�작...');
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] ?�데?�트 ?�인 ?�류:', err);
    });
}

/**
 * ?�더?�에 ?�데?�트 ?�태 ?�송
 */
function sendUpdateStatus(status, data = null) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', { status, data });
    }
}

// ?�데?�트 ?�벤???�들??autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] ?�데?�트 ?�인 �?..');
    sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] ?�데?�트 발견:', info.version);
    updateInfo = info;
    sendUpdateStatus('available', info);
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '?�데?�트 ?�림',
        message: `??버전???�습?�다! (v${info.version})`,
        detail: '지�??�운로드?�시겠습?�까?',
        buttons: ['?�운로드', '?�중??],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            createProgressWindow();
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] 최신 버전?�니??', info.version);
    sendUpdateStatus('not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const mbDownloaded = (progress.transferred / 1024 / 1024).toFixed(1);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(1);
    
    console.log(`[Updater] ?�운로드 진행: ${percent}%`);
    sendUpdateStatus('downloading', { percent, mbDownloaded, mbTotal });
    
    // ?�업?�시�?진행�?    if (mainWindow) {
        mainWindow.setProgressBar(progress.percent / 100);
    }
    
    // 진행�??�도???�데?�트
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('update-progress', { percent, mbDownloaded, mbTotal });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] ?�운로드 ?�료:', info.version);
    sendUpdateStatus('downloaded', info);
    closeProgressWindow();
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '?�데?�트 준�??�료',
        message: `v${info.version} ?�운로드가 ?�료?�었?�니??`,
        detail: '지�??�시?�하???�데?�트�??�용?�시겠습?�까?',
        buttons: ['?�시??, '?�중??],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

autoUpdater.on('error', (error) => {
    console.error('[Updater] ?�류:', error);
    sendUpdateStatus('error', { message: error.message });
    closeProgressWindow();
});

// ===== ???�이?�사?�클 =====

app.whenReady().then(() => {
    // ?�사관�???store ?�결 ?�도
    initHRStore();
    
    // ?�도???�성
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ??종료 ???�시 ?�일 ?�리
app.on('before-quit', () => {
    console.log('[Main] ??종료 - ?�시 ?�일 ?�리 ?�작');
    
    tempFiles.forEach(filePath => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('[Main] ?�시 ?�일 ??��:', filePath);
            }
        } catch (err) {
            console.warn('[Main] ?�시 ?�일 ??�� ?�패:', filePath, err.message);
        }
    });
    
    tempFiles = [];
    console.log('[Main] ?�시 ?�일 ?�리 ?�료');
});

// ===== IPC ?�들?? ?�동 ?�데?�트 =====

ipcMain.handle('check-for-updates', () => {
    if (isDev) {
        return { success: false, message: '개발 모드?�서???�데?�트�??�인?????�습?�다.' };
    }
    checkForUpdates();
    return { success: true, message: '?�데?�트 ?�인 �?..' };
});

ipcMain.handle('download-update', () => {
    if (updateInfo) {
        autoUpdater.downloadUpdate();
        return { success: true };
    }
    return { success: false, message: '?�운로드???�데?�트가 ?�습?�다.' };
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
    return {
        version: app.getVersion(),
        isDev: isDev
    };
});

// ===== IPC ?�들?? ?�체 ?�이???�??(electron-store) =====

ipcMain.handle('store-set', (event, key, value) => {
    try {
        store.set(key, value);
        console.log('[Main] store-set:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-set ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get', (event, key) => {
    try {
        const value = store.get(key);
        console.log('[Main] store-get:', key, value ? '(?�이???�음)' : '(?�이???�음)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] store-get ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-delete', (event, key) => {
    try {
        store.delete(key);
        console.log('[Main] store-delete:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-delete ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get-all', (event) => {
    try {
        const allData = store.store;
        console.log('[Main] store-get-all: ?�체 ?�이??조회');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] store-get-all ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-clear', (event) => {
    try {
        store.clear();
        console.log('[Main] store-clear: ?�체 ?�이??초기??);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-clear ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get-path', (event) => {
    return { 
        success: true, 
        path: store.path,
        userData: app.getPath('userData')
    };
});

// ===== IPC ?�들?? ?�사관�????�이???�기 (?�기 ?�용) =====

/**
 * ?�사관�????�치 ?�인
 * @returns {Object} { installed, dataPath, hasData }
 */
ipcMain.handle('check-hr-app', () => {
    try {
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        const installed = fs.existsSync(hrDataFile);
        
        // store 미초기화 ???�시??        if (installed && !hrStore) {
            initHRStore();
        }
        
        let hasData = false;
        if (hrStore) {
            try {
                const dbData = hrStore.get('hr_system_v25_db');
                hasData = dbData && dbData.employees && dbData.employees.length > 0;
            } catch (e) {
                console.warn('[Main] HR ?�이???�인 ?�패:', e.message);
            }
        }
        
        console.log('[Main] ?�사???�인:', { installed, hasData });
        return { 
            success: true, 
            installed, 
            dataPath: hrDataFile,
            hasData 
        };
    } catch (error) {
        console.error('[Main] ?�사???�인 ?�류:', error);
        return { success: false, installed: false, hasData: false, error: error.message };
    }
});

/**
 * ??v1.2.0: ?�사관�????�이?�스 ?�인
 * HR ?�의 electron-store?�서 ?�이?�스 ?�보�??�어 검�? * @returns {Object} { valid, status, message, license? }
 */
ipcMain.handle('check-hr-license', () => {
    return checkHRLicense();
});

/**
 * ?�사관�????�이???�기 (?�기 ?�용)
 * @param {string} key - ?�을 ?�이???? * @returns {Object} { success, data }
 */
ipcMain.handle('hr-store-get', (event, key) => {
    try {
        if (!hrStore) {
            // ?�초기화 ?�도
            if (!initHRStore()) {
                return { success: false, error: '?�사관�????�이?�에 ?�근?????�습?�다.' };
            }
        }
        
        const value = hrStore.get(key);
        console.log('[Main] hr-store-get:', key, value ? '(?�이???�음)' : '(?�이???�음)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] hr-store-get ?�류:', error);
        return { success: false, error: error.message };
    }
});

/**
 * ?�사관�????�체 ?�이???�기 (?�기 ?�용)
 */
ipcMain.handle('hr-store-get-all', (event) => {
    try {
        if (!hrStore) {
            if (!initHRStore()) {
                return { success: false, error: '?�사관�????�이?�에 ?�근?????�습?�다.' };
            }
        }
        
        const allData = hrStore.store;
        console.log('[Main] hr-store-get-all: ?�사 ?�체 ?�이??조회');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] hr-store-get-all ?�류:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC ?�들?? ???�보 =====

ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        name: app.getName(),
        path: app.getAppPath(),
        userData: app.getPath('userData'),
        storePath: store.path,
        hrStoreConnected: !!hrStore,
        isDev: isDev
    };
});

// ===== IPC ?�들?? ?�이?�로�?=====

ipcMain.handle('show-message', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: options.type || 'info',
        title: options.title || '?�림',
        message: options.message || '',
        detail: options.detail || '',
        buttons: options.buttons || ['?�인']
    });
    return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || '?�??,
        defaultPath: options.defaultPath || '',
        filters: options.filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || '?�기',
        properties: options.properties || ['openFile'],
        filters: options.filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// ===== IPC ?�들?? ?�일 ?�스??=====

ipcMain.handle('write-file', async (event, filePath, data) => {
    try {
        fs.writeFileSync(filePath, data, 'utf8');
        console.log('[Main] ?�일 ?�??', filePath);
        return { success: true };
    } catch (error) {
        console.error('[Main] ?�일 ?�???�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        console.log('[Main] ?�일 ?�기:', filePath);
        return { success: true, data: data };
    } catch (error) {
        console.error('[Main] ?�일 ?�기 ?�류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('quit-app', () => {
    app.quit();
});

// ===== IPC ?�들?? 브라?��?�??�기 (?�쇄) =====

ipcMain.handle('open-in-browser', async (event, htmlContent, filename = 'print_temp.html') => {
    try {
        const os = require('os');
        const { shell } = require('electron');
        
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, 'ot_print_' + Date.now() + '.html');
        
        fs.writeFileSync(tempFile, htmlContent, 'utf8');
        console.log('[Main] ?�시 ?�일 ?�성:', tempFile);
        
        tempFiles.push(tempFile);
        
        const result = await shell.openPath(tempFile);
        
        if (result) {
            console.error('[Main] 브라?��? ?�기 ?�류:', result);
            return { success: false, error: result };
        }
        
        console.log('[Main] 브라?��?�??�기 ?�료');
        return { success: true, path: tempFile };
    } catch (error) {
        console.error('[Main] 브라?��?�??�기 ?�류:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC ?�들?? .hrm ?�호??백업/복원 =====

/**
 * 백업 ?�??(.hrm ?�호??
 * ?�더?�에??JSON ?�이?��? 받아 ?�호?????�일�??�?? * @param {string} jsonData - 백업??JSON 문자?? * @param {string} defaultFilename - 기본 ?�일�? * @returns {Object} { success, filePath?, error? }
 */
ipcMain.handle('backup-save-hrm', async (event, jsonData, defaultFilename) => {
    try {
        // 1. ?�???�이?�로�??�시
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '백업 ?�일 ?�??,
            defaultPath: defaultFilename || '?�간?�근�?백업.hrm',
            filters: [
                { name: '?�간?�근�?백업 ?�일', extensions: ['hrm'] },
                { name: '모든 ?�일', extensions: ['*'] }
            ]
        });
        
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        
        // 2. ?�이???�호??        const encrypted = encryptBackup(jsonData);
        
        // 3. ?�일 ?�??        fs.writeFileSync(result.filePath, encrypted, 'utf8');
        console.log('[Main] .hrm 백업 ?�??', result.filePath);
        
        return { success: true, filePath: result.filePath };
        
    } catch (error) {
        console.error('[Main] .hrm 백업 ?�???�류:', error);
        return { success: false, error: error.message };
    }
});

/**
 * 백업 복원 (.hrm ?�호???�는 .json ?�문)
 * ?�일 ?�기 ?�이?�로�????�일 ?�기 ??복호???�요 ?? ??JSON 반환
 * @returns {Object} { success, data?, filePath?, fileType?, error? }
 */
ipcMain.handle('backup-load-hrm', async (event) => {
    try {
        // 1. ?�기 ?�이?�로�??�시
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '백업 ?�일 ?�기',
            properties: ['openFile'],
            filters: [
                { name: '백업 ?�일', extensions: ['hrm', 'json'] },
                { name: '?�간?�근�?백업 ?�일', extensions: ['hrm'] },
                { name: 'JSON ?�일', extensions: ['json'] },
                { name: '모든 ?�일', extensions: ['*'] }
            ]
        });
        
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        
        const filePath = result.filePaths[0];
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).toLowerCase();
        
        let jsonData;
        let fileType;
        
        // 2. ?�일 ?�식 ?�별 �?처리
        if (ext === '.hrm' || fileContent.startsWith('OTHRM1')) {
            // .hrm ?�호???�일 ??복호??            const decrypted = decryptBackup(fileContent);
            jsonData = JSON.parse(decrypted);
            fileType = 'hrm';
            console.log('[Main] .hrm 백업 복원:', filePath);
        } else {
            // .json ?�문 ?�일 (?�위 ?�환)
            jsonData = JSON.parse(fileContent);
            fileType = 'json';
            console.log('[Main] .json 백업 복원 (?�거??:', filePath);
        }
        
        return { success: true, data: jsonData, filePath, fileType };
        
    } catch (error) {
        console.error('[Main] 백업 복원 ?�류:', error);
        
        // 복호???�패 ??친절???�류 메시지
        if (error.message.includes('?�효?��? ?��?') || error.message.includes('?�호??) || 
            error.message.includes('bad decrypt') || error.message.includes('wrong final block')) {
            return { success: false, error: '백업 ?�일???�상?�었거나 ?�른 ?�스?�에???�성???�일?�니??' };
        }
        
        return { success: false, error: error.message };
    }
});

// ===== ?�러 ?�들�?=====

process.on('uncaughtException', (error) => {
    console.error('[Main] ?�외 발생:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Promise 거�?:', reason);
});

console.log('[Main] main.js 로드 ?�료 (v1.2.0)');
