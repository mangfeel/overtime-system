/**
 * 탭관리_시간외.js - UI 공통 관리
 * 
 * 탭 전환, 날짜 선택기 초기화, 키보드 단축키,
 * 부서 체크박스 필터 (보고서/월별 집계 공통)
 * 
 * @version 1.0.1
 * @since 2026-02-05
 * 
 * [변경이력]
 * v1.0.1 - employees → window.employees 전역 참조 통일 (모듈 간 접근 문제 해결)
 */

// ===== 전역 변수 =====
let currentActiveTab = 'attendance';  // 현재 활성 탭 ID

// ===== 탭 전환 =====
function switchTab(tabId) {
    currentActiveTab = tabId;
    
    // 버튼 상태
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 탭 콘텐츠 전환
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById('tab-' + tabId).classList.add('active');
}

// ===== 날짜 선택기 초기화 =====
function initDateSelectors() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const today = new Date();
    
    const START_YEAR = 2025;
    const END_YEAR = 2044;
    
    // 연도 선택
    const yearSelects = ['monthlyYear', 'reportYear', 'attendanceYear', 'monthlyPayOverYear'];
    yearSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '';
            for (let y = START_YEAR; y <= END_YEAR; y++) {
                const option = document.createElement('option');
                option.value = y;
                option.textContent = y + '년';
                if (y === Math.max(currentYear, START_YEAR)) option.selected = true;
                select.appendChild(option);
            }
        }
    });
    
    // 월 선택
    const monthSelects = ['monthlyMonth', 'reportMonth', 'attendanceMonth', 'monthlyPayOverMonth'];
    monthSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '';
            for (let m = 1; m <= 12; m++) {
                const option = document.createElement('option');
                option.value = m;
                option.textContent = m + '월';
                if (m === currentMonth) option.selected = true;
                select.appendChild(option);
            }
        }
    });
    
    // 일괄 입력 날짜 (오늘)
    const bulkDateInput = document.getElementById('bulkInputDate');
    if (bulkDateInput) {
        const todayStr = today.getFullYear() + '-' + 
                        String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(today.getDate()).padStart(2, '0');
        bulkDateInput.value = todayStr;
        
        // 일괄입력 모듈이 로드된 후에 호출될 수 있으므로 체크
        if (typeof onBulkDateChange === 'function') {
            onBulkDateChange();
        }
    }
}

// ===== 키보드 단축키 =====
function handleKeyboardShortcuts(e) {
    const tagName = e.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        if (!(e.ctrlKey && e.key === 's')) {
            return;
        }
    }
    
    // Ctrl+S: 저장
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        
        if (currentActiveTab === 'attendance' && typeof parseAndSaveAttendance === 'function') {
            parseAndSaveAttendance();
        } else if (currentActiveTab === 'daily' && typeof saveBulkInput === 'function') {
            saveBulkInput();
        }
        return;
    }
    
    // Ctrl+V: 붙여넣기 (일별입력 탭)
    if (e.ctrlKey && e.key === 'v') {
        if (tagName === 'input' || tagName === 'textarea') {
            return;
        }
        
        if (currentActiveTab === 'daily' && 
            typeof copiedBulkSettings !== 'undefined' && copiedBulkSettings && 
            typeof bulkSelectedRows !== 'undefined' && bulkSelectedRows.size > 0 &&
            typeof pasteToSelected === 'function') {
            e.preventDefault();
            pasteToSelected();
        }
        return;
    }
}

// ===== 헤더 정보 업데이트 =====
function updateHeaderInfo() {
    const now = new Date();
    const dateStr = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
    const el = document.getElementById('headerDate');
    if (el) el.textContent = dateStr;
    
    // 직원 수 표시 (window.employees 사용 — 모든 모듈에서 공유)
    const empCountEl = document.getElementById('headerEmployeeCount');
    if (empCountEl) {
        const count = (window.employees || []).length;
        empCountEl.textContent = `직원 ${count}명`;
    }
}

// ===== 부서 체크박스 (보고서) =====

function initReportDeptCheckboxes(depts) {
    const container = document.getElementById('reportDeptCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    depts.forEach(dept => {
        const label = document.createElement('label');
        label.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:3px;';
        label.innerHTML = `
            <input type="checkbox" class="report-dept-checkbox" value="${dept}" checked onchange="updateReportDeptAll()">
            ${dept}
        `;
        container.appendChild(label);
    });
}

function toggleAllReportDepts(checked) {
    document.querySelectorAll('.report-dept-checkbox').forEach(cb => cb.checked = checked);
}

function updateReportDeptAll() {
    const checkboxes = document.querySelectorAll('.report-dept-checkbox');
    const allCheckbox = document.getElementById('reportDeptAll');
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    
    allCheckbox.checked = allChecked;
    allCheckbox.indeterminate = !allChecked && someChecked;
}

function getSelectedReportDepts() {
    const checkboxes = document.querySelectorAll('.report-dept-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ===== 부서 체크박스 (월별 집계) =====

function initMonthlyDeptCheckboxes(depts) {
    const container = document.getElementById('monthlyDeptCheckboxes');
    if (!container) return;
    
    container.innerHTML = '';
    
    depts.forEach(dept => {
        const label = document.createElement('label');
        label.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:3px;';
        label.innerHTML = `
            <input type="checkbox" class="monthly-dept-checkbox" value="${dept}" checked onchange="updateMonthlyDeptAll()">
            ${dept}
        `;
        container.appendChild(label);
    });
}

function toggleAllMonthlyDepts(checked) {
    document.querySelectorAll('.monthly-dept-checkbox').forEach(cb => cb.checked = checked);
}

function updateMonthlyDeptAll() {
    const checkboxes = document.querySelectorAll('.monthly-dept-checkbox');
    const allCheckbox = document.getElementById('monthlyDeptAll');
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    
    allCheckbox.checked = allChecked;
    allCheckbox.indeterminate = !allChecked && someChecked;
}

function getSelectedMonthlyDepts() {
    const checkboxes = document.querySelectorAll('.monthly-dept-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ===== 부서 목록 추출 (직원 데이터에서) =====
function getDeptList() {
    const depts = new Set();
    (window.employees || []).forEach(emp => {
        const dept = emp.currentPosition?.dept || '';
        if (dept) depts.add(dept);
    });
    return [...depts].sort();
}

/**
 * 부서 체크박스 초기화 (탭 진입 시 호출)
 */
function initAllDeptCheckboxes() {
    const depts = getDeptList();
    initReportDeptCheckboxes(depts);
    initMonthlyDeptCheckboxes(depts);
}

console.log('[탭관리] 탭관리_시간외.js 로드 완료');
