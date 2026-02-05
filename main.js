/**
 * main.js - Electron Î©îÏù∏ ?ÑÎ°ú?∏Ïä§
 * 
 * ?úÍ∞Ñ?∏Í∑ºÎ¨¥Í?Î¶??∞Ïä§?¨ÌÜ± ?±Ïùò Î©îÏù∏ ?ÑÎ°ú?∏Ïä§
 * - ???àÎèÑ???ùÏÑ± Î∞?Í¥ÄÎ¶? * - IPC ?µÏã† ?∏Îì§?? * - electron-store Í∏∞Î∞ò ?êÏ≤¥ ?∞Ïù¥???Ä?? * - ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥???ΩÍ∏∞ ?ÑÏö© ?ëÍ∑º
 * - ?êÎèô ?ÖÎç∞?¥Ìä∏
 * - .hrm ?îÌò∏??Î∞±ÏóÖ/Î≥µÏõê
 * - ?∏ÏÇ¨Í¥ÄÎ¶????ºÏù¥?†Ïä§ Í≤ÄÏ¶?(v1.2.0)
 * 
 * @version 1.2.0
 * @since 2026-02-05
 * 
 * [Î≥ÄÍ≤??¥Î†•]
 * v1.2.0 (2026-02-06) - ?ºÏù¥?†Ïä§ Í≤ÄÏ¶??úÏä§??Ï∂îÍ?
 *   - check-hr-license IPC ?∏Îì§?? ?∏ÏÇ¨??electron-store?êÏÑú ?ºÏù¥?†Ïä§ ?ïÏù∏
 *   - ?ºÏù¥?†Ïä§ ÎßåÎ£å??Í≤ÄÏ¶? *   - Ï∫êÏãú ?†Ìö® ?úÍ∞Ñ(24?úÍ∞Ñ) Í≤ÄÏ¶? * 
 * v1.1.0 (2026-02-05) - .hrm ?îÌò∏??Î∞±ÏóÖ ?ÑÏûÖ
 *   - AES-256-CBC ?îÌò∏??Î∞±ÏóÖ/Î≥µÏõê IPC ?∏Îì§??Ï∂îÍ?
 *   - backup-save-hrm: ?∞Ïù¥???îÌò∏?????Ä???§Ïù¥?ºÎ°úÍ∑???.hrm ?åÏùº ?Ä?? *   - backup-load-hrm: ?¥Í∏∞ ?§Ïù¥?ºÎ°úÍ∑???.hrm/.json ?åÏùº ?ΩÍ∏∞ ??Î≥µÌò∏?? *   - .json ?òÏúÑ ?∏Ìôò (Î≥µÏõê ??.json ?âÎ¨∏ ?åÏùº??ÏßÄ??
 * 
 * v1.0.0 (2026-02-05) - Ï¥àÍ∏∞ Î¶¥Î¶¨Ï¶? *   - Phase 1: Electron ?ÑÎ°ú?ùÌä∏ Ï¥àÍ∏∞?? *   - electron-store Í∏∞Î∞ò ?êÏ≤¥ ?∞Ïù¥???Ä?? *   - ?∏ÏÇ¨Í¥ÄÎ¶???electron-store ?ΩÍ∏∞ ?ÑÏö© ?ëÍ∑º
 *   - ?∏ÏÇ¨???§Ïπò ?ïÏù∏ Î∞??ºÏù¥?†Ïä§ Í≤ÄÏ¶? *   - ?êÎèô ?ÖÎç∞?¥Ìä∏ (GitHub Release Í∏∞Î∞ò)
 *   - ?§Ïù¥?ºÎ°úÍ∑? ?åÏùº ?úÏä§?? ?∏ÏáÑ IPC ?∏Îì§?? */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===== electron-store ?§Ï†ï =====

const Store = require('electron-store');

/**
 * ?êÏ≤¥ ?∞Ïù¥???Ä?•ÏÜå (?úÍ∞Ñ?∏Í∑ºÎ¨??∞Ïù¥??
 * ?∞Ïù¥?∞Îäî C:\Users\?¨Ïö©??AppData\Roaming\overtime-system\overtime-data.json ???Ä?•Îê®
 */
