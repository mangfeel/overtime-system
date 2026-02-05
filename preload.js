/**
 * preload.js - Electron 보안 브릿지
 * 
 * 렌더러 프로세스와 메인 프로세스 간의 안전한 통신을 위한 브릿지
 * - contextBridge를 통해 안전한 API만 노출
 * - Node.js 직접 접근 차단
 * - 인사관리 앱 데이터 읽기 전용 API 제공
 * - 인사관리 앱 라이선스 검증 API (v1.2.0)
 * 
 * @version 1.2.0
 * @since 2026-02-05
 * 
 * [변경 이력]
 * v1.2.0 (2026-02-06) - 라이선스 검증 API 추가
 *   - hrStore.checkLicense: 인사앱 라이선스 유효성 확인
 * 
 * v1.1.0 (2026-02-05) - .hrm 암호화 백업 API 추가
 *   - saveBackupHrm: 데이터를 암호화하여 .hrm 파일로 저장
 *   - loadBackupHrm: .hrm/.json 파일을 읽어 복호화 후 반환
 * 
 * v1.0.0 (2026-02-05) - 초기 릴리즈
 *   - electronAPI: 앱 기능 (업데이트, 다이얼로그, 파일, 인쇄)
 *   - electronStore: 자체 데이터 저장 (시간외근무/근태)
 *   - hrStore: 인사관리 앱 데이터 읽기 전용
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 렌더러에 노출할 안전한 API
 * window.electronAPI 로 접근 가능
 */
contextBridge.exposeInMainWorld('electronAPI', {
    
    // ===== 앱 정보 =====
    
    /**
     * 앱 정보 조회
     * @returns {Promise<Object>} { version, name, path, userData, storePath, hrStoreConnected, isDev }
     */
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    
    /**
     * 앱 버전 조회
     * @returns {Promise<Object>} { version, isDev }
     */
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // ===== 인사관리 앱 연동 =====
    
    /**
     * 인사관리 앱 설치 확인
     * @returns {Promise<Object>} { success, installed, dataPath, hasData }
     */
    checkHRApp: () => ipcRenderer.invoke('check-hr-app'),
    
    // ===== 자동 업데이트 =====
    
    /**
     * 업데이트 확인
     * @returns {Promise<Object>} { success, message? }
     */
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    
    /**
     * 업데이트 다운로드
     * @returns {Promise<Object>} { success, message? }
     */
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    
    /**
     * 업데이트 설치 (앱 재시작)
     */
    installUpdate: () => ipcRenderer.invoke('install-update'),
    
    /**
     * 업데이트 상태 이벤트 리스너
     * @param {Function} callback - 상태 변경 시 호출될 콜백
     */
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (event, info) => {
            callback(info);
        });
    },
    
    /**
     * 업데이트 상태 이벤트 리스너 제거
     */
    removeUpdateListeners: () => {
        ipcRenderer.removeAllListeners('update-status');
    },
    
    // ===== 다이얼로그 =====
    
    /**
     * 메시지 다이얼로그 표시
     * @param {Object} options - { type, title, message, detail, buttons }
     * @returns {Promise<Object>} { response, checkboxChecked }
     */
    showMessage: (options) => ipcRenderer.invoke('show-message', options),
    
    /**
     * 파일 저장 다이얼로그
     * @param {Object} options - { title, defaultPath, filters }
     * @returns {Promise<Object>} { canceled, filePath }
     */
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    
    /**
     * 파일 열기 다이얼로그
     * @param {Object} options - { title, properties, filters }
     * @returns {Promise<Object>} { canceled, filePaths }
     */
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    
    // ===== 파일 시스템 =====
    
    /**
     * 파일 쓰기
     * @param {string} filePath - 파일 경로
     * @param {string} data - 저장할 데이터
     * @returns {Promise<Object>} { success, error? }
     */
    writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
    
    /**
     * 파일 읽기
     * @param {string} filePath - 파일 경로
     * @returns {Promise<Object>} { success, data?, error? }
     */
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    
    // ===== 브라우저로 열기 =====
    
    /**
     * HTML 내용을 시스템 브라우저로 열기 (인쇄용)
     * @param {string} htmlContent - HTML 내용
     * @param {string} filename - 파일명
     * @returns {Promise<Object>} { success, path?, error? }
     */
    openInBrowser: (htmlContent, filename) => ipcRenderer.invoke('open-in-browser', htmlContent, filename),
    
    // ===== .hrm 암호화 백업/복원 =====
    
    /**
     * 백업 저장 (.hrm 암호화)
     * 네이티브 저장 다이얼로그 표시 → AES-256-CBC 암호화 → .hrm 파일 저장
     * @param {string} jsonData - 백업할 JSON 문자열
     * @param {string} defaultFilename - 기본 파일명 (예: '시간외근무_백업_20260205.hrm')
     * @returns {Promise<Object>} { success, filePath?, canceled?, error? }
     */
    saveBackupHrm: (jsonData, defaultFilename) => ipcRenderer.invoke('backup-save-hrm', jsonData, defaultFilename),
    
    /**
     * 백업 복원 (.hrm 암호화 또는 .json 평문)
     * 네이티브 열기 다이얼로그 표시 → 파일 읽기 → 복호화(필요 시) → JSON 반환
     * @returns {Promise<Object>} { success, data?, filePath?, fileType?, canceled?, error? }
     * - fileType: 'hrm' (암호화) 또는 'json' (레거시 평문)
     */
    loadBackupHrm: () => ipcRenderer.invoke('backup-load-hrm'),
    
    // ===== 앱 제어 =====
    
    /**
     * 앱 종료
     */
    quitApp: () => ipcRenderer.invoke('quit-app'),
    
    /**
     * Electron 환경 여부 확인
     * @returns {boolean}
     */
    isElectron: () => true
});

