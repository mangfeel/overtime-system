/**
 * main.js - Electron 메인 프로세스
 * 
 * 시간외근무관리 데스크톱 앱의 메인 프로세스
 * - 앱 윈도우 생성 및 관리
 * - IPC 통신 핸들러
 * - electron-store 기반 자체 데이터 저장
 * - 인사관리 앱 데이터 읽기 전용 접근
 * - 자동 업데이트
 * - .hrm 암호화 백업/복원
 * - 인사관리 앱 라이선스 검증 (v1.2.0)
 * 
 * @version 1.2.0
 * @since 2026-02-05
 * 
 * [변경 이력]
 * v1.2.0 (2026-02-06) - 라이선스 검증 시스템 추가
 *   - check-hr-license IPC 핸들러: 인사앱 electron-store에서 라이선스 확인
 *   - 라이선스 만료일 검증
 *   - 캐시 유효 시간(24시간) 검증
 * 
 * v1.1.0 (2026-02-05) - .hrm 암호화 백업 도입
 *   - AES-256-CBC 암호화 백업/복원 IPC 핸들러 추가
 *   - backup-save-hrm: 데이터 암호화 → 저장 다이얼로그 → .hrm 파일 저장
 *   - backup-load-hrm: 열기 다이얼로그 → .hrm/.json 파일 읽기 → 복호화
 *   - .json 하위 호환 (복원 시 .json 평문 파일도 지원)
 * 
 * v1.0.0 (2026-02-05) - 초기 릴리즈
 *   - Phase 1: Electron 프로젝트 초기화
 *   - electron-store 기반 자체 데이터 저장
 *   - 인사관리 앱 electron-store 읽기 전용 접근
 *   - 인사앱 설치 확인 및 라이선스 검증
 *   - 자동 업데이트 (GitHub Release 기반)
 *   - 다이얼로그, 파일 시스템, 인쇄 IPC 핸들러
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ===== electron-store 설정 =====

const Store = require('electron-store');

/**
 * 자체 데이터 저장소 (시간외근무 데이터)
 * 데이터는 C:\Users\사용자\AppData\Roaming\overtime-system\overtime-data.json 에 저장됨
 */
const store = new Store({
    name: 'overtime-data',
    encryptionKey: 'overtime-system-encryption-key-2026',
    defaults: {
        // 시간외근무 기록
        hr_overtime_daily: {},
        // 근태 기록
        hr_attendance_records: {},
        // 공휴일 설정
        hr_overtime_holidays: null,
        // 시간외 유형 설정
        hr_overtime_settings: null,
        // 주/월 제한 설정
        hr_overtime_limits: null
    }
});

console.log('[Main] 자체 store 경로:', store.path);

/**
 * 인사관리 앱 데이터 읽기 전용 저장소
 * 경로: C:\Users\사용자\AppData\Roaming\hr-system\hr-system-data.json
 * ⚠️ 읽기 전용 - 절대 쓰기 금지
 */
let hrStore = null;

/**
 * 인사관리 앱 store 초기화 (읽기 전용)
 * @returns {boolean} 초기화 성공 여부
 */
function initHRStore() {
    try {
        // 인사관리 앱 데이터 경로 확인
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        
        if (!fs.existsSync(hrDataFile)) {
            console.warn('[Main] 인사관리 앱 데이터 파일 없음:', hrDataFile);
            return false;
        }
        
        // 인사관리 앱과 동일한 설정으로 Store 열기 (읽기용)
        hrStore = new Store({
            name: 'hr-system-data',
            cwd: hrUserData,                    // 인사관리 앱 데이터 경로 지정
            encryptionKey: 'hr-system-encryption-key-2026',  // 동일 암호화 키
            watch: true                          // 파일 변경 감지
        });
        
        console.log('[Main] 인사관리 앱 store 연결 성공:', hrDataFile);
        return true;
        
    } catch (error) {
        console.error('[Main] 인사관리 앱 store 연결 실패:', error.message);
        hrStore = null;
        return false;
    }
}

// ===== 라이선스 검증 설정 (v1.2.0) =====

/** 라이선스 캐시 유효 시간 (시간) */
const LICENSE_CACHE_HOURS = 24;

/**
 * ★ v1.2.0: 인사관리 앱의 라이선스 정보 확인
 * electron-store에서 hr_license_info 키를 읽어 검증
 * @returns {Object} { valid, status, message, license? }
 */
