/**
 * 초기화_시간외.js - 앱 초기화 및 부팅 시퀀스
 * 
 * @version 1.0.2
 * @since 2026-02-05
 * 
 * [변경이력]
 * v1.0.2 - let employees → window.employees 전역 공유 수정 (모듈 간 접근 문제 해결)
 * v1.0.1 - initOvertimeCalendar() 호출 추가
 * 
 * [의존성] 데이터베이스_시간외.js, 공휴일_시간외.js, 설정_시간외.js
 * [의존성] 급여계산_시간외.js, 탭관리_시간외.js, 주월간현황_시간외.js
 */

// ===== 전역 상태 =====

/** 인사관리 앱 연결 상태 */
let hrConnected = false;

/** 직원 목록 (인사앱에서 읽어온 재직자) - window에 등록하여 모든 모듈에서 접근 가능 */
window.employees = [];

// ===== 앱 부팅 시퀀스 =====

async function initApp() {
    console.log('[초기화] 시간외근무관리 앱 시작...');
    
    try {
        // 1. 앱 버전 표시
        await displayAppVersion();
        
        // 2. 인사관리 앱 연결 확인
        const connected = await checkHRConnection();
        
        if (!connected) {
            showBlockScreen('인사관리 시스템 연결 필요', 
                '인사관리 시스템이 설치되지 않았거나 직원 데이터가 없습니다.');
            return;
        }
        
        // 3. 직원 데이터 로드
        await loadEmployees();
        
        // 4. 급여 캐시 초기화 (HR 급여 데이터 메모리 로드)
        await initSalaryCache();
        
        // 5. 공휴일 캐시 로드
        await loadVariableHolidays();
        
        // 6. 설정 로드
        await loadOvertimeTypeSettings();
        await loadLimitSettings();
        
        // 7. 조직명 표시
        await displayOrgName();
        
        // 8. UI 초기화
        updateHeaderInfo();           // 헤더 날짜 + 직원 수
        initDateSelectors();          // 연도/월 선택기
        initOvertimeCalendar();       // 시간외근무 달력 초기화
        initWeeklyReport();           // 주간현황 초기화
        initAllDeptCheckboxes();      // 부서 체크박스
        
        // 9. 시스템 정보 표시 (설정 탭)
        await displaySystemInfo();
        
        // 10. 키보드 단축키 설정
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
        console.log('[초기화] 앱 초기화 완료 ✅');
        
    } catch (error) {
        console.error('[초기화] 앱 초기화 오류:', error);
        showBlockScreen('초기화 오류', '앱 초기화 중 오류가 발생했습니다: ' + error.message);
    }
}

// ===== 인사관리 앱 연결 =====

async function checkHRConnection() {
    try {
        if (typeof window.electronAPI === 'undefined') {
            console.warn('[초기화] Electron 환경이 아닙니다 (개발 모드?)');
            hrConnected = true;
            updateHRStatus(true);
            return true;
        }
        
        const result = await window.electronAPI.checkHRApp();
        
        if (!result.success || !result.installed) {
            console.warn('[초기화] 인사관리 앱 미설치');
            hrConnected = false;
            updateHRStatus(false);
            return false;
        }
        
        const available = await HRData.isAvailable();
        
        if (!available) {
            console.warn('[초기화] 인사관리 앱 데이터 접근 불가');
            hrConnected = false;
            updateHRStatus(false);
            return false;
        }
        
        console.log('[초기화] 인사관리 앱 연결 성공 ✅');
        hrConnected = true;
        updateHRStatus(true);
        return true;
        
    } catch (error) {
        console.error('[초기화] 인사앱 연결 확인 오류:', error);
        hrConnected = false;
        updateHRStatus(false);
        return false;
    }
}

function updateHRStatus(connected) {
    const statusEl = document.getElementById('hrStatus');
    if (!statusEl) return;
    
    if (connected) {
        statusEl.innerHTML = '<span class="status-dot connected"></span> 인사앱 연결됨';
    } else {
        statusEl.innerHTML = '<span class="status-dot disconnected"></span> 인사앱 미연결';
    }
}