/**
 * 자체 데이터 저장소 API (시간외근무/근태 데이터)
 * window.electronStore 로 접근 가능
 * 
 * 저장 위치: %APPDATA%/overtime-system/overtime-data.json
 */
contextBridge.exposeInMainWorld('electronStore', {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    getAll: () => ipcRenderer.invoke('store-get-all'),
    clear: () => ipcRenderer.invoke('store-clear'),
    getPath: () => ipcRenderer.invoke('store-get-path')
});

/**
 * 인사관리 앱 데이터 읽기 전용 API
 * window.hrStore 로 접근 가능
 * 
 * ⚠️ 읽기 전용 - set/delete/clear 메서드 없음
 * 읽기 대상: %APPDATA%/hr-system/hr-system-data.json (암호화됨)
 */
contextBridge.exposeInMainWorld('hrStore', {
    /**
     * 인사관리 앱 데이터 읽기
     * @param {string} key - 데이터 키 (예: 'hr_system_v25_db', 'hr_salary_tables')
     * @returns {Promise<Object>} { success, data }
     * 
     * @example
     * // 직원 데이터 읽기
     * const result = await hrStore.get('hr_system_v25_db');
     * const employees = result.data?.employees || [];
     * 
     * // 급여표 읽기
     * const salaryResult = await hrStore.get('hr_salary_tables');
     * const tables = salaryResult.data;
     */
    get: (key) => ipcRenderer.invoke('hr-store-get', key),
    
    /**
     * 인사관리 앱 전체 데이터 읽기
     * @returns {Promise<Object>} { success, data }
     */
    getAll: () => ipcRenderer.invoke('hr-store-get-all'),
    
    /**
     * ★ v1.2.0: 인사관리 앱 라이선스 확인
     * @returns {Promise<Object>} { valid, status, message, license? }
     * 
     * @example
     * const result = await hrStore.checkLicense();
     * if (!result.valid) {
     *     // 차단 처리
     *     showBlockScreen('라이선스 필요', result.message);
     * }
     */
    checkLicense: () => ipcRenderer.invoke('check-hr-license')
});

/**
 * Electron 환경 확인용
 * window.isElectron 으로 접근 가능
 */
contextBridge.exposeInMainWorld('isElectron', true);

console.log('[Preload] preload.js 로드 완료 (v1.2.0)');
console.log('[Preload] electronAPI, electronStore, hrStore 노출됨');
console.log('[Preload] hrStore.checkLicense 추가됨 (라이선스 검증)');