function checkHRLicense() {
    try {
        // 1. hrStore 연결 확인
        if (!hrStore) {
            if (!initHRStore()) {
                return {
                    valid: false,
                    status: 'no_hr_app',
                    message: '인사관리 앱 데이터에 접근할 수 없습니다.'
                };
            }
        }
        
        // 2. electron-store에서 라이선스 정보 읽기
        const licenseInfo = hrStore.get('hr_license_info');
        
        if (!licenseInfo) {
            console.log('[Main] 인사앱 라이선스 정보 없음 (electron-store)');
            return {
                valid: false,
                status: 'not_found',
                message: '인사관리 시스템에 등록된 라이선스가 없습니다.\n인사관리 시스템에서 라이선스를 먼저 활성화하세요.'
            };
        }
        
        // 3. 유효성 확인
        if (!licenseInfo.valid) {
            return {
                valid: false,
                status: 'invalid',
                message: '인사관리 시스템의 라이선스가 유효하지 않습니다.',
                license: licenseInfo
            };
        }
        
        // 4. 만료일 확인
        if (licenseInfo.expire_date) {
            const expireDate = new Date(licenseInfo.expire_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (today > expireDate) {
                return {
                    valid: false,
                    status: 'expired',
                    message: `라이선스가 만료되었습니다. (만료일: ${licenseInfo.expire_date})\n인사관리 시스템에서 라이선스를 갱신하세요.`,
                    license: licenseInfo
                };
            }
        }
        
        // 5. 캐시 시간 확인 (24시간 이내 검증된 것인지)
        if (licenseInfo.cached_at) {
            const cachedTime = new Date(licenseInfo.cached_at).getTime();
            const now = Date.now();
            const hoursPassed = (now - cachedTime) / (1000 * 60 * 60);
            
            if (hoursPassed > LICENSE_CACHE_HOURS) {
                // 캐시 만료 - 하지만 만료일이 아직 남았으면 허용 (오프라인 대비)
                console.log('[Main] 라이선스 캐시 만료 (' + Math.round(hoursPassed) + '시간 경과), 만료일 기준 허용');
            }
        }
        
        // 6. 유효한 라이선스
        console.log('[Main] 라이선스 확인 성공:', {
            status: licenseInfo.status,
            plan: licenseInfo.plan_type,
            expire: licenseInfo.expire_date,
            days_remaining: licenseInfo.days_remaining
        });
        
        return {
            valid: true,
            status: 'active',
            message: '라이선스가 유효합니다.',
            license: {
                plan_type: licenseInfo.plan_type,
                expire_date: licenseInfo.expire_date,
                days_remaining: licenseInfo.days_remaining,
                cached_at: licenseInfo.cached_at
            }
        };
        
    } catch (error) {
        console.error('[Main] 라이선스 확인 오류:', error);
        return {
            valid: false,
            status: 'error',
            message: '라이선스 확인 중 오류가 발생했습니다: ' + error.message
        };
    }
}

// ===== .hrm 암호화 백업 설정 =====

/** 백업 파일 암호화 키 (AES-256-CBC) */
const BACKUP_ENCRYPTION_KEY = 'overtime-backup-encryption-2026';
const BACKUP_ALGORITHM = 'aes-256-cbc';

/**
 * 데이터 암호화 (AES-256-CBC)
 * @param {string} plainText - 암호화할 평문 (JSON 문자열)
 * @returns {string} 암호화된 문자열 (iv:encrypted 형식)
 */
function encryptBackup(plainText) {
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(BACKUP_ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // 헤더 + IV + 암호문 결합
    return 'OTHRM1' + iv.toString('hex') + ':' + encrypted;
}

/**
 * 데이터 복호화 (AES-256-CBC)
 * @param {string} encryptedText - 암호화된 문자열
 * @returns {string} 복호화된 평문 (JSON 문자열)
 * @throws {Error} 복호화 실패 시
 */
function decryptBackup(encryptedText) {
    // 헤더 확인
    if (!encryptedText.startsWith('OTHRM1')) {
        throw new Error('유효하지 않은 .hrm 파일 형식입니다.');
    }
    const data = encryptedText.substring(6); // 'OTHRM1' 제거
    const key = crypto.scryptSync(BACKUP_ENCRYPTION_KEY, 'overtime-salt', 32);
    const separatorIndex = data.indexOf(':');
    if (separatorIndex === -1) {
        throw new Error('암호화 데이터 구조가 올바르지 않습니다.');
    }
    const iv = Buffer.from(data.substring(0, separatorIndex), 'hex');
    const encrypted = data.substring(separatorIndex + 1);
    const decipher = crypto.createDecipheriv(BACKUP_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ===== 자동 업데이트 설정 =====

const { autoUpdater } = require('electron-updater');

// 업데이트 로그 설정
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// 자동 다운로드 비활성화 (사용자 확인 후 다운로드)
autoUpdater.autoDownload = false;

// 자동 설치 비활성화 (사용자 확인 후 설치)
autoUpdater.autoInstallOnAppQuit = true;

// ===== 전역 변수 =====

/** @type {BrowserWindow} 메인 윈도우 */
let mainWindow = null;

/** @type {BrowserWindow} 업데이트 진행률 윈도우 */
let progressWindow = null;

/** @type {boolean} 개발 모드 여부 */
const isDev = !app.isPackaged;

/** @type {Object} 업데이트 정보 */
let updateInfo = null;

/** @type {string[]} 임시 파일 경로 목록 (앱 종료 시 삭제) */
let tempFiles = [];

// ===== 윈도우 생성 =====

/**
 * 메인 윈도우 생성
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        title: '시간외근무관리',
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

    // 메인 페이지 로드 (로그인 없이 바로 진입)
    mainWindow.loadFile('메인_시간외.html');

    // 준비 완료 후 표시
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
        
        // 프로덕션 모드에서만 업데이트 확인
        if (!isDev) {
            setTimeout(() => {
                checkForUpdates();
            }, 3000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 외부 링크 보안
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    console.log('[Main] 윈도우 생성 완료');
}

// ===== 자동 업데이트 함수 =====

/**
 * 업데이트 진행률 윈도우 생성
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
        <div class="title">🔄 업데이트 다운로드 중...</div>
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
    
    console.log('[Updater] 진행률 윈도우 생성');
}

/**
 * 업데이트 진행률 윈도우 닫기
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
 * 업데이트 확인
 */
function checkForUpdates() {
    console.log('[Updater] 업데이트 확인 시작...');
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] 업데이트 확인 오류:', err);
    });
}

/**
 * 렌더러에 업데이트 상태 전송
 */
function sendUpdateStatus(status, data = null) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', { status, data });
    }
}