async function retryConnection() {
    const connected = await checkHRConnection();
    
    if (connected) {
        document.getElementById('blockScreen').style.display = 'none';
        
        await loadEmployees();
        await initSalaryCache();
        await loadVariableHolidays();
        await loadOvertimeTypeSettings();
        await loadLimitSettings();
        await displayOrgName();
        
        updateHeaderInfo();
        initDateSelectors();
        initOvertimeCalendar();
        initWeeklyReport();
        initAllDeptCheckboxes();
        
        await displaySystemInfo();
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
        console.log('[초기화] 재연결 성공 ✅');
    } else {
        alert('인사관리 시스템에 연결할 수 없습니다.\n인사관리 시스템을 설치하고 실행해주세요.');
    }
}

// ===== 차단 화면 =====

function showBlockScreen(title, message) {
    const blockScreen = document.getElementById('blockScreen');
    const blockTitle = document.getElementById('blockTitle');
    const blockMessage = document.getElementById('blockMessage');
    
    if (blockTitle) blockTitle.textContent = title;
    if (blockMessage) blockMessage.textContent = message;
    if (blockScreen) blockScreen.style.display = 'flex';
}

// ===== 직원 데이터 =====

async function loadEmployees() {
    try {
        window.employees = await HRData.getActiveEmployees();
        console.log(`[초기화] 직원 로드 완료: 재직자 ${window.employees.length}명`);
    } catch (error) {
        console.error('[초기화] 직원 데이터 로드 오류:', error);
        window.employees = [];
    }
}

async function displayOrgName() {
    try {
        const orgName = await HRData.getOrgName();
        const orgNameEl = document.getElementById('orgName');
        if (orgNameEl) {
            orgNameEl.textContent = orgName;
        }
    } catch (error) {
        console.warn('[초기화] 조직명 로드 실패:', error);
    }
}

// ===== 앱 정보 =====

async function displayAppVersion() {
    try {
        if (typeof window.electronAPI === 'undefined') {
            const el = document.getElementById('appVersion');
            if (el) el.textContent = 'v개발모드';
            return;
        }
        
        const versionInfo = await window.electronAPI.getAppVersion();
        const versionEl = document.getElementById('appVersion');
        if (versionEl) {
            versionEl.textContent = `v${versionInfo.version}${versionInfo.isDev ? ' (DEV)' : ''}`;
        }
    } catch (error) {
        console.warn('[초기화] 버전 정보 로드 실패:', error);
    }
}

async function displaySystemInfo() {
    // 설정 탭 UI 렌더링
    if (typeof renderOvertimeTypeSettings === 'function') {
        await renderOvertimeTypeSettings();
    }
    if (typeof initHolidayYearSelector === 'function') {
        initHolidayYearSelector();
    }
    
    const container = document.getElementById('systemInfo');
    if (!container) return;
    
    try {
        const empList = window.employees || [];
        const salaryTables = _salaryCache?.tables || {};
        const salaryYears = Object.keys(salaryTables).sort().reverse();
        const positionAllowances = _salaryCache?.positions || {};
        const allowanceYears = Object.keys(positionAllowances).sort().reverse();
        
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">
                <div class="stat-card">
                    <div class="stat-card-title">등록 직원 수</div>
                    <div class="stat-card-value">${empList.length}명</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">급여표 연도</div>
                    <div class="stat-card-value">${salaryYears.length > 0 ? salaryYears[0] + '년' : '없음'}</div>
                    <div class="stat-card-sub">${salaryYears.length}개 연도</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">직책수당 연도</div>
                    <div class="stat-card-value">${allowanceYears.length > 0 ? allowanceYears[0] + '년' : '없음'}</div>
                    <div class="stat-card-sub">${allowanceYears.length}개 연도</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-title">시스템 버전</div>
                    <div class="stat-card-value">v1.0</div>
                    <div class="stat-card-sub">데스크톱 앱</div>
                </div>
            </div>
            
            <div class="alert alert-warning" style="margin-top:15px;">
                <span>⚠️</span>
                <span>급여표/직책수당 설정은 원본 인사관리시스템에서 변경해주세요. 이 시스템은 읽기 전용입니다.</span>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `
            <div class="alert alert-error">
                <span>❌</span>
                <span>시스템 정보를 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

// ===== DOMContentLoaded =====

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