const store = new Store({
    name: 'overtime-data',
    encryptionKey: 'overtime-system-encryption-key-2026',
    defaults: {
        // ?úÍ∞Ñ?∏Í∑ºÎ¨?Í∏∞Î°ù
        hr_overtime_daily: {},
        // Í∑ºÌÉú Í∏∞Î°ù
        hr_attendance_records: {},
        // Í≥µÌú¥???§Ï†ï
        hr_overtime_holidays: null,
        // ?úÍ∞Ñ???†Ìòï ?§Ï†ï
        hr_overtime_settings: null,
        // Ï£????úÌïú ?§Ï†ï
        hr_overtime_limits: null
    }
});

console.log('[Main] ?êÏ≤¥ store Í≤ΩÎ°ú:', store.path);

/**
 * ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥???ΩÍ∏∞ ?ÑÏö© ?Ä?•ÏÜå
 * Í≤ΩÎ°ú: C:\Users\?¨Ïö©??AppData\Roaming\hr-system\hr-system-data.json
 * ?†Ô∏è ?ΩÍ∏∞ ?ÑÏö© - ?àÎ? ?∞Í∏∞ Í∏àÏ?
 */
let hrStore = null;

/**
 * ?∏ÏÇ¨Í¥ÄÎ¶???store Ï¥àÍ∏∞??(?ΩÍ∏∞ ?ÑÏö©)
 * @returns {boolean} Ï¥àÍ∏∞???±Í≥µ ?¨Î?
 */
function initHRStore() {
    try {
        // ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥??Í≤ΩÎ°ú ?ïÏù∏
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        
        if (!fs.existsSync(hrDataFile)) {
            console.warn('[Main] ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥???åÏùº ?ÜÏùå:', hrDataFile);
            return false;
        }
        
        // ?∏ÏÇ¨Í¥ÄÎ¶??±Í≥º ?ôÏùº???§Ï†ï?ºÎ°ú Store ?¥Í∏∞ (?ΩÍ∏∞??
        hrStore = new Store({
            name: 'hr-system-data',
            cwd: hrUserData,                    // ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥??Í≤ΩÎ°ú ÏßÄ??            encryptionKey: 'hr-system-encryption-key-2026',  // ?ôÏùº ?îÌò∏????            watch: true                          // ?åÏùº Î≥ÄÍ≤?Í∞êÏ?
        });
        
        console.log('[Main] ?∏ÏÇ¨Í¥ÄÎ¶???store ?∞Í≤∞ ?±Í≥µ:', hrDataFile);
        return true;
        
    } catch (error) {
        console.error('[Main] ?∏ÏÇ¨Í¥ÄÎ¶???store ?∞Í≤∞ ?§Ìå®:', error.message);
        hrStore = null;
        return false;
    }
}

// ===== ?ºÏù¥?†Ïä§ Í≤ÄÏ¶??§Ï†ï (v1.2.0) =====

/** ?ºÏù¥?†Ïä§ Ï∫êÏãú ?†Ìö® ?úÍ∞Ñ (?úÍ∞Ñ) */
const LICENSE_CACHE_HOURS = 24;

/**
 * ??v1.2.0: ?∏ÏÇ¨Í¥ÄÎ¶??±Ïùò ?ºÏù¥?†Ïä§ ?ïÎ≥¥ ?ïÏù∏
 * electron-store?êÏÑú hr_license_info ?§Î? ?ΩÏñ¥ Í≤ÄÏ¶? * @returns {Object} { valid, status, message, license? }
 */