// 업데이트 이벤트 핸들러
autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 업데이트 확인 중...');
    sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 업데이트 발견:', info.version);
    updateInfo = info;
    sendUpdateStatus('available', info);
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '업데이트 알림',
        message: `새 버전이 있습니다! (v${info.version})`,
        detail: '지금 다운로드하시겠습니까?',
        buttons: ['다운로드', '나중에'],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            createProgressWindow();
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] 최신 버전입니다:', info.version);
    sendUpdateStatus('not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    const mbDownloaded = (progress.transferred / 1024 / 1024).toFixed(1);
    const mbTotal = (progress.total / 1024 / 1024).toFixed(1);
    
    console.log(`[Updater] 다운로드 진행: ${percent}%`);
    sendUpdateStatus('downloading', { percent, mbDownloaded, mbTotal });
    
    // 작업표시줄 진행률
    if (mainWindow) {
        mainWindow.setProgressBar(progress.percent / 100);
    }
    
    // 진행률 윈도우 업데이트
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.webContents.send('update-progress', { percent, mbDownloaded, mbTotal });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] 다운로드 완료:', info.version);
    sendUpdateStatus('downloaded', info);
    closeProgressWindow();
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '업데이트 준비 완료',
        message: `v${info.version} 다운로드가 완료되었습니다.`,
        detail: '지금 재시작하여 업데이트를 적용하시겠습니까?',
        buttons: ['재시작', '나중에'],
        defaultId: 0
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

autoUpdater.on('error', (error) => {
    console.error('[Updater] 오류:', error);
    sendUpdateStatus('error', { message: error.message });
    closeProgressWindow();
});

// ===== 앱 라이프사이클 =====

app.whenReady().then(() => {
    // 인사관리 앱 store 연결 시도
    initHRStore();
    
    // 윈도우 생성
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

// 앱 종료 전 임시 파일 정리
app.on('before-quit', () => {
    console.log('[Main] 앱 종료 - 임시 파일 정리 시작');
    
    tempFiles.forEach(filePath => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('[Main] 임시 파일 삭제:', filePath);
            }
        } catch (err) {
            console.warn('[Main] 임시 파일 삭제 실패:', filePath, err.message);
        }
    });
    
    tempFiles = [];
    console.log('[Main] 임시 파일 정리 완료');
});

// ===== IPC 핸들러: 자동 업데이트 =====

ipcMain.handle('check-for-updates', () => {
    if (isDev) {
        return { success: false, message: '개발 모드에서는 업데이트를 확인할 수 없습니다.' };
    }
    checkForUpdates();
    return { success: true, message: '업데이트 확인 중...' };
});

