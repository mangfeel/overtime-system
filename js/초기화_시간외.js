/**
 * 초기화_시간외.js - 앱 초기화 및 부팅 시퀀스
 * 
 * @version 1.1.0
 * @since 2026-02-05
 * 
 * [변경이력]
 * v1.1.0 - 라이선스 검증 단계 추가 (2026-02-06)
 *   - initApp() 부팅 시퀀스에 라이선스 확인 단계 삽입 (HR 연결 후, 데이터 로드 전)
 *   - checkLicense(): hrStore.checkLicense() API로 인사앱 라이선스 검증
 *   - 라이선스 없음/만료/오류 시 차단 화면 표시
 *   - 만료 임박(7일 이내) 시 경고 알림
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
        
        // ★ 2.5. 라이선스 검증 (v1.1.0 추가)
        const licenseValid = await checkLicense();
        
        if (!licenseValid) {
            return;  // 차단 화면이 이미 표시됨
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

// ===== 라이선스 검증 (v1.1.0) =====

/**
 * ★ v1.1.0: 인사관리 앱 라이선스 확인
 * hrStore.checkLicense() API를 통해 메인 프로세스에서 라이선스 검증
 * @returns {Promise<boolean>} 라이선스 유효 여부
 */
async function checkLicense() {
    try {
        // 개발 모드 (Electron 미연결) 시 스킵
        if (typeof window.hrStore === 'undefined' || typeof window.hrStore.checkLicense !== 'function') {
            console.warn('[초기화] 라이선스 검증 스킵 (개발 모드)');
            return true;
        }
        
        console.log('[초기화] 라이선스 확인 중...');
        const result = await window.hrStore.checkLicense();
        
        if (!result.valid) {
            console.warn('[초기화] 라이선스 검증 실패:', result.status, result.message);
            
            // 상태별 차단 메시지
            let title = '라이선스 필요';
            let message = result.message || '유효한 라이선스가 없습니다.';
            
            switch (result.status) {
                case 'not_found':
                    title = '라이선스 미등록';
                    message = '인사관리 시스템에 등록된 라이선스가 없습니다.\n인사관리 시스템에서 라이선스를 먼저 활성화하세요.';
                    break;
                case 'expired':
                    title = '라이선스 만료';
                    message = result.message || '라이선스가 만료되었습니다.\n인사관리 시스템에서 라이선스를 갱신하세요.';
                    break;
                case 'invalid':
                    title = '라이선스 오류';
                    message = '인사관리 시스템의 라이선스가 유효하지 않습니다.';
                    break;
                case 'no_hr_app':
                    title = '인사관리 시스템 필요';
                    message = '인사관리 시스템 데이터에 접근할 수 없습니다.';
                    break;
                case 'error':
                    title = '라이선스 확인 오류';
                    break;
            }
            
            showBlockScreen(title, message);
            return false;
        }
        
        // 라이선스 유효
        console.log('[초기화] 라이선스 확인 성공 ✅', {
            plan: result.license?.plan_type,
            expire: result.license?.expire_date,
            days_remaining: result.license?.days_remaining
        });
        
        // 만료 임박 경고 (7일 이내)
        if (result.license?.days_remaining != null && result.license.days_remaining <= 7) {
            setTimeout(() => {
                alert(`⚠️ 라이선스가 ${result.license.days_remaining}일 후 만료됩니다.\n인사관리 시스템에서 라이선스를 갱신하세요.`);
            }, 2000);
        }
        
        return true;
        
    } catch (error) {
        console.error('[초기화] 라이선스 확인 오류:', error);
        // 라이선스 확인 자체가 실패해도 앱 사용 차단
        showBlockScreen('라이선스 확인 오류', 
            '라이선스를 확인할 수 없습니다.\n인사관리 시스템이 정상적으로 설치되어 있는지 확인하세요.');
        return false;
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
    
    if (!connected) {
        alert('인사관리 시스템에 연결할 수 없습니다.\n인사관리 시스템을 설치하고 실행해주세요.');
        return;
    }
    
    // ★ 재연결 시에도 라이선스 확인
    const licenseValid = await checkLicense();
    
    if (!licenseValid) {
        return;
    }
    
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