function checkHRLicense() {
    try {
        // 1. hrStore ?∞Í≤∞ ?ïÏù∏
        if (!hrStore) {
            if (!initHRStore()) {
                return {
                    valid: false,
                    status: 'no_hr_app',
                    message: '?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥?∞Ïóê ?ëÍ∑º?????ÜÏäµ?àÎã§.'
                };
            }
        }
        
        // 2. electron-store?êÏÑú ?ºÏù¥?†Ïä§ ?ïÎ≥¥ ?ΩÍ∏∞
        const licenseInfo = hrStore.get('hr_license_info');
        
        if (!licenseInfo) {
            console.log('[Main] ?∏ÏÇ¨???ºÏù¥?†Ïä§ ?ïÎ≥¥ ?ÜÏùå (electron-store)');
            return {
                valid: false,
                status: 'not_found',
                message: '?∏ÏÇ¨Í¥ÄÎ¶??úÏä§?úÏóê ?±Î°ù???ºÏù¥?†Ïä§Í∞Ä ?ÜÏäµ?àÎã§.\n?∏ÏÇ¨Í¥ÄÎ¶??úÏä§?úÏóê???ºÏù¥?†Ïä§Î•?Î®ºÏ? ?úÏÑ±?îÌïò?∏Ïöî.'
            };
        }
        
        // 3. ?†Ìö®???ïÏù∏
        if (!licenseInfo.valid) {
            return {
                valid: false,
                status: 'invalid',
                message: '?∏ÏÇ¨Í¥ÄÎ¶??úÏä§?úÏùò ?ºÏù¥?†Ïä§Í∞Ä ?†Ìö®?òÏ? ?äÏäµ?àÎã§.',
                license: licenseInfo
            };
        }
        
        // 4. ÎßåÎ£å???ïÏù∏
        if (licenseInfo.expire_date) {
            const expireDate = new Date(licenseInfo.expire_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (today > expireDate) {
                return {
                    valid: false,
                    status: 'expired',
                    message: `?ºÏù¥?†Ïä§Í∞Ä ÎßåÎ£å?òÏóà?µÎãà?? (ÎßåÎ£å?? ${licenseInfo.expire_date})\n?∏ÏÇ¨Í¥ÄÎ¶??úÏä§?úÏóê???ºÏù¥?†Ïä§Î•?Í∞±Ïã†?òÏÑ∏??`,
                    license: licenseInfo
                };
            }
        }
        
        // 5. Ï∫êÏãú ?úÍ∞Ñ ?ïÏù∏ (24?úÍ∞Ñ ?¥ÎÇ¥ Í≤ÄÏ¶ùÎêú Í≤ÉÏù∏ÏßÄ)
        if (licenseInfo.cached_at) {
            const cachedTime = new Date(licenseInfo.cached_at).getTime();
            const now = Date.now();
            const hoursPassed = (now - cachedTime) / (1000 * 60 * 60);
            
            if (hoursPassed > LICENSE_CACHE_HOURS) {
                // Ï∫êÏãú ÎßåÎ£å - ?òÏ?Îß?ÎßåÎ£å?ºÏù¥ ?ÑÏßÅ ?®Ïïò?ºÎ©¥ ?àÏö© (?§ÌîÑ?ºÏù∏ ?ÄÎπ?
                console.log('[Main] ?ºÏù¥?†Ïä§ Ï∫êÏãú ÎßåÎ£å (' + Math.round(hoursPassed) + '?úÍ∞Ñ Í≤ΩÍ≥º), ÎßåÎ£å??Í∏∞Ï? ?àÏö©');
            }
        }
        
        // 6. ?†Ìö®???ºÏù¥?†Ïä§
        console.log('[Main] ?ºÏù¥?†Ïä§ ?ïÏù∏ ?±Í≥µ:', {
            status: licenseInfo.status,
            plan: licenseInfo.plan_type,
            expire: licenseInfo.expire_date,
            days_remaining: licenseInfo.days_remaining
        });
        
        return {
            valid: true,
            status: 'active',
            message: '?ºÏù¥?†Ïä§Í∞Ä ?†Ìö®?©Îãà??',
            license: {
                plan_type: licenseInfo.plan_type,
                expire_date: licenseInfo.expire_date,
                days_remaining: licenseInfo.days_remaining,
                cached_at: licenseInfo.cached_at
            }
        };
        
    } catch (error) {
        console.error('[Main] ?ºÏù¥?†Ïä§ ?ïÏù∏ ?§Î•ò:', error);
        return {
            valid: false,
            status: 'error',
            message: '?ºÏù¥?†Ïä§ ?ïÏù∏ Ï§??§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§: ' + error.message
        };
    }
}

// ===== .hrm ?îÌò∏??Î∞±ÏóÖ ?§Ï†ï =====

/** Î∞±ÏóÖ ?åÏùº ?îÌò∏????(AES-256-CBC) */
const BACKUP_ENCRYPTION_KEY = 'overtime-backup-encryption-2026';
const BACKUP_ALGORITHM = 'aes-256-cbc';

/**
 * ?∞Ïù¥???îÌò∏??(AES-256-CBC)
 * @param {string} plainText - ?îÌò∏?îÌï† ?âÎ¨∏ (JSON Î¨∏Ïûê??
 * @returns {string} ?îÌò∏?îÎêú Î¨∏Ïûê??(iv:encrypted ?ïÏãù)
 */
function encryptBackup(plainText) {
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(BACKUP_ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // ?§Îçî + IV + ?îÌò∏Î¨?Í≤∞Ìï©
    return 'OTHRM1' + iv.toString('hex') + ':' + encrypted;
}

/**
 * ?∞Ïù¥??Î≥µÌò∏??(AES-256-CBC)
 * @param {string} encryptedText - ?îÌò∏?îÎêú Î¨∏Ïûê?? * @returns {string} Î≥µÌò∏?îÎêú ?âÎ¨∏ (JSON Î¨∏Ïûê??
 * @throws {Error} Î≥µÌò∏???§Ìå® ?? */
function decryptBackup(encryptedText) {
    // ?§Îçî ?ïÏù∏
    if (!encryptedText.startsWith('OTHRM1')) {
        throw new Error('?†Ìö®?òÏ? ?äÏ? .hrm ?åÏùº ?ïÏãù?ÖÎãà??');
    }
    const data = encryptedText.substring(6); // 'OTHRM1' ?úÍ±∞
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const separatorIndex = data.indexOf(':');
    if (separatorIndex === -1) {
        throw new Error('?îÌò∏???∞Ïù¥??Íµ¨Ï°∞Í∞Ä ?¨Î∞îÎ•¥Ï? ?äÏäµ?àÎã§.');
    }
    const iv = Buffer.from(data.substring(0, separatorIndex), 'hex');
    const encrypted = data.substring(separatorIndex + 1);
    const decipher = crypto.createDecipheriv(BACKUP_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ===== ?êÎèô ?ÖÎç∞?¥Ìä∏ ?§Ï†ï =====

const { autoUpdater } = require('electron-updater');

// ?ÖÎç∞?¥Ìä∏ Î°úÍ∑∏ ?§Ï†ï
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Private ?Ä?•ÏÜå ?∏Ï¶ù ??setFeedURL Î∞©Ïãù (?ïÏã§???∏Ï¶ù)
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'mangfeel',
    repo: 'overtime-system',
    private: true,
    token: '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'
});

// ?êÎèô ?§Ïö¥Î°úÎìú ÎπÑÌôú?±Ìôî (?¨Ïö©???ïÏù∏ ???§Ïö¥Î°úÎìú)
autoUpdater.autoDownload = false;

// ?êÎèô ?§Ïπò ÎπÑÌôú?±Ìôî (?¨Ïö©???ïÏù∏ ???§Ïπò)
autoUpdater.autoInstallOnAppQuit = true;

// ===== ?ÑÏó≠ Î≥Ä??=====

/** @type {BrowserWindow} Î©îÏù∏ ?àÎèÑ??*/
let mainWindow = null;

/** @type {BrowserWindow} ?ÖÎç∞?¥Ìä∏ ÏßÑÌñâÎ•??àÎèÑ??*/
let progressWindow = null;

/** @type {boolean} Í∞úÎ∞ú Î™®Îìú ?¨Î? */
const isDev = !app.isPackaged;

/** @type {Object} ?ÖÎç∞?¥Ìä∏ ?ïÎ≥¥ */
let updateInfo = null;

/** @type {string[]} ?ÑÏãú ?åÏùº Í≤ΩÎ°ú Î™©Î°ù (??Ï¢ÖÎ£å ????†ú) */
let tempFiles = [];

// ===== ?àÎèÑ???ùÏÑ± =====

/**
 * Î©îÏù∏ ?àÎèÑ???ùÏÑ±
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        title: '?úÍ∞Ñ?∏Í∑ºÎ¨¥Í?Î¶?,
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

    // Î©îÏù∏ ?òÏù¥ÏßÄ Î°úÎìú (Î°úÍ∑∏???ÜÏù¥ Î∞îÎ°ú ÏßÑÏûÖ)
    mainWindow.loadFile('Î©îÏù∏_?úÍ∞Ñ??html');

    // Ï§ÄÎπ??ÑÎ£å ???úÏãú
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
        
        // ?ÑÎ°ú?ïÏÖò Î™®Îìú?êÏÑúÎß??ÖÎç∞?¥Ìä∏ ?ïÏù∏
        if (!isDev) {
            setTimeout(() => {
                checkForUpdates();
            }, 3000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // ?∏Î? ÎßÅÌÅ¨ Î≥¥Ïïà
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    console.log('[Main] ?àÎèÑ???ùÏÑ± ?ÑÎ£å');
}

// ===== ?êÎèô ?ÖÎç∞?¥Ìä∏ ?®Ïàò =====

/**
 * ?ÖÎç∞?¥Ìä∏ ÏßÑÌñâÎ•??àÎèÑ???ùÏÑ±
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
        <div class="title">?îÑ ?ÖÎç∞?¥Ìä∏ ?§Ïö¥Î°úÎìú Ï§?..</div>
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
    
    console.log('[Updater] ÏßÑÌñâÎ•??àÎèÑ???ùÏÑ±');
}

/**
 * ?ÖÎç∞?¥Ìä∏ ÏßÑÌñâÎ•??àÎèÑ???´Í∏∞
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
 * ?ÖÎç∞?¥Ìä∏ ?ïÏù∏
 */
function checkForUpdates() {
    console.log('[Updater] ?ÖÎç∞?¥Ìä∏ ?ïÏù∏ ?úÏûë...');
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] ?ÖÎç∞?¥Ìä∏ ?ïÏù∏ ?§Î•ò:', err);
    });
}