ipcMain.handle('download-update', () => {
    if (updateInfo) {
        autoUpdater.downloadUpdate();
        return { success: true };
    }
    return { success: false, message: '다운로드할 업데이트가 없습니다.' };
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

// ===== IPC 핸들러: 자체 데이터 저장 (electron-store) =====

ipcMain.handle('store-set', (event, key, value) => {
    try {
        store.set(key, value);
        console.log('[Main] store-set:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-set 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get', (event, key) => {
    try {
        const value = store.get(key);
        console.log('[Main] store-get:', key, value ? '(데이터 있음)' : '(데이터 없음)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] store-get 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-delete', (event, key) => {
    try {
        store.delete(key);
        console.log('[Main] store-delete:', key);
        return { success: true };
    } catch (error) {
        console.error('[Main] store-delete 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-get-all', (event) => {
    try {
        const allData = store.store;
        console.log('[Main] store-get-all: 전체 데이터 조회');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] store-get-all 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('store-clear', (event) => {
    try {
        store.clear();
        console.log('[Main] store-clear: 전체 데이터 초기화');
        return { success: true };
    } catch (error) {
        console.error('[Main] store-clear 오류:', error);
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

// ===== IPC 핸들러: 인사관리 앱 데이터 읽기 (읽기 전용) =====

/**
 * 인사관리 앱 설치 확인
 * @returns {Object} { installed, dataPath, hasData }
 */
ipcMain.handle('check-hr-app', () => {
    try {
        const hrUserData = path.join(app.getPath('appData'), 'hr-system');
        const hrDataFile = path.join(hrUserData, 'hr-system-data.json');
        const installed = fs.existsSync(hrDataFile);
        
        // store 미초기화 시 재시도
        if (installed && !hrStore) {
            initHRStore();
        }
        
        let hasData = false;
        if (hrStore) {
            try {
                const dbData = hrStore.get('hr_system_v25_db');
                hasData = dbData && dbData.employees && dbData.employees.length > 0;
            } catch (e) {
                console.warn('[Main] HR 데이터 확인 실패:', e.message);
            }
        }
        
        console.log('[Main] 인사앱 확인:', { installed, hasData });
        return { 
            success: true, 
            installed, 
            dataPath: hrDataFile,
            hasData 
        };
    } catch (error) {
        console.error('[Main] 인사앱 확인 오류:', error);
        return { success: false, installed: false, hasData: false, error: error.message };
    }
});

/**
 * ★ v1.2.0: 인사관리 앱 라이선스 확인
 * HR 앱의 electron-store에서 라이선스 정보를 읽어 검증
 * @returns {Object} { valid, status, message, license? }
 */
ipcMain.handle('check-hr-license', () => {
    return checkHRLicense();
});

/**
 * 인사관리 앱 데이터 읽기 (읽기 전용)
 * @param {string} key - 읽을 데이터 키
 * @returns {Object} { success, data }
 */
ipcMain.handle('hr-store-get', (event, key) => {
    try {
        if (!hrStore) {
            // 재초기화 시도
            if (!initHRStore()) {
                return { success: false, error: '인사관리 앱 데이터에 접근할 수 없습니다.' };
            }
        }
        
        const value = hrStore.get(key);
        console.log('[Main] hr-store-get:', key, value ? '(데이터 있음)' : '(데이터 없음)');
        return { success: true, data: value };
    } catch (error) {
        console.error('[Main] hr-store-get 오류:', error);
        return { success: false, error: error.message };
    }
});

/**
 * 인사관리 앱 전체 데이터 읽기 (읽기 전용)
 */
ipcMain.handle('hr-store-get-all', (event) => {
    try {
        if (!hrStore) {
            if (!initHRStore()) {
                return { success: false, error: '인사관리 앱 데이터에 접근할 수 없습니다.' };
            }
        }
        
        const allData = hrStore.store;
        console.log('[Main] hr-store-get-all: 인사 전체 데이터 조회');
        return { success: true, data: allData };
    } catch (error) {
        console.error('[Main] hr-store-get-all 오류:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC 핸들러: 앱 정보 =====

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

// ===== IPC 핸들러: 다이얼로그 =====

ipcMain.handle('show-message', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: options.type || 'info',
        title: options.title || '알림',
        message: options.message || '',
        detail: options.detail || '',
        buttons: options.buttons || ['확인']
    });
    return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || '저장',
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
        title: options.title || '열기',
        properties: options.properties || ['openFile'],
        filters: options.filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// ===== IPC 핸들러: 파일 시스템 =====

ipcMain.handle('write-file', async (event, filePath, data) => {
    try {
        fs.writeFileSync(filePath, data, 'utf8');
        console.log('[Main] 파일 저장:', filePath);
        return { success: true };
    } catch (error) {
        console.error('[Main] 파일 저장 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        console.log('[Main] 파일 읽기:', filePath);
        return { success: true, data: data };
    } catch (error) {
        console.error('[Main] 파일 읽기 오류:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('quit-app', () => {
    app.quit();
});

// ===== IPC 핸들러: 브라우저로 열기 (인쇄) =====

ipcMain.handle('open-in-browser', async (event, htmlContent, filename = 'print_temp.html') => {
    try {
        const os = require('os');
        const { shell } = require('electron');
        
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, 'ot_print_' + Date.now() + '.html');
        
        fs.writeFileSync(tempFile, htmlContent, 'utf8');
        console.log('[Main] 임시 파일 생성:', tempFile);
        
        tempFiles.push(tempFile);
        
        const result = await shell.openPath(tempFile);
        
        if (result) {
            console.error('[Main] 브라우저 열기 오류:', result);
            return { success: false, error: result };
        }
        
        console.log('[Main] 브라우저로 열기 완료');
        return { success: true, path: tempFile };
    } catch (error) {
        console.error('[Main] 브라우저로 열기 오류:', error);
        return { success: false, error: error.message };
    }
});

// ===== IPC 핸들러: .hrm 암호화 백업/복원 =====

/**
 * 백업 저장 (.hrm 암호화)
 * 렌더러에서 JSON 데이터를 받아 암호화 후 파일로 저장
 * @param {string} jsonData - 백업할 JSON 문자열
 * @param {string} defaultFilename - 기본 파일명
 * @returns {Object} { success, filePath?, error? }
 */
ipcMain.handle('backup-save-hrm', async (event, jsonData, defaultFilename) => {
    try {
        // 1. 저장 다이얼로그 표시
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '백업 파일 저장',
            defaultPath: defaultFilename || '시간외근무_백업.hrm',
            filters: [
                { name: '시간외근무 백업 파일', extensions: ['hrm'] },
                { name: '모든 파일', extensions: ['*'] }
            ]
        });
        
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        
        // 2. 데이터 암호화
        const encrypted = encryptBackup(jsonData);
        
        // 3. 파일 저장
        fs.writeFileSync(result.filePath, encrypted, 'utf8');
        console.log('[Main] .hrm 백업 저장:', result.filePath);
        
        return { success: true, filePath: result.filePath };
        
    } catch (error) {
        console.error('[Main] .hrm 백업 저장 오류:', error);
        return { success: false, error: error.message };
    }
});

/**
 * 백업 복원 (.hrm 암호화 또는 .json 평문)
 * 파일 열기 다이얼로그 → 파일 읽기 → 복호화(필요 시) → JSON 반환
 * @returns {Object} { success, data?, filePath?, fileType?, error? }
 */
ipcMain.handle('backup-load-hrm', async (event) => {
    try {
        // 1. 열기 다이얼로그 표시
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '백업 파일 열기',
            properties: ['openFile'],
            filters: [
                { name: '백업 파일', extensions: ['hrm', 'json'] },
                { name: '시간외근무 백업 파일', extensions: ['hrm'] },
                { name: 'JSON 파일', extensions: ['json'] },
                { name: '모든 파일', extensions: ['*'] }
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
        
        // 2. 파일 형식 판별 및 처리
        if (ext === '.hrm' || fileContent.startsWith('OTHRM1')) {
            // .hrm 암호화 파일 → 복호화
            const decrypted = decryptBackup(fileContent);
            jsonData = JSON.parse(decrypted);
            fileType = 'hrm';
            console.log('[Main] .hrm 백업 복원:', filePath);
        } else {
            // .json 평문 파일 (하위 호환)
            jsonData = JSON.parse(fileContent);
            fileType = 'json';
            console.log('[Main] .json 백업 복원 (레거시):', filePath);
        }
        
        return { success: true, data: jsonData, filePath, fileType };
        
    } catch (error) {
        console.error('[Main] 백업 복원 오류:', error);
        
        // 복호화 실패 시 친절한 오류 메시지
        if (error.message.includes('유효하지 않은') || error.message.includes('암호화') || 
            error.message.includes('bad decrypt') || error.message.includes('wrong final block')) {
            return { success: false, error: '백업 파일이 손상되었거나 다른 시스템에서 생성된 파일입니다.' };
        }
        
        return { success: false, error: error.message };
    }
});

// ===== 에러 핸들링 =====

process.on('uncaughtException', (error) => {
    console.error('[Main] 예외 발생:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Promise 거부:', reason);
});

console.log('[Main] main.js 로드 완료 (v1.2.0)');