/**
 * ?åÎçî?¨Ïóê ?ÖÎç∞?¥Ìä∏ ?ÅÌÉú ?ÑÏÜ°
 */
function sendUpdateStatus(status, data = null) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', { status, data });
    }
}

// ?ÖÎç∞?¥Ìä∏ ?¥Î≤§???∏Îì§??autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] ?ÖÎç∞?¥Ìä∏ ?ïÏù∏ Ï§?..');
    sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] ?ÖÎç∞?¥Ìä∏ Î∞úÍ≤¨:', info.version);
    updateInfo = info;
    sendUpdateStatus('available', info);
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '?ÖÎç∞?¥Ìä∏ ?åÎ¶º',
        message: `??Î≤ÑÏ†Ñ???àÏäµ?àÎã§! (v${info.version})`,
        detail: 'ÏßÄÍ∏??§Ïö¥Î°úÎìú?òÏãúÍ≤†Ïäµ?àÍπå?',
        buttons: ['?§Ïö¥Î°úÎìú', '?òÏ§ë??],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            createProgressWindow();
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] ÏµúÏã† Î≤ÑÏ†Ñ?ÖÎãà??', info.version);
    sendUpdateStatus('not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const mbDownloaded = (progress.transferred / 1024 / 1024).toFixed(1);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(1);
    
    console.log(`[Updater] ?§Ïö¥Î°úÎìú ÏßÑÌñâ: ${percent}%`);
    sendUpdateStatus('downloading', { percent, mbDownloaded, mbTotal });
    
    // ?ëÏóÖ?úÏãúÏ§?ÏßÑÌñâÎ•?    if (mainWindow) {
        mainWindow.setProgressBar(progress.percent / 100);
    }
    
    // ÏßÑÌñâÎ•??àÎèÑ???ÖÎç∞?¥Ìä∏
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('update-progress', { percent, mbDownloaded, mbTotal });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] ?§Ïö¥Î°úÎìú ?ÑÎ£å:', info.version);
    sendUpdateStatus('downloaded', info);
    closeProgressWindow();
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '?ÖÎç∞?¥Ìä∏ Ï§ÄÎπ??ÑÎ£å',
        message: `v${info.version} ?§Ïö¥Î°úÎìúÍ∞Ä ?ÑÎ£å?òÏóà?µÎãà??`,
        detail: 'ÏßÄÍ∏??¨Ïãú?ëÌïò???ÖÎç∞?¥Ìä∏Î•??ÅÏö©?òÏãúÍ≤†Ïäµ?àÍπå?',
        buttons: ['?¨Ïãú??, '?òÏ§ë??],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

autoUpdater.on('error', (error) => {
    console.error('[Updater] ?§Î•ò:', error);
    sendUpdateStatus('error', { message: error.message });
    closeProgressWindow();
});

// ===== ???ºÏù¥?ÑÏÇ¨?¥ÌÅ¥ =====

app.whenReady().then(() => {
    // ?∏ÏÇ¨Í¥ÄÎ¶???store ?∞Í≤∞ ?úÎèÑ
    initHRStore();
    
    // ?àÎèÑ???ùÏÑ±
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

// ??Ï¢ÖÎ£å ???ÑÏãú ?åÏùº ?ïÎ¶¨
app.on('before-quit', () => {
    console.log('[Main] ??Ï¢ÖÎ£å - ?ÑÏãú ?åÏùº ?ïÎ¶¨ ?úÏûë');
    
    tempFiles.forEach(filePath => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('[Main] ?ÑÏãú ?åÏùº ??†ú:', filePath);
            }
        } catch (err) {
            console.warn('[Main] ?ÑÏãú ?åÏùº ??†ú ?§Ìå®:', filePath, err.message);
        }
    });
    
    tempFiles = [];
    console.log('[Main] ?ÑÏãú ?åÏùº ?ïÎ¶¨ ?ÑÎ£å');
});

// ===== IPC ?∏Îì§?? ?êÎèô ?ÖÎç∞?¥Ìä∏ =====

ipcMain.handle('check-for-updates', () => {
    if (isDev) {
        return { success: false, message: 'Í∞úÎ∞ú Î™®Îìú?êÏÑú???ÖÎç∞?¥Ìä∏Î•??ïÏù∏?????ÜÏäµ?àÎã§.' };
    }
    checkForUpdates();
    return { success: true, message: '?ÖÎç∞?¥Ìä∏ ?ïÏù∏ Ï§?..' };
});

ipcMain.handle('download-update', () => {
    if (updateInfo) {
        autoUpdater.downloadUpdate();
        return { success: true };
    }
    return { success: false, message: '?§Ïö¥Î°úÎìú???ÖÎç∞?¥Ìä∏Í∞Ä ?ÜÏäµ?àÎã§.' };
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

// ===== IPC ?∏Îì§?? ?êÏ≤¥ ?∞Ïù¥???Ä??(electron-store) =====

ipcMain.handle('store-set', (event, key, value) => {
    try {
        store.set(key, value);
        console.log('[Main] store-set:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-set ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get', (event, key) => {
    try {
        const value = store.get(key);
        console.log('[Main] store-get:', key, value ? '(?∞Ïù¥???àÏùå)' : '(?∞Ïù¥???ÜÏùå)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] store-get ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-delete', (event, key) => {
    try {
        store.delete(key);
        console.log('[Main] store-delete:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-delete ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get-all', (event) => {
    try {
        const allData = store.store;
        console.log('[Main] store-get-all: ?ÑÏ≤¥ ?∞Ïù¥??Ï°∞Ìöå');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] store-get-all ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-clear', (event) => {
    try {
        store.clear();
        console.log('[Main] store-clear: ?ÑÏ≤¥ ?∞Ïù¥??Ï¥àÍ∏∞??);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-clear ?§Î•ò:', error);
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

// ===== IPC ?∏Îì§?? ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥???ΩÍ∏∞ (?ΩÍ∏∞ ?ÑÏö©) =====

/**
 * ?∏ÏÇ¨Í¥ÄÎ¶????§Ïπò ?ïÏù∏
 * @returns {Object} { installed, dataPath, hasData }
 */
ipcMain.handle('check-hr-app', () => {
    try {
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        const installed = fs.existsSync(hrDataFile);
        
        // store ÎØ∏Ï¥àÍ∏∞Ìôî ???¨Ïãú??        if (installed && !hrStore) {
            initHRStore();
        }
        
        let hasData = false;
        if (hrStore) {
            try {
                const dbData = hrStore.get('hr_system_v25_db');
                hasData = dbData && dbData.employees && dbData.employees.length > 0;
            } catch (e) {
                console.warn('[Main] HR ?∞Ïù¥???ïÏù∏ ?§Ìå®:', e.message);
            }
        }
        
        console.log('[Main] ?∏ÏÇ¨???ïÏù∏:', { installed, hasData });
        return { 
            success: true, 
            installed, 
            dataPath: hrDataFile,
            hasData 
        };
    } catch (error) {
        console.error('[Main] ?∏ÏÇ¨???ïÏù∏ ?§Î•ò:', error);
        return { success: false, installed: false, hasData: false, error: error.message };
    }
});

/**
 * ??v1.2.0: ?∏ÏÇ¨Í¥ÄÎ¶????ºÏù¥?†Ïä§ ?ïÏù∏
 * HR ?±Ïùò electron-store?êÏÑú ?ºÏù¥?†Ïä§ ?ïÎ≥¥Î•??ΩÏñ¥ Í≤ÄÏ¶? * @returns {Object} { valid, status, message, license? }
 */
ipcMain.handle('check-hr-license', () => {
    return checkHRLicense();
});

/**
 * ?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥???ΩÍ∏∞ (?ΩÍ∏∞ ?ÑÏö©)
 * @param {string} key - ?ΩÏùÑ ?∞Ïù¥???? * @returns {Object} { success, data }
 */
ipcMain.handle('hr-store-get', (event, key) => {
    try {
        if (!hrStore) {
            // ?¨Ï¥àÍ∏∞Ìôî ?úÎèÑ
            if (!initHRStore()) {
                return { success: false, error: '?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥?∞Ïóê ?ëÍ∑º?????ÜÏäµ?àÎã§.' };
            }
        }
        
        const value = hrStore.get(key);
        console.log('[Main] hr-store-get:', key, value ? '(?∞Ïù¥???àÏùå)' : '(?∞Ïù¥???ÜÏùå)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] hr-store-get ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

/**
 * ?∏ÏÇ¨Í¥ÄÎ¶????ÑÏ≤¥ ?∞Ïù¥???ΩÍ∏∞ (?ΩÍ∏∞ ?ÑÏö©)
 */
ipcMain.handle('hr-store-get-all', (event) => {
    try {
        if (!hrStore) {
            if (!initHRStore()) {
                return { success: false, error: '?∏ÏÇ¨Í¥ÄÎ¶????∞Ïù¥?∞Ïóê ?ëÍ∑º?????ÜÏäµ?àÎã§.' };
            }
        }
        
        const allData = hrStore.store;
        console.log('[Main] hr-store-get-all: ?∏ÏÇ¨ ?ÑÏ≤¥ ?∞Ïù¥??Ï°∞Ìöå');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] hr-store-get-all ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC ?∏Îì§?? ???ïÎ≥¥ =====

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

// ===== IPC ?∏Îì§?? ?§Ïù¥?ºÎ°úÍ∑?=====

ipcMain.handle('show-message', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: options.type || 'info',
        title: options.title || '?åÎ¶º',
        message: options.message || '',
        detail: options.detail || '',
        buttons: options.buttons || ['?ïÏù∏']
    });
    return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || '?Ä??,
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
        title: options.title || '?¥Í∏∞',
        properties: options.properties || ['openFile'],
        filters: options.filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// ===== IPC ?∏Îì§?? ?åÏùº ?úÏä§??=====

ipcMain.handle('write-file', async (event, filePath, data) => {
    try {
        fs.writeFileSync(filePath, data, 'utf8');
        console.log('[Main] ?åÏùº ?Ä??', filePath);
        return { success: true };
    } catch (error) {
        console.error('[Main] ?åÏùº ?Ä???§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        console.log('[Main] ?åÏùº ?ΩÍ∏∞:', filePath);
        return { success: true, data: data };
    } catch (error) {
        console.error('[Main] ?åÏùº ?ΩÍ∏∞ ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('quit-app', () => {
    app.quit();
});

// ===== IPC ?∏Îì§?? Î∏åÎùº?∞Ï?Î°??¥Í∏∞ (?∏ÏáÑ) =====

ipcMain.handle('open-in-browser', async (event, htmlContent, filename = 'print_temp.html') => {
    try {
        const os = require('os');
        const { shell } = require('electron');
        
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, 'ot_print_' + Date.now() + '.html');
        
        fs.writeFileSync(tempFile, htmlContent, 'utf8');
        console.log('[Main] ?ÑÏãú ?åÏùº ?ùÏÑ±:', tempFile);
        
        tempFiles.push(tempFile);
        
        const result = await shell.openPath(tempFile);
        
        if (result) {
            console.error('[Main] Î∏åÎùº?∞Ï? ?¥Í∏∞ ?§Î•ò:', result);
            return { success: false, error: result };
        }
        
        console.log('[Main] Î∏åÎùº?∞Ï?Î°??¥Í∏∞ ?ÑÎ£å');
        return { success: true, path: tempFile };
    } catch (error) {
        console.error('[Main] Î∏åÎùº?∞Ï?Î°??¥Í∏∞ ?§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC ?∏Îì§?? .hrm ?îÌò∏??Î∞±ÏóÖ/Î≥µÏõê =====

/**
 * Î∞±ÏóÖ ?Ä??(.hrm ?îÌò∏??
 * ?åÎçî?¨Ïóê??JSON ?∞Ïù¥?∞Î? Î∞õÏïÑ ?îÌò∏?????åÏùºÎ°??Ä?? * @param {string} jsonData - Î∞±ÏóÖ??JSON Î¨∏Ïûê?? * @param {string} defaultFilename - Í∏∞Î≥∏ ?åÏùºÎ™? * @returns {Object} { success, filePath?, error? }
 */
ipcMain.handle('backup-save-hrm', async (event, jsonData, defaultFilename) => {
    try {
        // 1. ?Ä???§Ïù¥?ºÎ°úÍ∑??úÏãú
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Î∞±ÏóÖ ?åÏùº ?Ä??,
            defaultPath: defaultFilename || '?úÍ∞Ñ?∏Í∑ºÎ¨?Î∞±ÏóÖ.hrm',
            filters: [
                { name: '?úÍ∞Ñ?∏Í∑ºÎ¨?Î∞±ÏóÖ ?åÏùº', extensions: ['hrm'] },
                { name: 'Î™®Îì† ?åÏùº', extensions: ['*'] }
            ]
        });
        
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        
        // 2. ?∞Ïù¥???îÌò∏??        const encrypted = encryptBackup(jsonData);
        
        // 3. ?åÏùº ?Ä??        fs.writeFileSync(result.filePath, encrypted, 'utf8');
        console.log('[Main] .hrm Î∞±ÏóÖ ?Ä??', result.filePath);
        
        return { success: true, filePath: result.filePath };
        
    } catch (error) {
        console.error('[Main] .hrm Î∞±ÏóÖ ?Ä???§Î•ò:', error);
        return { success: false, error: error.message };
    }
});

/**
 * Î∞±ÏóÖ Î≥µÏõê (.hrm ?îÌò∏???êÎäî .json ?âÎ¨∏)
 * ?åÏùº ?¥Í∏∞ ?§Ïù¥?ºÎ°úÍ∑????åÏùº ?ΩÍ∏∞ ??Î≥µÌò∏???ÑÏöî ?? ??JSON Î∞òÌôò
 * @returns {Object} { success, data?, filePath?, fileType?, error? }
 */
ipcMain.handle('backup-load-hrm', async (event) => {
    try {
        // 1. ?¥Í∏∞ ?§Ïù¥?ºÎ°úÍ∑??úÏãú
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Î∞±ÏóÖ ?åÏùº ?¥Í∏∞',
            properties: ['openFile'],
            filters: [
                { name: 'Î∞±ÏóÖ ?åÏùº', extensions: ['hrm', 'json'] },
                { name: '?úÍ∞Ñ?∏Í∑ºÎ¨?Î∞±ÏóÖ ?åÏùº', extensions: ['hrm'] },
                { name: 'JSON ?åÏùº', extensions: ['json'] },
                { name: 'Î™®Îì† ?åÏùº', extensions: ['*'] }
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
        
        // 2. ?åÏùº ?ïÏãù ?êÎ≥Ñ Î∞?Ï≤òÎ¶¨
        if (ext === '.hrm' || fileContent.startsWith('OTHRM1')) {
            // .hrm ?îÌò∏???åÏùº ??Î≥µÌò∏??            const decrypted = decryptBackup(fileContent);
            jsonData = JSON.parse(decrypted);
            fileType = 'hrm';
            console.log('[Main] .hrm Î∞±ÏóÖ Î≥µÏõê:', filePath);
        } else {
            // .json ?âÎ¨∏ ?åÏùº (?òÏúÑ ?∏Ìôò)
            jsonData = JSON.parse(fileContent);
            fileType = 'json';
            console.log('[Main] .json Î∞±ÏóÖ Î≥µÏõê (?àÍ±∞??:', filePath);
        }
        
        return { success: true, data: jsonData, filePath, fileType };
        
    } catch (error) {
        console.error('[Main] Î∞±ÏóÖ Î≥µÏõê ?§Î•ò:', error);
        
        // Î≥µÌò∏???§Ìå® ??ÏπúÏ†à???§Î•ò Î©îÏãúÏßÄ
        if (error.message.includes('?†Ìö®?òÏ? ?äÏ?') || error.message.includes('?îÌò∏??) || 
            error.message.includes('bad decrypt') || error.message.includes('wrong final block')) {
            return { success: false, error: 'Î∞±ÏóÖ ?åÏùº???êÏÉÅ?òÏóàÍ±∞ÎÇò ?§Î•∏ ?úÏä§?úÏóê???ùÏÑ±???åÏùº?ÖÎãà??' };
        }
        
        return { success: false, error: error.message };
    }
});

// ===== ?êÎü¨ ?∏Îì§Îß?=====

process.on('uncaughtException', (error) => {
    console.error('[Main] ?àÏô∏ Î∞úÏÉù:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Promise Í±∞Î?:', reason);
});

console.log('[Main] main.js Î°úÎìú ?ÑÎ£å (v1.2.0)');
