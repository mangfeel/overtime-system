/**
 * 일별입력_시간외.js
 * 시간외근무 일별 입력 모듈
 * - 날짜별 시간외근무 일괄 입력/수정/삭제
 * - 직원 검색/추가, 부서 필터
 * - 시간 검증 (1시간 단위, 21시 초과, 휴게시간 등)
 * - 복사/붙여넣기, 행 추가/삭제
 */

// ===== 일괄 입력 관련 변수 =====
let bulkInputData = [];           // 일괄 입력 데이터
let copiedBulkSettings = null;    // 복사된 시간외근무 설정
let bulkSelectedRows = new Set(); // 체크박스 선택 상태
let bulkAllEmployees = [];        // 전체 직원 목록
let bulkFilteredEmployees = [];   // 필터링된 직원 목록

// ===== 일괄 입력: 날짜 변경 =====
function onBulkDateChange() {
    const dateInput = document.getElementById('bulkInputDate');
    const dateInfo = document.getElementById('bulkDateInfo');
    
    if (!dateInput.value) {
        dateInfo.textContent = '';
        dateInfo.className = 'badge';
        return;
    }
    
    const date = new Date(dateInput.value);
    const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayName = dayNames[date.getDay()];
    
    // 공휴일 체크
    const holiday = checkHoliday(dateInput.value);
    
    if (holiday && holiday.isHoliday) {
        if (holiday.name === '토요일' || holiday.name === '일요일') {
            dateInfo.textContent = dayName;
            dateInfo.className = 'badge badge-holiday';
        } else {
            dateInfo.textContent = `${dayName} (${holiday.name})`;
            dateInfo.className = 'badge badge-holiday';
        }
    } else {
        dateInfo.textContent = dayName;
        dateInfo.className = 'badge badge-weekday';
    }
    
    // 기존 데이터 로드 (해당 날짜에 이미 등록된 기록)
    loadExistingBulkRecords();
    
    // 일괄 입력용 직원 목록 로드
    loadBulkEmployees();
}

// ===== 일괄 입력: 모드 전환 =====
function switchBulkInputMode() {
    const mode = document.querySelector('input[name="bulkInputMode"]:checked').value;
    
    // 모드 전환 시 현재 입력 데이터 초기화
    bulkInputData = [];
    
    if (mode === 'add') {
        document.getElementById('bulkModeAdd').style.display = 'block';
        document.getElementById('bulkModeAll').style.display = 'none';
    } else {
        document.getElementById('bulkModeAdd').style.display = 'none';
        document.getElementById('bulkModeAll').style.display = 'block';
    }
    
    // 해당 날짜에 저장된 기록만 로드
    loadExistingBulkRecords();
    
    // 테이블 갱신
    renderBulkInputTable();
}

// ===== 일괄 입력: 직원 목록 로드 =====
function loadBulkEmployees() {
    try {
        const allEmployees = window.employees || [];
        const dateValue = document.getElementById('bulkInputDate').value;
        
        if (!dateValue) return;
        
        // 해당 날짜 기준 재직자 필터링 및 발령 정보 조회
        const activeEmployees = allEmployees.filter(emp => {
            const entryDate = emp.employment?.entryDate || '';
            const retireDate = emp.employment?.retirementDate || '';
            
            if (!entryDate || entryDate > dateValue) return false;
            if (retireDate && retireDate < dateValue) return false;
            
            return true;
        }).map(emp => {
            // 해당 날짜 기준 발령 정보 조회
            const assignment = SalaryCalculator.getAssignmentAtDate(emp, dateValue);
            const deptAtDate = assignment?.department || emp.currentPosition?.dept || '';
            const positionAtDate = assignment?.position || emp.currentPosition?.position || '';
            
            return {
                ...emp,
                deptAtDate,
                positionAtDate
            };
        });
        
        // 정렬 (날짜 기준 부서 → 이름)
        activeEmployees.sort((a, b) => {
            const deptA = a.deptAtDate || '';
            const deptB = b.deptAtDate || '';
            if (deptA !== deptB) return deptA.localeCompare(deptB);
            
            const nameA = a.personalInfo?.name || a.name || '';
            const nameB = b.personalInfo?.name || b.name || '';
            return nameA.localeCompare(nameB);
        });
        
        bulkAllEmployees = activeEmployees;
        bulkFilteredEmployees = activeEmployees;
        
        // 부서 필터 업데이트 (날짜 기준 부서 사용)
        updateBulkDeptFilter(activeEmployees);
        
        // 헤더 직원 수 업데이트
        document.getElementById('headerEmployeeCount').textContent = `직원 ${activeEmployees.length}명`;
        
    } catch (e) {
        console.error('직원 목록 로드 실패:', e);
    }
}

// ===== 일괄 입력: 부서 필터 업데이트 =====
function updateBulkDeptFilter(employees) {
    const depts = new Set();
    employees.forEach(emp => {
        const dept = emp.deptAtDate || emp.currentPosition?.dept;
        if (dept) depts.add(dept);
    });
    
    const select = document.getElementById('bulkDeptFilter');
    select.innerHTML = '<option value="">전체</option>';
    
    [...depts].sort().forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        select.appendChild(option);
    });
    
    // 상세 보고서 부서 체크박스 초기화
    initReportDeptCheckboxes([...depts].sort());
    
    // 월별 집계 부서 체크박스 초기화
    initMonthlyDeptCheckboxes([...depts].sort());
}

/**
 * 상세 보고서 부서 체크박스 초기화
 */
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

/**
 * 월별 집계 부서 체크박스 초기화
 */
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

/**
 * 상세 보고서 전체 부서 선택/해제
 */
function toggleAllReportDepts(checked) {
    const checkboxes = document.querySelectorAll('.report-dept-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
}

/**
 * 개별 부서 체크 시 전체 체크박스 상태 업데이트
 */
function updateReportDeptAll() {
    const checkboxes = document.querySelectorAll('.report-dept-checkbox');
    const allCheckbox = document.getElementById('reportDeptAll');
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    
    allCheckbox.checked = allChecked;
    allCheckbox.indeterminate = !allChecked && someChecked;
}

/**
 * 선택된 부서 목록 가져오기
 */
function getSelectedReportDepts() {
    const checkboxes = document.querySelectorAll('.report-dept-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// ===== 월별 집계: 부서 체크박스 함수들 =====
function toggleAllMonthlyDepts(checked) {
    const checkboxes = document.querySelectorAll('.monthly-dept-checkbox');
    checkboxes.forEach(cb => cb.checked = checked);
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

// ===== 일괄 입력: 직원 검색 =====
function filterBulkEmployeeList() {
    const searchText = document.getElementById('bulkEmployeeSearch').value.toLowerCase().trim();
    
    if (searchText === '') {
        bulkFilteredEmployees = bulkAllEmployees;
    } else {
        bulkFilteredEmployees = bulkAllEmployees.filter(emp => {
            const name = (emp.personalInfo?.name || emp.name || '').toLowerCase();
            const dept = (emp.deptAtDate || emp.currentPosition?.dept || '').toLowerCase();
            return name.includes(searchText) || dept.includes(searchText);
        });
    }
    
    renderBulkEmployeeDropdown();
}

function showBulkEmployeeDropdown() {
    filterBulkEmployeeList();
    document.getElementById('bulkEmployeeDropdown').style.display = 'block';
}

function hideBulkEmployeeDropdown() {
    setTimeout(() => {
        document.getElementById('bulkEmployeeDropdown').style.display = 'none';
    }, 200);
}

function renderBulkEmployeeDropdown() {
    const dropdown = document.getElementById('bulkEmployeeDropdown');
    
    const availableEmployees = bulkFilteredEmployees;
    
    if (availableEmployees.length === 0) {
        dropdown.innerHTML = '<div class="search-dropdown-empty">검색 결과가 없습니다</div>';
        dropdown.style.display = 'block';
        return;
    }
    
    // 이미 추가된 직원 ID 목록 (표시용)
    const addedIds = bulkInputData.map(d => d.empId);
    
    // 동명이인 확인을 위해 이름별 카운트
    const nameCount = {};
    availableEmployees.forEach(emp => {
        const name = emp.personalInfo?.name || emp.name || '이름없음';
        nameCount[name] = (nameCount[name] || 0) + 1;
    });
    
    let html = '';
    availableEmployees.slice(0, 20).forEach(emp => {
        const name = emp.personalInfo?.name || emp.name || '이름없음';
        const dept = emp.deptAtDate || emp.currentPosition?.dept || '';
        const uniqueCode = emp.personalInfo?.uniqueCode || '';
        const entryDate = emp.employment?.entryDate || '';
        const addedCount = addedIds.filter(id => id === emp.id).length;
        const addedBadge = addedCount > 0 ? `<span style="color:#3b82f6;font-size:11px;margin-left:5px;">(${addedCount}회)</span>` : '';
        
        // 동명이인인 경우 추가 정보 표시
        const hasSameName = nameCount[name] > 1;
        let extraInfo = '';
        if (hasSameName) {
            const entryStr = entryDate ? entryDate.substring(2, 10).replace(/-/g, '.') : '';
            extraInfo = ` <span style="color:#f59e0b;">[${entryStr}입사]</span>`;
        }
        
        html += `
            <div class="search-dropdown-item" onclick="addEmployeeToBulk('${emp.id}')">
                <span>${escapeHtml(name)}${extraInfo}${addedBadge}</span>
                ${dept ? `<small>${escapeHtml(dept)}${uniqueCode ? ' / ' + uniqueCode : ''}</small>` : ''}
            </div>
        `;
    });
    
    if (availableEmployees.length > 20) {
        html += `<div class="search-dropdown-empty">외 ${availableEmployees.length - 20}명...</div>`;
    }
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function onBulkEmployeeSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        
        if (bulkFilteredEmployees.length > 0) {
            addEmployeeToBulk(bulkFilteredEmployees[0].id);
        } else {
            alert('검색 결과가 없습니다.');
        }
    } else if (event.key === 'Escape') {
        document.getElementById('bulkEmployeeDropdown').style.display = 'none';
    }
}

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', function(e) {
    const wrappers = document.querySelectorAll('.search-select-wrapper');
    wrappers.forEach(wrapper => {
        if (!wrapper.contains(e.target)) {
            const dropdown = wrapper.querySelector('.search-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });
});

// ===== 일괄 입력: 직원 추가 =====
function addEmployeeToBulk(empId) {
    const emp = bulkAllEmployees.find(e => e.id === empId);
    if (!emp) return;
    
    const name = emp.personalInfo?.name || emp.name || '이름없음';
    const dept = emp.deptAtDate || emp.currentPosition?.dept || '';
    
    // 현재 날짜가 휴일(토/일/공휴일)인지 확인
    const dateValue = document.getElementById('bulkInputDate').value;
    const holiday = checkHoliday(dateValue);
    const isHolidayDate = holiday && holiday.isHoliday;
    
    // 같은 직원이 이미 있는지 확인 (휴일: 3개, 평일: 2개 제한)
    let existingCount = 0;
    for (let i = 0; i < bulkInputData.length; i++) {
        if (bulkInputData[i].empId === empId) {
            existingCount++;
        }
    }
    
    const maxRows = isHolidayDate ? 3 : 2;
    
    if (existingCount >= maxRows) {
        if (isHolidayDate) {
            alert(`${name} 직원은 이미 3개(휴일) 추가되어 있습니다.`);
        } else {
            alert(`${name} 직원은 이미 2개(조근/야근) 추가되어 있습니다.\n휴일(토/일/공휴일)의 경우 3개까지 가능합니다.`);
        }
        document.getElementById('bulkEmployeeSearch').value = '';
        document.getElementById('bulkEmployeeDropdown').style.display = 'none';
        return;
    }
    
    // 날짜에 따른 기본값 설정
    const defaults = getDefaultValuesForDate(dateValue);
    
    // 기본값으로 추가
    bulkInputData.push({
        empId: empId,
        name: name,
        dept: dept,
        dayType: defaults.dayType,
        startTime: '',
        endTime: '',
        overtimeType: defaults.overtimeType,
        compensationType: 'pay'
    });
    
    // 검색창 초기화
    document.getElementById('bulkEmployeeSearch').value = '';
    document.getElementById('bulkEmployeeDropdown').style.display = 'none';
    
    // 테이블 렌더링
    renderBulkInputTable();
    
    if (existingCount >= 1) {
        console.log(`${name} 직원 ${existingCount + 1}번째 추가`);
    }
}

// 날짜에 따른 기본값 반환
function getDefaultValuesForDate(dateValue) {
    if (!dateValue) {
        return { dayType: 'night', overtimeType: 'extended15x' };
    }
    
    const holiday = checkHoliday(dateValue);
    
    if (holiday && holiday.isHoliday) {
        return { dayType: 'holiday', overtimeType: 'holiday' };
    } else {
        return { dayType: 'night', overtimeType: 'extended15x' };
    }
}

function addSelectedEmployeeToBulk() {
    if (bulkFilteredEmployees.length > 0) {
        addEmployeeToBulk(bulkFilteredEmployees[0].id);
    } else {
        alert('검색 결과가 없습니다.\n검색어를 확인해주세요.');
    }
}

// ===== 일괄 입력: 전체 직원 로드 =====
function loadAllEmployeesToBulk() {
    const hasInputData = bulkInputData.some(d => d.startTime || d.endTime);
    if (hasInputData) {
        if (!confirm('기존 입력 데이터가 있습니다.\n전체 직원을 추가하시겠습니까?\n(기존 데이터는 유지됩니다)')) {
            return;
        }
    }
    
    if (bulkAllEmployees.length === 0) {
        loadBulkEmployees();
    }
    
    const dateValue = document.getElementById('bulkInputDate').value;
    const defaults = getDefaultValuesForDate(dateValue);
    
    const existingIds = bulkInputData.map(d => d.empId);
    
    bulkAllEmployees.forEach(emp => {
        if (!existingIds.includes(emp.id)) {
            const name = emp.personalInfo?.name || emp.name || '이름없음';
            const dept = emp.deptAtDate || emp.currentPosition?.dept || '';
            
            bulkInputData.push({
                empId: emp.id,
                name: name,
                dept: dept,
                dayType: defaults.dayType,
                startTime: '',
                endTime: '',
                overtimeType: defaults.overtimeType,
                compensationType: 'pay'
            });
        }
    });
    
    // 부서+이름 순 정렬
    bulkInputData.sort((a, b) => {
        if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
        return a.name.localeCompare(b.name);
    });
    
    renderBulkInputTable();
    filterBulkAllEmployees();
}

// ===== 일괄 입력: 전체 직원 필터링 =====
function filterBulkAllEmployees() {
    const deptFilter = document.getElementById('bulkDeptFilter').value;
    const nameFilter = document.getElementById('bulkAllSearchFilter').value.toLowerCase().trim();
    
    const rows = document.querySelectorAll('.bulk-input-table tbody tr');
    rows.forEach(row => {
        const rowDept = row.dataset.dept || '';
        const rowName = row.dataset.name || '';
        
        let show = true;
        if (deptFilter && rowDept !== deptFilter) show = false;
        if (nameFilter && !rowName.toLowerCase().includes(nameFilter)) show = false;
        
        row.style.display = show ? '' : 'none';
    });
}

// ===== 일괄 입력: 테이블 렌더링 =====
function renderBulkInputTable() {
    const container = document.getElementById('bulkInputTableContainer');
    const countEl = document.getElementById('bulkInputCount');
    const actionsEl = document.getElementById('bulkInputActions');
    
    if (bulkInputData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <div class="empty-state-text">날짜를 선택하고 직원을 추가하세요</div>
            </div>
        `;
        countEl.textContent = '(0명)';
        actionsEl.style.display = 'none';
        return;
    }
    
    // 시간외근무 유형 목록 (동기 캐시 사용)
    const enabledTypes = getEnabledOvertimeTypesSync();
    
    // 직원별 평일 총 시간 계산
    const empTotalMinutes = calculateAllEmployeeTotalMinutes();
    
    // 복사된 설정 표시
    let copyStatusHtml = '';
    if (copiedBulkSettings) {
        const typeInfo = OVERTIME_TYPES[copiedBulkSettings.overtimeType] || {};
        const selectedCount = bulkSelectedRows.size;
        copyStatusHtml = `
            <div class="alert" style="margin-bottom:10px;background:#f0fdf4;border-color:#22c55e;padding:8px 12px;">
                <span>📋 복사됨: </span>
                <strong>${copiedBulkSettings.dayType === 'morning' ? '조근' : copiedBulkSettings.dayType === 'night' ? '야근' : '휴일'}</strong>
                ${copiedBulkSettings.startTime || '____'} ~ ${copiedBulkSettings.endTime || '____'}
                | ${typeInfo.shortName || '-'}
                | ${copiedBulkSettings.compensationType === 'pay' ? '수당' : '대휴'}
                <button onclick="clearCopiedSettings()" style="margin-left:10px;padding:2px 8px;font-size:11px;">✕ 취소</button>
                <span style="margin-left:15px;border-left:1px solid #ccc;padding-left:15px;">
                    <button onclick="selectEmptyRows()" class="btn btn-sm" style="padding:4px 10px;font-size:12px;background:#f3f4f6;">☐ 빈 행 선택</button>
                    ${selectedCount > 0 ? `<button onclick="clearBulkSelection()" class="btn btn-sm" style="margin-left:5px;padding:4px 10px;font-size:12px;background:#fee2e2;color:#991b1b;">✕ 선택해제</button>` : ''}
                    <button onclick="pasteToSelected()" class="btn" style="margin-left:8px;padding:8px 16px;font-size:13px;font-weight:600;background:#8b5cf6;color:white;border-radius:6px;" ${selectedCount === 0 ? 'disabled' : ''}>
                        📥 선택한 ${selectedCount}명에게 붙여넣기 (Ctrl+V)
                    </button>
                </span>
            </div>
        `;
    }
    
    // 전체 선택 체크박스 상태 계산
    const isAllSelected = bulkInputData.length > 0 && bulkSelectedRows.size === bulkInputData.length;
    const isPartialSelected = bulkSelectedRows.size > 0 && bulkSelectedRows.size < bulkInputData.length;
    
    let html = copyStatusHtml + `
        <div class="table-container">
            <table class="bulk-input-table">
                <thead>
                    <tr>
                        <th class="col-check" style="width:30px;">
                            <input type="checkbox" id="bulkSelectAll" 
                                   ${isAllSelected ? 'checked' : ''} 
                                   onchange="toggleBulkSelectAll(this.checked)" 
                                   title="전체 선택/해제">
                        </th>
                        <th class="col-dept">부서</th>
                        <th class="col-name">이름</th>
                        <th class="col-total">합계</th>
                        <th class="col-daytype">구분</th>
                        <th class="col-time">시작</th>
                        <th class="col-time">종료</th>
                        <th class="col-type">유형</th>
                        <th class="col-comp">보상</th>
                        <th class="col-action" style="width:70px;">관리</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const dateValue = document.getElementById('bulkInputDate').value;
    
    // 직원별 휴일 인정시간 계산 (전체 범위 기준)
    const empHolidayMinutes = calculateAllEmployeeHolidayMinutes();
    
    // 현재 날짜가 휴일(토/일/공휴일)인지 확인
    const holidayCheck = checkHoliday(dateValue);
    const isHolidayDate = holidayCheck && holidayCheck.isHoliday;
    
    // 직원별 행 개수 미리 계산
    const empRowCounts = {};
    bulkInputData.forEach(item => {
        empRowCounts[item.empId] = (empRowCounts[item.empId] || 0) + 1;
    });
    
    // 직원별 휴일 첫 행 인덱스 계산
    const empHolidayFirstRow = {};
    bulkInputData.forEach((item, index) => {
        if (item.dayType === 'holiday' && empHolidayFirstRow[item.empId] === undefined) {
            empHolidayFirstRow[item.empId] = index;
        }
    });
    
    bulkInputData.forEach((item, index) => {
        const isFilled = item.startTime && item.endTime;
        const isHoliday = item.dayType === 'holiday';
        const totalMin = empTotalMinutes[item.empId] || 0;
        
        // 동적 제한 적용
        const maxInfo = getEmployeeMaxOvertimeMinutes(item.empId, dateValue);
        const isOverLimit = !isHoliday && (totalMin > maxInfo.maxMinutes || maxInfo.forbidden);
        
        // 1시간 단위 검증
        let isInvalidHourUnit = false;
        let holidayTotalMin = 0;
        
        if (isHoliday) {
            const holidayInfo = empHolidayMinutes[item.empId];
            if (holidayInfo) {
                holidayTotalMin = holidayInfo.totalMin;
                isInvalidHourUnit = holidayTotalMin > 0 && holidayTotalMin % 60 !== 0;
            }
        } else {
            isInvalidHourUnit = totalMin > 0 && totalMin % 60 !== 0;
        }
        
        // 21시 초과 검증 (야근만)
        let isOver21 = false;
        if (item.dayType === 'night' && item.endTime) {
            const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
            isOver21 = endMin > 21 * 60;
        }
        
        // 기본 시간 오류 검증
        let isTimeError = false;
        if (isFilled) {
            const sMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
            const eMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
            const duration = eMin - sMin;
            isTimeError = (eMin <= sMin) || (duration < 60);
        }
        
        // 휴일 시간 겹침 검증
        let isHolidayOverlap = false;
        if (isHoliday && isFilled) {
            isHolidayOverlap = checkHolidayTimeOverlap(item.empId, index);
        }
        
        // 휴게시간 전환 구간 검증 (조근+야근 조합 시)
        let isBreakTransition = false;
        if (!isHoliday && !isTimeError && isFilled) {
            const empItems = bulkInputData.filter(d => 
                d.empId === item.empId && 
                (d.dayType === 'morning' || d.dayType === 'night') &&
                d.startTime && d.endTime
            );
            
            const hasMorning = empItems.some(d => d.dayType === 'morning');
            const hasNight = empItems.some(d => d.dayType === 'night');
            
            if (hasMorning && hasNight && empItems.length >= 2) {
                let earliestStart = null, latestEnd = null;
                empItems.forEach(ei => {
                    const s = parseInt(ei.startTime.substring(0, 2)) * 60 + parseInt(ei.startTime.substring(2, 4));
                    const e = parseInt(ei.endTime.substring(0, 2)) * 60 + parseInt(ei.endTime.substring(2, 4));
                    if (earliestStart === null || s < earliestStart) earliestStart = s;
                    if (latestEnd === null || e > latestEnd) latestEnd = e;
                });
                
                const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
                const regularMin = schedule.dailyHours * 60;
                const regularStartMin = parseInt(schedule.workStart.split(':')[0]) * 60 + parseInt(schedule.workStart.split(':')[1]);
                const regularEndMin = regularStartMin + regularMin;
                const totalStart = Math.min(earliestStart, regularStartMin);
                const totalEnd = Math.max(latestEnd, regularEndMin);
                const totalRange = totalEnd - totalStart;
                
                const currentBreak = totalRange >= 480 ? 60 : (totalRange >= 240 ? 30 : 0);
                const reducedRange = totalRange - 30;
                const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
                
                const currentOvertime = Math.max(0, (totalRange - currentBreak) - regularMin);
                const reducedOvertime = Math.max(0, (reducedRange - reducedBreak) - regularMin);
                
                isBreakTransition = (currentOvertime === reducedOvertime && 
                                    currentOvertime > 0 && 
                                    totalRange >= 240);
            }
        }
        
        // 휴일 휴게시간 전환 구간 검증 (연속 근무만 해당)
        let isHolidayBreakTransition = false;
        if (isHoliday && isFilled) {
            const holidayInfo = empHolidayMinutes[item.empId];
            if (holidayInfo && !holidayInfo.isNonContinuous && holidayInfo.rangeMin >= 240) {
                const rangeMin = holidayInfo.rangeMin;
                const currentBreak = rangeMin >= 480 ? 60 : (rangeMin >= 240 ? 30 : 0);
                const reducedRange = rangeMin - 30;
                const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
                
                const currentRecognized = rangeMin - currentBreak;
                const reducedRecognized = reducedRange - reducedBreak;
                
                isHolidayBreakTransition = (currentRecognized === reducedRecognized && currentRecognized > 0);
            }
        }
        
        // 휴일 8시간 초과 검증
        let isHolidayOverLimit = false;
        if (isHoliday && holidayTotalMin > 480) {
            isHolidayOverLimit = true;
        }
        
        // 행 클래스 결정
        let rowClass = '';
        const isSelected = bulkSelectedRows.has(index);
        const hasError = isOverLimit || isInvalidHourUnit || isOver21 || isTimeError || isBreakTransition || isHolidayBreakTransition || isHolidayOverlap || isHolidayOverLimit;
        
        if (hasError) {
            rowClass = 'bulk-row-overlimit';
        } else if (isSelected) {
            rowClass = 'bulk-row-selected';
        } else if (isFilled) {
            rowClass = 'bulk-row-filled';
        } else {
            rowClass = 'bulk-row-empty';
        }
        
        // 합계 표시
        const isFirstRowOfEmp = bulkInputData.findIndex(d => d.empId === item.empId) === index;
        const isFirstHolidayRowOfEmp = empHolidayFirstRow[item.empId] === index;
        let totalDisplay = '';
        let totalClass = '';
        
        if (isHoliday) {
            if (isFirstHolidayRowOfEmp && holidayTotalMin > 0) {
                const holidayInfo = empHolidayMinutes[item.empId];
                const ncMark = holidayInfo?.isNonContinuous ? ' 🔀' : '';
                totalDisplay = `${formatMinutesToTime(holidayTotalMin)}/8시간${ncMark}`;
                totalClass = (isInvalidHourUnit || isTimeError || isHolidayBreakTransition || isHolidayOverlap || isHolidayOverLimit) ? 'total-overlimit' : 'total-normal';
            }
        } else if (isFirstRowOfEmp) {
            const maxDisplay = `/${formatMinutesToTime(maxInfo.maxMinutes)}`;
            totalDisplay = formatMinutesToTime(totalMin) + maxDisplay;
            totalClass = (isOverLimit || isInvalidHourUnit || isOver21 || isTimeError || isBreakTransition) ? 'total-overlimit' : (totalMin > 0 ? 'total-normal' : '');
        }
        
        // 경고 아이콘
        let warningIcon = '';
        if (isTimeError) {
            warningIcon = ' ⛔';
        } else if (isHolidayOverlap) {
            warningIcon = ' 🔄';
        } else if (isOver21) {
            warningIcon = ' 🌙';
        } else if (isHoliday && isFirstHolidayRowOfEmp) {
            if (isHolidayOverLimit) warningIcon = ' ⚠️';
            else if (isHolidayBreakTransition) warningIcon = ' ⚡';
            else if (isInvalidHourUnit) warningIcon = ' ⏱️';
        } else if (isBreakTransition && isFirstRowOfEmp) {
            warningIcon = ' ⚡';
        } else if (isFirstRowOfEmp) {
            if (maxInfo.forbidden) warningIcon = ' 🚫';
            else if (isInvalidHourUnit) warningIcon = ' ⏱️';
            else if (isOverLimit) warningIcon = ' ⚠️';
        }
        
        html += `
            <tr class="${rowClass}" data-index="${index}" data-dept="${escapeHtml(item.dept)}" data-name="${escapeHtml(item.name)}" data-empid="${item.empId}">
                <td class="col-check" style="text-align:center;">
                    <input type="checkbox" class="bulk-row-checkbox" data-index="${index}" 
                           ${bulkSelectedRows.has(index) ? 'checked' : ''} 
                           onchange="toggleBulkRowSelect(${index}, this.checked)">
                </td>
                <td class="col-dept">${escapeHtml(item.dept)}</td>
                <td class="col-name">${escapeHtml(item.name)}</td>
                <td class="col-total ${totalClass}">${totalDisplay}${warningIcon}</td>
                <td class="col-daytype">
                    <select onchange="onBulkDayTypeChange(${index}, this.value)">
                        <option value="">-</option>
                        <option value="morning" ${item.dayType === 'morning' ? 'selected' : ''}>조근</option>
                        <option value="night" ${item.dayType === 'night' ? 'selected' : ''}>야근</option>
                        <option value="holiday" ${item.dayType === 'holiday' ? 'selected' : ''}>휴일</option>
                    </select>
                </td>
                <td class="col-time">
                    <input type="text" class="time-input" value="${item.startTime}" 
                           placeholder="0800"
                           oninput="onBulkTimeInput(${index}, 'start', this.value)"
                           onblur="onBulkTimeBlur(${index}, 'start', this)">
                </td>
                <td class="col-time">
                    <input type="text" class="time-input" value="${item.endTime}" 
                           placeholder="2000"
                           oninput="onBulkTimeInput(${index}, 'end', this.value)"
                           onblur="onBulkTimeBlur(${index}, 'end', this)">
                </td>
                <td class="col-type">
                    <select onchange="onBulkTypeChange(${index}, this.value)">
                        <option value="">-</option>
                        ${enabledTypes.map(t => `
                            <option value="${t.code}" ${item.overtimeType === t.code ? 'selected' : ''}>${t.shortName}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="col-comp">
                    <select onchange="onBulkCompChange(${index}, this.value)">
                        <option value="pay" ${item.compensationType === 'pay' ? 'selected' : ''}>수당</option>
                        <option value="leave" ${item.compensationType === 'leave' ? 'selected' : ''}>대휴</option>
                    </select>
                </td>
                <td class="col-action">
                    <button class="btn-copy" onclick="copyBulkRow(${index})" title="이 행 설정 복사" style="font-size:10px;padding:2px 4px;background:#e0f2fe;border:none;border-radius:3px;cursor:pointer;">📋</button>
                    ${empRowCounts[item.empId] < (isHolidayDate ? 3 : 2) ? `<button class="btn-add-row" onclick="duplicateBulkRow(${index})" title="행 추가 (휴일:3개, 평일:2개)">+</button>` : ''}
                    <button class="btn-remove" onclick="removeBulkRow(${index})" title="삭제">✕</button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    
    // 전체 선택 체크박스 indeterminate 상태 설정
    const selectAllCheckbox = document.getElementById('bulkSelectAll');
    if (selectAllCheckbox && isPartialSelected) {
        selectAllCheckbox.indeterminate = true;
    }
    
    // 입력된 행 수 계산
    const filledCount = bulkInputData.filter(d => d.startTime && d.endTime).length;
    
    // 초과 직원 확인
    const overLimitEmps = Object.entries(empTotalMinutes).filter(([id, min]) => {
        const empData = bulkInputData.filter(d => d.empId === id);
        const hasWeekday = empData.some(d => d.dayType === 'morning' || d.dayType === 'night');
        if (!hasWeekday) return false;
        
        const empMaxInfo = getEmployeeMaxOvertimeMinutes(id, dateValue);
        return empMaxInfo.forbidden || min > empMaxInfo.maxMinutes;
    });
    
    // 1시간 단위 오류 직원
    const hourUnitErrors = Object.entries(empTotalMinutes).filter(([id, min]) => {
        const empData = bulkInputData.filter(d => d.empId === id);
        const hasWeekday = empData.some(d => d.dayType === 'morning' || d.dayType === 'night');
        return hasWeekday && min > 0 && min % 60 !== 0;
    });
    
    // 휴일 1시간 단위 오류
    const holidayHourUnitErrors = Object.entries(empHolidayMinutes).filter(([empId, info]) => {
        return info.totalMin > 0 && info.totalMin % 60 !== 0;
    });
    
    // 21시 초과 오류
    const over21Errors = bulkInputData.filter(item => {
        if (item.dayType !== 'night') return false;
        if (!item.endTime) return false;
        const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        return endMin > 21 * 60;
    });
    
    // 기본 시간 오류
    const timeErrors = bulkInputData.filter(item => {
        if (!item.startTime || !item.endTime) return false;
        const sMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
        const eMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        return (eMin <= sMin) || (eMin - sMin < 60);
    });
    
    // 휴게시간 전환 구간 오류
    const breakTransitionErrors = [];
    const checkedEmps = new Set();
    bulkInputData.forEach(item => {
        if (checkedEmps.has(item.empId)) return;
        if (item.dayType === 'holiday') return;
        if (!item.startTime || !item.endTime) return;
        
        const empItems = bulkInputData.filter(d => 
            d.empId === item.empId && 
            (d.dayType === 'morning' || d.dayType === 'night') &&
            d.startTime && d.endTime
        );
        
        const hasMorning = empItems.some(d => d.dayType === 'morning');
        const hasNight = empItems.some(d => d.dayType === 'night');
        
        if (!hasMorning || !hasNight || empItems.length < 2) {
            checkedEmps.add(item.empId);
            return;
        }
        
        let earliestStart = null, latestEnd = null;
        empItems.forEach(ei => {
            const s = parseInt(ei.startTime.substring(0, 2)) * 60 + parseInt(ei.startTime.substring(2, 4));
            const e = parseInt(ei.endTime.substring(0, 2)) * 60 + parseInt(ei.endTime.substring(2, 4));
            if (earliestStart === null || s < earliestStart) earliestStart = s;
            if (latestEnd === null || e > latestEnd) latestEnd = e;
        });
        
        const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
        const regularMin = schedule.dailyHours * 60;
        const regularStartMin = parseInt(schedule.workStart.split(':')[0]) * 60 + parseInt(schedule.workStart.split(':')[1]);
        const regularEndMin = regularStartMin + regularMin;
        const totalStart = Math.min(earliestStart, regularStartMin);
        const totalEnd = Math.max(latestEnd, regularEndMin);
        const totalRange = totalEnd - totalStart;
        
        const currentBreak = totalRange >= 480 ? 60 : (totalRange >= 240 ? 30 : 0);
        const reducedRange = totalRange - 30;
        const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
        
        const currentOvertime = Math.max(0, (totalRange - currentBreak) - regularMin);
        const reducedOvertime = Math.max(0, (reducedRange - reducedBreak) - regularMin);
        
        if (currentOvertime === reducedOvertime && currentOvertime > 0 && totalRange >= 240) {
            breakTransitionErrors.push(item.name);
        }
        checkedEmps.add(item.empId);
    });
    
    countEl.textContent = `(${bulkInputData.length}행, 입력 ${filledCount}건)`;
    
    let saveInfo = `시간이 입력된 ${filledCount}건만 저장됩니다.`;
    if (timeErrors.length > 0) {
        saveInfo += ` ⛔ ${timeErrors.length}건 시간 오류!`;
    }
    if (breakTransitionErrors.length > 0) {
        saveInfo += ` ⚡ ${breakTransitionErrors.length}명 휴게전환!`;
    }
    if (overLimitEmps.length > 0) {
        saveInfo += ` ⚠️ ${overLimitEmps.length}명 제한 초과!`;
    }
    if (hourUnitErrors.length > 0) {
        saveInfo += ` ⏱️ 평일 ${hourUnitErrors.length}명 1시간 단위 오류!`;
    }
    if (holidayHourUnitErrors.length > 0) {
        saveInfo += ` ⏱️ 휴일 ${holidayHourUnitErrors.length}명 1시간 단위 오류!`;
    }
    if (over21Errors.length > 0) {
        saveInfo += ` 🌙 ${over21Errors.length}건 21시 초과!`;
    }
    document.getElementById('bulkSaveInfo').innerHTML = saveInfo;
    
    actionsEl.style.display = 'block';
}

// ===== 직원별 평일 총 시간 계산 =====
function calculateAllEmployeeTotalMinutes() {
    const result = {};
    const dateValue = document.getElementById('bulkInputDate').value;
    
    const empGroups = {};
    bulkInputData.forEach(item => {
        if (item.dayType === 'holiday') return;
        if (!item.startTime || !item.endTime) return;
        
        if (!empGroups[item.empId]) {
            empGroups[item.empId] = [];
        }
        empGroups[item.empId].push(item);
    });
    
    Object.entries(empGroups).forEach(([empId, items]) => {
        const schedule = getEmployeeWorkSchedule(empId, dateValue);
        
        if (schedule.isReduced && schedule.reductionType === 'partTime') {
            result[empId] = calculatePartTimeOvertimeMinutes(items, schedule);
        } else {
            let total = 0;
            items.forEach(item => {
                const startMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
                const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
                total += Math.max(0, endMin - startMin);
            });
            result[empId] = total;
        }
    });
    
    return result;
}

/**
 * 직원별 휴일 총 인정시간 계산
 */
function calculateAllEmployeeHolidayMinutes() {
    const result = {};
    
    const empGroups = {};
    bulkInputData.forEach(item => {
        if (item.dayType !== 'holiday') return;
        if (!item.startTime || !item.endTime) return;
        
        if (!empGroups[item.empId]) {
            empGroups[item.empId] = [];
        }
        empGroups[item.empId].push(item);
    });
    
    Object.entries(empGroups).forEach(([empId, items]) => {
        const timeRanges = items.map(item => {
            const s = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
            const e = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
            return { start: s, end: e, duration: e - s };
        }).sort((a, b) => a.start - b.start);
        
        if (timeRanges.length === 0) {
            result[empId] = { totalMin: 0, rangeMin: 0, breakMin: 0, isNonContinuous: false };
            return;
        }
        
        const earliestStart = timeRanges[0].start;
        const latestEnd = Math.max(...timeRanges.map(r => r.end));
        const rangeMin = latestEnd - earliestStart;
        const actualWorkMin = timeRanges.reduce((sum, r) => sum + r.duration, 0);
        
        let isNonContinuous = false;
        for (let i = 0; i < timeRanges.length - 1; i++) {
            const gap = timeRanges[i + 1].start - timeRanges[i].end;
            if (gap >= 1) {
                isNonContinuous = true;
                break;
            }
        }
        
        let baseMin, breakMin, totalMin;
        
        if (isNonContinuous) {
            baseMin = actualWorkMin;
            if (baseMin >= 480) breakMin = 60;
            else if (baseMin >= 240) breakMin = 30;
            else breakMin = 0;
            totalMin = Math.max(0, baseMin - breakMin);
        } else {
            baseMin = rangeMin;
            if (baseMin >= 480) breakMin = 60;
            else if (baseMin >= 240) breakMin = 30;
            else breakMin = 0;
            totalMin = Math.max(0, baseMin - breakMin);
        }
        
        result[empId] = { 
            totalMin, rangeMin, breakMin, earliestStart, latestEnd,
            actualWorkMin, isNonContinuous 
        };
    });
    
    return result;
}

/**
 * 휴일 시간 겹침 검증
 */
function checkHolidayTimeOverlap(empId, currentIndex) {
    const holidayItems = bulkInputData.filter((d, idx) => 
        d.empId === empId && 
        d.dayType === 'holiday' && 
        d.startTime && d.endTime
    );
    
    if (holidayItems.length < 2) return false;
    
    const times = holidayItems.map(item => {
        const s = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
        const e = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        return { start: s, end: e, item };
    });
    
    for (let i = 0; i < times.length; i++) {
        for (let j = i + 1; j < times.length; j++) {
            const a = times[i];
            const b = times[j];
            if (a.start < b.end && b.start < a.end) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * 단시간 근로자의 시간외근무 인정시간 계산
 */
function calculatePartTimeOvertimeMinutes(items, schedule) {
    let earliestStart = null;
    let latestEnd = null;
    
    items.forEach(item => {
        const startMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
        const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        
        if (earliestStart === null || startMin < earliestStart) {
            earliestStart = startMin;
        }
        if (latestEnd === null || endMin > latestEnd) {
            latestEnd = endMin;
        }
    });
    
    if (earliestStart === null || latestEnd === null) return 0;
    
    const workStartParts = schedule.workStart.split(':');
    const workEndParts = schedule.workEnd.split(':');
    const regularStartMin = parseInt(workStartParts[0]) * 60 + parseInt(workStartParts[1]);
    const regularEndMin = parseInt(workEndParts[0]) * 60 + parseInt(workEndParts[1]);
    
    const totalStart = Math.min(earliestStart, regularStartMin);
    const totalEnd = Math.max(latestEnd, regularEndMin);
    const totalRangeMinutes = totalEnd - totalStart;
    
    const totalRangeHours = totalRangeMinutes / 60;
    let requiredBreakMinutes = 0;
    if (totalRangeHours >= 8) {
        requiredBreakMinutes = 60;
    } else if (totalRangeHours >= 4) {
        requiredBreakMinutes = 30;
    }
    
    const actualWorkMinutes = totalRangeMinutes - requiredBreakMinutes;
    const regularMinutes = schedule.dailyHours * 60;
    const overtimeMinutes = Math.max(0, actualWorkMinutes - regularMinutes);
    
    return overtimeMinutes;
}

/**
 * 시간외근무 1시간 단위 검증
 */
function validateOvertimeHourUnit() {
    const dateValue = document.getElementById('bulkInputDate').value;
    const empTotalMinutes = calculateAllEmployeeTotalMinutes();
    const invalidEmps = [];
    
    // 평일 검증
    Object.entries(empTotalMinutes).forEach(([empId, totalMin]) => {
        const empData = bulkInputData.filter(d => d.empId === empId);
        const hasWeekday = empData.some(d => d.dayType === 'morning' || d.dayType === 'night');
        if (!hasWeekday) return;
        
        if (totalMin > 0 && totalMin % 60 !== 0) {
            const emp = empData[0];
            const hours = Math.floor(totalMin / 60);
            const mins = totalMin % 60;
            invalidEmps.push({
                name: emp.name,
                totalMin: totalMin,
                display: `${hours}시간 ${mins}분`,
                type: '평일'
            });
        }
    });
    
    // 휴일 검증
    bulkInputData.forEach(item => {
        if (item.dayType !== 'holiday') return;
        if (!item.startTime || !item.endTime) return;
        
        const startMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
        const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        let totalMin = Math.max(0, endMin - startMin);
        
        if (totalMin >= 480) {
            totalMin -= 60;
        } else if (totalMin >= 240) {
            totalMin -= 30;
        }
        
        if (totalMin > 0 && totalMin % 60 !== 0) {
            const hours = Math.floor(totalMin / 60);
            const mins = totalMin % 60;
            invalidEmps.push({
                name: item.name,
                totalMin: totalMin,
                display: `${hours}시간 ${mins}분`,
                type: '휴일'
            });
        }
    });
    
    return {
        valid: invalidEmps.length === 0,
        invalidEmps: invalidEmps
    };
}

/**
 * 21시 초과 검증
 */
function validateNightTimeLimit() {
    const invalidItems = [];
    const MAX_END_TIME = 21 * 60;
    
    bulkInputData.forEach(item => {
        if (item.dayType !== 'night') return;
        if (!item.endTime) return;
        
        const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        
        if (endMin > MAX_END_TIME) {
            const endHour = Math.floor(endMin / 60);
            const endMinute = endMin % 60;
            invalidItems.push({
                name: item.name,
                endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
                type: '야근'
            });
        }
    });
    
    return {
        valid: invalidItems.length === 0,
        invalidItems: invalidItems
    };
}

/**
 * 상세 오류 검증 및 안내 생성
 */
function validateWithDetailedGuide(toSave, dateValue) {
    const errors = [];
    const warnings = [];
    
    // 전역 employees 사용
    const allEmployees = window.employees || [];
    
    // 직원별로 그룹화
    const empGroups = {};
    toSave.forEach(item => {
        if (!empGroups[item.empId]) {
            const emp = allEmployees.find(e => e.id === item.empId);
            empGroups[item.empId] = {
                name: item.name,
                items: [],
                schedule: getEmployeeWorkSchedule(item.empId, dateValue),
                maxInfo: getEmployeeMaxOvertimeMinutes(item.empId, dateValue),
                employee: emp
            };
        }
        empGroups[item.empId].items.push(item);
    });
    
    Object.entries(empGroups).forEach(([empId, group]) => {
        const { name, items, schedule, maxInfo, employee } = group;
        const regularHours = schedule.dailyHours;
        const regularStart = schedule.workStart;
        const regularEnd = schedule.workEnd;
        const isPartTime = schedule.isReduced && schedule.reductionType === 'partTime';
        
        // 0. 퇴사자 체크
        if (employee) {
            const leaveDate = employee.employment?.leaveDate || employee.leaveDate;
            if (leaveDate && leaveDate <= dateValue) {
                errors.push({
                    empId, name, type: 'resigned', icon: '🚪',
                    title: '퇴사자',
                    problem: `퇴직일: ${leaveDate} (이미 퇴사한 직원)`,
                    solution: '퇴사자에게는 시간외근무를 등록할 수 없습니다. 해당 직원을 삭제해주세요.'
                });
                return;
            }
        }
        
        // 0-1. 휴직자 체크
        if (employee) {
            const leaves = employee.leaves || [];
            const activeLeave = leaves.find(leave => {
                if (!leave.startDate) return false;
                const start = leave.startDate;
                const end = leave.endDate || '9999-12-31';
                return dateValue >= start && dateValue <= end;
            });
            
            if (activeLeave) {
                const leaveTypeMap = {
                    'maternity': '육아휴직', 'sick': '병가',
                    'unpaid': '무급휴직', 'other': '기타휴직'
                };
                const leaveTypeName = leaveTypeMap[activeLeave.type] || activeLeave.type || '휴직';
                
                errors.push({
                    empId, name, type: 'onLeave', icon: '🏖️',
                    title: '휴직 중',
                    problem: `${leaveTypeName} 기간: ${activeLeave.startDate} ~ ${activeLeave.endDate || '미정'}`,
                    solution: '휴직 중인 직원에게는 시간외근무를 등록할 수 없습니다. 해당 직원을 삭제해주세요.'
                });
                return;
            }
        }
        
        // 0-2. 동일 직원 중복 시간대 체크
        if (items.length > 1) {
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const item1 = items[i];
                    const item2 = items[j];
                    
                    const start1 = parseInt(item1.startTime.substring(0, 2)) * 60 + parseInt(item1.startTime.substring(2, 4));
                    const end1 = parseInt(item1.endTime.substring(0, 2)) * 60 + parseInt(item1.endTime.substring(2, 4));
                    const start2 = parseInt(item2.startTime.substring(0, 2)) * 60 + parseInt(item2.startTime.substring(2, 4));
                    const end2 = parseInt(item2.endTime.substring(0, 2)) * 60 + parseInt(item2.endTime.substring(2, 4));
                    
                    if (start1 < end2 && end1 > start2) {
                        const time1Str = `${item1.startTime.substring(0,2)}:${item1.startTime.substring(2,4)}~${item1.endTime.substring(0,2)}:${item1.endTime.substring(2,4)}`;
                        const time2Str = `${item2.startTime.substring(0,2)}:${item2.startTime.substring(2,4)}~${item2.endTime.substring(0,2)}:${item2.endTime.substring(2,4)}`;
                        
                        errors.push({
                            empId, name, type: 'overlap', icon: '⚠️',
                            title: '시간대 중복',
                            problem: `${time1Str}과 ${time2Str}이 겹침`,
                            solution: '같은 날짜에 시간이 겹치는 시간외근무는 등록할 수 없습니다. 시간을 조정하거나 하나를 삭제해주세요.'
                        });
                        return;
                    }
                }
            }
        }
        
        // 1. 시간외근무 금지 직원 체크
        if (maxInfo.forbidden) {
            errors.push({
                empId, name, type: 'forbidden', icon: '🚫',
                title: '시간외근무 금지',
                problem: `${maxInfo.reason}`,
                solution: '해당 직원의 시간외근무를 삭제해주세요.'
            });
            return;
        }
        
        // 각 입력 건별 검증
        items.forEach(item => {
            const startMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
            const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
            const duration = endMin - startMin;
            const dayTypeText = item.dayType === 'morning' ? '조근' : item.dayType === 'night' ? '야근' : '휴일';
            const startTimeStr = `${item.startTime.substring(0, 2)}:${item.startTime.substring(2, 4)}`;
            const endTimeStr = `${item.endTime.substring(0, 2)}:${item.endTime.substring(2, 4)}`;
            
            // 2. 종료시간 <= 시작시간
            if (endMin <= startMin) {
                errors.push({
                    empId, name, type: 'invalidTime', icon: '⛔',
                    title: '시간 입력 오류',
                    problem: `${dayTypeText} ${startTimeStr}~${endTimeStr} - 종료시간이 시작시간과 같거나 앞섬`,
                    solution: `종료시간을 시작시간(${startTimeStr}) 이후로 입력해주세요.`
                });
                return;
            }
            
            // 3. 1시간 미만
            if (duration < 60) {
                errors.push({
                    empId, name, type: 'tooShort', icon: '⛔',
                    title: '최소 시간 미달',
                    problem: `${dayTypeText} ${startTimeStr}~${endTimeStr} (${duration}분) - 최소 1시간 이상 필요`,
                    solution: `종료시간을 ${formatTimeFromMinutes(startMin + 60)} 이후로 입력해주세요.`
                });
                return;
            }
            
            // 4. 21시 초과 (야근)
            if (item.dayType === 'night' && endMin > 21 * 60) {
                errors.push({
                    empId, name, type: 'over21', icon: '🌙',
                    title: '야간근무 시간 초과',
                    problem: `야근 종료시간 ${endTimeStr} - 21:00 초과 (22시부터 야간수당 발생)`,
                    solution: `종료시간을 21:00 이하로 입력해주세요.`
                });
                return;
            }
        });
        
        // 5. 평일 인정시간 검증
        const weekdayItems = items.filter(i => i.dayType === 'morning' || i.dayType === 'night');
        if (weekdayItems.length > 0) {
            let earliestStart = null;
            let latestEnd = null;
            weekdayItems.forEach(item => {
                const sMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
                const eMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
                if (earliestStart === null || sMin < earliestStart) earliestStart = sMin;
                if (latestEnd === null || eMin > latestEnd) latestEnd = eMin;
            });
            
            let totalOvertimeMinutes;
            let totalRangeMinutes = 0;
            
            const regularStartMin = parseInt(schedule.workStart.split(':')[0]) * 60 + parseInt(schedule.workStart.split(':')[1]);
            const regularEndMin = regularStartMin + (schedule.dailyHours * 60);
            const totalStart = Math.min(earliestStart, regularStartMin);
            const totalEnd = Math.max(latestEnd, regularEndMin);
            totalRangeMinutes = totalEnd - totalStart;
            
            if (isPartTime) {
                totalOvertimeMinutes = calculatePartTimeOvertimeMinutes(weekdayItems, schedule);
            } else {
                totalOvertimeMinutes = 0;
                weekdayItems.forEach(item => {
                    const sMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
                    const eMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
                    totalOvertimeMinutes += Math.max(0, eMin - sMin);
                });
            }
            
            // 조근+야근 조합 시 휴게시간 전환 구간 검증
            const hasMorning = weekdayItems.some(i => i.dayType === 'morning');
            const hasNight = weekdayItems.some(i => i.dayType === 'night');
            
            if (hasMorning && hasNight && weekdayItems.length >= 2 && totalRangeMinutes > 0) {
                const currentBreak = totalRangeMinutes >= 480 ? 60 : (totalRangeMinutes >= 240 ? 30 : 0);
                const reducedRange = totalRangeMinutes - 30;
                const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
                
                const currentWork = totalRangeMinutes - currentBreak;
                const reducedWork = reducedRange - reducedBreak;
                const regularMin = schedule.dailyHours * 60;
                
                const currentOvertime = Math.max(0, currentWork - regularMin);
                const reducedOvertime = Math.max(0, reducedWork - regularMin);
                
                if (currentOvertime === reducedOvertime && currentOvertime > 0 && totalRangeMinutes >= 240) {
                    const nightItem = weekdayItems.find(i => i.dayType === 'night');
                    if (nightItem) {
                        const nightEndMin = parseInt(nightItem.endTime.substring(0, 2)) * 60 + parseInt(nightItem.endTime.substring(2, 4));
                        const efficientEnd = nightEndMin - 30;
                        const efficientEndStr = formatTimeFromMinutes(efficientEnd);
                        const nightEndStr = `${nightItem.endTime.substring(0, 2)}:${nightItem.endTime.substring(2, 4)}`;
                        
                        const breakChangeText = currentBreak > reducedBreak ? 
                            `(${currentBreak}분 → ${reducedBreak}분)` : '';
                        
                        errors.push({
                            empId, name, type: 'breakTransition', icon: '⚡',
                            title: '휴게시간 전환 구간',
                            problem: `야근 종료 ${nightEndStr} → 휴게 ${currentBreak}분 적용되어 인정 ${currentOvertime/60}시간`,
                            solution: `야근 종료를 ${efficientEndStr}로 30분 줄여도 인정시간 ${currentOvertime/60}시간 동일\n   (휴게 ${breakChangeText} 전환으로 실근무 동일)`
                        });
                    }
                }
            }
            
            // 1시간 단위 검증
            if (totalOvertimeMinutes > 0 && totalOvertimeMinutes % 60 !== 0) {
                const hours = Math.floor(totalOvertimeMinutes / 60);
                const mins = totalOvertimeMinutes % 60;
                const nextHour = (hours + 1) * 60;
                
                let suggestion = '';
                if (isPartTime) {
                    const morningItem = weekdayItems.find(i => i.dayType === 'morning');
                    const nightItem = weekdayItems.find(i => i.dayType === 'night');
                    
                    if (nightItem) {
                        const nightStart = parseInt(nightItem.startTime.substring(0, 2)) * 60 + parseInt(nightItem.startTime.substring(2, 4));
                        const morningMin = morningItem ? 
                            (parseInt(morningItem.endTime.substring(0, 2)) * 60 + parseInt(morningItem.endTime.substring(2, 4))) - 
                            (parseInt(morningItem.startTime.substring(0, 2)) * 60 + parseInt(morningItem.startTime.substring(2, 4))) : 0;
                        
                        const regularMin = schedule.dailyHours * 60;
                        const rangeStart = morningItem ? 
                            parseInt(morningItem.startTime.substring(0, 2)) * 60 + parseInt(morningItem.startTime.substring(2, 4)) :
                            parseInt(schedule.workStart.split(':')[0]) * 60 + parseInt(schedule.workStart.split(':')[1]);
                        
                        suggestion = `\n\n💡 권장 야근 종료시간:`;
                        for (let targetHours = 1; targetHours <= Math.min(maxInfo.maxMinutes / 60, 4); targetHours++) {
                            const targetOvertime = targetHours * 60;
                            const requiredWork = regularMin + targetOvertime;
                            
                            let requiredEnd;
                            if (requiredWork < 240) {
                                requiredEnd = rangeStart + requiredWork;
                            } else if (requiredWork < 450) {
                                requiredEnd = rangeStart + requiredWork + 30;
                            } else {
                                if (requiredWork < 480) {
                                    requiredEnd = rangeStart + 450 + 30;
                                } else {
                                    requiredEnd = rangeStart + requiredWork + 60;
                                }
                            }
                            
                            if (requiredEnd <= 21 * 60) {
                                const isTransitionZone = requiredWork >= 450 && requiredWork < 480;
                                const marker = isTransitionZone ? ' ⚠️' : '';
                                suggestion += `\n   ${targetHours}시간 인정 → ${formatTimeFromMinutes(requiredEnd)}${marker}`;
                            }
                        }
                    }
                } else {
                    const lastItem = weekdayItems[weekdayItems.length - 1];
                    if (lastItem.dayType === 'night') {
                        const nightEnd = parseInt(lastItem.endTime.substring(0, 2)) * 60 + parseInt(lastItem.endTime.substring(2, 4));
                        const adjustment = 60 - mins;
                        const suggestedEnd = nightEnd + adjustment;
                        if (suggestedEnd <= 21 * 60) {
                            suggestion = `\n\n💡 야근 종료시간을 ${formatTimeFromMinutes(suggestedEnd)}로 변경하면 ${hours + 1}시간 인정`;
                        }
                    }
                }
                
                errors.push({
                    empId, name, type: 'hourUnit', icon: '⏱️',
                    title: '1시간 단위 오류',
                    problem: `인정시간 ${hours}시간 ${mins}분 - 1시간 단위만 인정됨`,
                    solution: `시간을 조정하여 인정시간이 ${hours}시간 또는 ${hours + 1}시간이 되도록 해주세요.${suggestion}`
                });
            }
            
            // 제한 초과 검증
            if (totalOvertimeMinutes > maxInfo.maxMinutes) {
                const overMin = totalOvertimeMinutes - maxInfo.maxMinutes;
                errors.push({
                    empId, name, type: 'overLimit', icon: '⚠️',
                    title: '제한 시간 초과',
                    problem: `인정시간 ${formatMinutesToTime(totalOvertimeMinutes)} (최대 ${formatMinutesToTime(maxInfo.maxMinutes)}) - ${formatMinutesToTime(overMin)} 초과`,
                    solution: `시간외근무를 ${formatMinutesToTime(maxInfo.maxMinutes)} 이하로 줄여주세요.\n${maxInfo.reason}`
                });
            }
        }
        
        // 6. 휴일 인정시간 검증
        const holidayItems = items.filter(i => i.dayType === 'holiday');
        if (holidayItems.length > 0) {
            const timeRanges = holidayItems
                .filter(item => item.startTime && item.endTime)
                .map(item => {
                    const s = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
                    const e = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
                    return { start: s, end: e, duration: e - s };
                }).sort((a, b) => a.start - b.start);
            
            if (timeRanges.length > 0) {
                let isNonContinuous = false;
                for (let i = 0; i < timeRanges.length - 1; i++) {
                    const gap = timeRanges[i + 1].start - timeRanges[i].end;
                    if (gap >= 1) {
                        isNonContinuous = true;
                        break;
                    }
                }
                
                const earliestStart = timeRanges[0].start;
                const latestEnd = Math.max(...timeRanges.map(r => r.end));
                const rangeMin = latestEnd - earliestStart;
                const actualWorkMin = timeRanges.reduce((sum, r) => sum + r.duration, 0);
                
                let baseMin = isNonContinuous ? actualWorkMin : rangeMin;
                let breakMin = 0;
                if (baseMin >= 480) breakMin = 60;
                else if (baseMin >= 240) breakMin = 30;
                
                const totalRecognized = Math.max(0, baseMin - breakMin);
                
                if (totalRecognized > 0 && totalRecognized % 60 !== 0) {
                    const hours = Math.floor(totalRecognized / 60);
                    const mins = totalRecognized % 60;
                    
                    const startTimeStr = formatTimeFromMinutes(earliestStart);
                    const endTimeStr = formatTimeFromMinutes(latestEnd);
                    const calcMethod = isNonContinuous ? '실근무 합산' : '전체범위';
                    
                    errors.push({
                        empId, name, type: 'holidayHourUnit', icon: '⏱️',
                        title: '휴일 1시간 단위 오류',
                        problem: `휴일 총 ${holidayItems.length}건 (${startTimeStr}~${endTimeStr}) → 인정 ${hours}시간 ${mins}분 (${calcMethod} - 휴게${breakMin}분)`,
                        solution: `시간을 조정하여 인정시간이 ${hours}시간 또는 ${hours + 1}시간이 되도록 해주세요.`
                    });
                }
            }
        }
    });
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * 상세 오류 안내 표시
 */
function showDetailedErrorGuide(errors) {
    const byEmployee = {};
    errors.forEach(err => {
        if (!byEmployee[err.empId]) {
            byEmployee[err.empId] = { name: err.name, errors: [] };
        }
        byEmployee[err.empId].errors.push(err);
    });
    
    let message = '❌ 저장할 수 없습니다!\n';
    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    Object.values(byEmployee).forEach(emp => {
        message += `【${emp.name}】\n`;
        emp.errors.forEach(err => {
            message += `\n${err.icon} ${err.title}\n`;
            message += `   문제: ${err.problem}\n`;
            message += `   해결: ${err.solution}\n`;
        });
        message += '\n';
    });
    
    alert(message);
}

/**
 * 분을 시간 문자열로 변환 (HH:MM)
 */
function formatTimeFromMinutes(totalMin) {
    const hour = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ===== 직원별 근무시간 조회 및 제한 계산 =====

/**
 * 직원의 해당 날짜 정규 근무시간 조회
 */
function getEmployeeWorkSchedule(empId, dateValue) {
    const defaultSchedule = {
        workStart: '09:00', workEnd: '18:00',
        dailyHours: 8, isReduced: false, reductionType: null
    };
    
    try {
        const allEmployees = window.employees || [];
        const emp = allEmployees.find(e => e.id === empId);
        if (!emp) return defaultSchedule;
        
        const date = new Date(dateValue);
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayOfWeek = dayNames[date.getDay()];
        
        // 1. 육아기 단축근로 확인
        if (emp.reducedWork?.childcare?.length > 0) {
            const activeChildcare = emp.reducedWork.childcare.find(r => {
                return r.startDate <= dateValue && r.endDate >= dateValue;
            });
            
            if (activeChildcare) {
                let schedule;
                if (activeChildcare.scheduleType === 'uniform' && activeChildcare.uniformSchedule) {
                    schedule = activeChildcare.uniformSchedule;
                } else if (activeChildcare.schedule && activeChildcare.schedule[dayOfWeek]) {
                    schedule = activeChildcare.schedule[dayOfWeek];
                }
                
                if (schedule && schedule.workStart && schedule.workEnd) {
                    return {
                        workStart: schedule.workStart,
                        workEnd: schedule.workEnd,
                        dailyHours: schedule.dailyHours || schedule.hours || 0,
                        isReduced: true,
                        reductionType: 'childcare'
                    };
                }
            }
        }
        
        // 2. 임신기 단축근로 확인 (시간외근무 금지)
        if (emp.reducedWork?.pregnancy?.length > 0) {
            const activePregnancy = emp.reducedWork.pregnancy.find(r => {
                return r.startDate <= dateValue && r.endDate >= dateValue;
            });
            
            if (activePregnancy) {
                return {
                    workStart: activePregnancy.workStart || '11:00',
                    workEnd: activePregnancy.workEnd || '18:00',
                    dailyHours: 6,
                    isReduced: true,
                    reductionType: 'pregnancy',
                    overtimeForbidden: true
                };
            }
        }
        
        // 3. 10시 출근제 확인
        if (emp.reducedWork?.flexTime?.length > 0) {
            const activeFlexTime = emp.reducedWork.flexTime.find(r => {
                return r.startDate <= dateValue && r.endDate >= dateValue;
            });
            
            if (activeFlexTime) {
                return {
                    workStart: activeFlexTime.workStart || '10:00',
                    workEnd: activeFlexTime.workEnd || '19:00',
                    dailyHours: 8,
                    isReduced: true,
                    reductionType: 'flexTime'
                };
            }
        }
        
        // 4. 단시간 근로자 확인
        const weeklyHours = emp.employment?.weeklyWorkingHours || emp.assignments?.[0]?.workingHours || 40;
        if (weeklyHours < 40) {
            const dailyHours = weeklyHours / 5;
            const workStart = '10:00';
            const breakMinutes = dailyHours >= 4 ? 30 : 0;
            const totalMinutes = (dailyHours * 60) + breakMinutes;
            const endHour = 10 + Math.floor(totalMinutes / 60);
            const endMin = totalMinutes % 60;
            const workEnd = `${String(endHour).padStart(2, '0')}:${String(Math.round(endMin)).padStart(2, '0')}`;
            
            return {
                workStart: workStart, workEnd: workEnd,
                dailyHours: dailyHours, weeklyHours: weeklyHours,
                isReduced: true, reductionType: 'partTime'
            };
        }
        
        return defaultSchedule;
        
    } catch (e) {
        console.error('근무시간 조회 오류:', e);
        return defaultSchedule;
    }
}

/**
 * 직원의 최대 시간외근무 가능시간(분) 계산
 */
function getEmployeeMaxOvertimeMinutes(empId, dateValue) {
    const schedule = getEmployeeWorkSchedule(empId, dateValue);
    
    if (schedule.overtimeForbidden) {
        return {
            maxMinutes: 0,
            reason: '임신기 근로자 (시간외근무 금지)',
            forbidden: true
        };
    }
    
    if (!schedule.isReduced && schedule.dailyHours >= 8) {
        return {
            maxMinutes: 180,
            reason: '정규 8시간 근무자',
            forbidden: false,
            schedule: schedule
        };
    }
    
    const nightLimitMinutes = 21 * 60;
    const morningStartLimit = 7 * 60;
    
    const workStartParts = schedule.workStart.split(':');
    const workEndParts = schedule.workEnd.split(':');
    const regularStartMin = parseInt(workStartParts[0]) * 60 + parseInt(workStartParts[1]);
    const regularEndMin = parseInt(workEndParts[0]) * 60 + parseInt(workEndParts[1]);
    
    const maxRangeStart = morningStartLimit;
    const maxRangeEnd = nightLimitMinutes;
    const maxTotalRange = maxRangeEnd - maxRangeStart;
    
    const requiredBreak = 60;
    const maxActualWork = maxTotalRange - requiredBreak;
    const regularMinutes = schedule.dailyHours * 60;
    let maxOvertimeMinutes = maxActualWork - regularMinutes;
    
    maxOvertimeMinutes = Math.floor(maxOvertimeMinutes / 60) * 60;
    
    return {
        maxMinutes: maxOvertimeMinutes,
        reason: schedule.reductionType === 'childcare' ? '육아기 단축근로자' :
                schedule.reductionType === 'flexTime' ? '10시 출근제' :
                schedule.reductionType === 'partTime' ? '단시간 근로자' : '일반',
        forbidden: false,
        schedule: schedule
    };
}

/**
 * 직원이 시간외근무 등록 가능한지 확인
 */
function checkOvertimeAllowed(empId, dateValue, totalOvertimeMinutes) {
    const maxInfo = getEmployeeMaxOvertimeMinutes(empId, dateValue);
    
    if (maxInfo.forbidden) {
        return { allowed: false, message: maxInfo.reason, maxMinutes: 0 };
    }
    
    if (totalOvertimeMinutes > maxInfo.maxMinutes) {
        return {
            allowed: false,
            message: `최대 ${formatMinutesToTime(maxInfo.maxMinutes)} 가능 (${maxInfo.reason})`,
            maxMinutes: maxInfo.maxMinutes
        };
    }
    
    return { allowed: true, message: '', maxMinutes: maxInfo.maxMinutes };
}

// 분을 시간:분 형식으로 변환
function formatMinutesToTime(minutes) {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}시간${m > 0 ? m + '분' : ''}`;
}

// ===== 일괄 입력: 행 복제 (같은 직원 추가) =====
function duplicateBulkRow(index) {
    const original = bulkInputData[index];
    if (!original) return;
    
    const dateValue = document.getElementById('bulkInputDate').value;
    const holiday = checkHoliday(dateValue);
    const isHolidayDate = holiday && holiday.isHoliday;
    
    let empRowCount = 0;
    for (let i = 0; i < bulkInputData.length; i++) {
        if (bulkInputData[i].empId === original.empId) {
            empRowCount++;
        }
    }
    
    const maxRows = isHolidayDate ? 3 : 2;
    
    if (empRowCount >= maxRows) {
        if (isHolidayDate) {
            alert('직원당 최대 3개(휴일)까지만 추가 가능합니다.');
        } else {
            alert('직원당 최대 2개(조근/야근)까지만 추가 가능합니다.\n휴일(토/일/공휴일) 근무의 경우 3개까지 가능합니다.');
        }
        return;
    }
    
    let newDayType = '';
    let newOvertimeType = '';
    let newStartTime = '';
    let newEndTime = '';
    
    if (original.dayType === 'morning') {
        newDayType = 'night';
        newOvertimeType = 'extended15x';
        
        const schedule = getEmployeeWorkSchedule(original.empId, dateValue);
        const maxInfo = getEmployeeMaxOvertimeMinutes(original.empId, dateValue);
        
        let morningMinutes = 0;
        if (original.startTime && original.endTime) {
            const sMin = parseInt(original.startTime.substring(0, 2)) * 60 + parseInt(original.startTime.substring(2, 4));
            const eMin = parseInt(original.endTime.substring(0, 2)) * 60 + parseInt(original.endTime.substring(2, 4));
            morningMinutes = Math.max(0, eMin - sMin);
        }
        
        let remainingMinutes = maxInfo.maxMinutes - morningMinutes;
        if (remainingMinutes <= 0) remainingMinutes = 60;
        
        newStartTime = calculateNightStartTime(schedule);
        newEndTime = calculateNightEndTime(schedule, morningMinutes, remainingMinutes);
        
    } else if (original.dayType === 'night') {
        newDayType = 'morning';
        newOvertimeType = 'extended15x';
        
        const schedule = getEmployeeWorkSchedule(original.empId, dateValue);
        newEndTime = schedule.workStart.replace(':', '');
        
        const workStartParts = schedule.workStart.split(':');
        const startHour = parseInt(workStartParts[0]) - 1;
        const startMin = parseInt(workStartParts[1]);
        newStartTime = `${String(startHour).padStart(2, '0')}${String(startMin).padStart(2, '0')}`;
        
    } else if (original.dayType === 'holiday') {
        newDayType = 'holiday';
        newOvertimeType = 'holiday';
    } else {
        const defaults = getDefaultValuesForDate(dateValue);
        newDayType = defaults.dayType;
        newOvertimeType = defaults.overtimeType;
    }
    
    const newRow = {
        empId: original.empId,
        name: original.name,
        dept: original.dept,
        dayType: newDayType,
        startTime: newStartTime,
        endTime: newEndTime,
        overtimeType: newOvertimeType,
        compensationType: 'pay'
    };
    
    bulkInputData.splice(index + 1, 0, newRow);
    renderBulkInputTable();
}

// ===== 일괄 입력: 행 삭제 =====
function removeBulkRow(index) {
    const item = bulkInputData[index];
    if (!item) return;
    
    const dateValue = document.getElementById('bulkInputDate').value;
    
    if (dateValue) {
        const startTime = item.originalStartTime || item.startTime;
        const endTime = item.originalEndTime || item.endTime;
        
        if (startTime && endTime) {
            deleteRecordFromStorage(item.empId, dateValue, startTime, endTime);
        }
    }
    
    bulkInputData.splice(index, 1);
    
    const newSelectedRows = new Set();
    bulkSelectedRows.forEach(selectedIndex => {
        if (selectedIndex < index) {
            newSelectedRows.add(selectedIndex);
        } else if (selectedIndex > index) {
            newSelectedRows.add(selectedIndex - 1);
        }
    });
    bulkSelectedRows = newSelectedRows;
    
    renderBulkInputTable();
}

// 저장소에서 특정 기록 삭제
async function deleteRecordFromStorage(empId, dateValue, startTime, endTime) {
    try {
        const [year, month] = dateValue.split('-').map(Number);
        const data = await OvertimeDB.getOvertimeDaily();
        
        if (data[String(year)]?.[String(month)]?.[empId]) {
            const empData = data[String(year)][String(month)][empId];
            const beforeCount = empData.records.length;
            empData.records = empData.records.filter(r => 
                !(r.date === dateValue && r.requestStart === startTime && r.requestEnd === endTime)
            );
            const afterCount = empData.records.length;
            
            if (beforeCount !== afterCount) {
                await OvertimeDB.saveOvertimeDaily(data);
                console.log(`삭제됨: ${empId}, ${dateValue}, ${startTime}-${endTime}`);
            }
        }
    } catch (e) {
        console.error('기록 삭제 실패:', e);
    }
}

// ===== 일괄 입력: 복사/붙여넣기 =====

function copyBulkRow(index) {
    const item = bulkInputData[index];
    if (!item) return;
    
    copiedBulkSettings = {
        dayType: item.dayType,
        startTime: item.startTime,
        endTime: item.endTime,
        overtimeType: item.overtimeType,
        compensationType: item.compensationType
    };
    
    console.log('복사됨:', copiedBulkSettings);
    
    const dayTypeText = item.dayType === 'morning' ? '조근' : item.dayType === 'night' ? '야근' : '휴일';
    const typeInfo = OVERTIME_TYPES[item.overtimeType] || {};
    const typeText = typeInfo.name || item.overtimeType;
    const compText = item.compensationType === 'pay' ? '수당' : '대휴';
    const startTime = item.startTime ? `${item.startTime.substring(0,2)}:${item.startTime.substring(2,4)}` : '미입력';
    const endTime = item.endTime ? `${item.endTime.substring(0,2)}:${item.endTime.substring(2,4)}` : '미입력';
    
    alert(`✅ 복사 완료!\n\n📋 복사된 설정:\n━━━━━━━━━━━━━━━━\n• 구분: ${dayTypeText}\n• 시간: ${startTime} ~ ${endTime}\n• 유형: ${typeText}\n• 보상: ${compText}\n\n💡 체크박스로 대상을 선택한 후\n   [붙여넣기] 버튼 또는 Ctrl+V`);
    
    renderBulkInputTable();
}

function clearCopiedSettings() {
    copiedBulkSettings = null;
    renderBulkInputTable();
}

function clearBulkSelection() {
    bulkSelectedRows.clear();
    renderBulkInputTable();
}

function toggleBulkSelectAll(checked) {
    if (checked) {
        bulkInputData.forEach((_, index) => {
            bulkSelectedRows.add(index);
        });
    } else {
        bulkSelectedRows.clear();
    }
    renderBulkInputTable();
}

function toggleBulkRowSelect(index, checked) {
    if (checked) {
        bulkSelectedRows.add(index);
    } else {
        bulkSelectedRows.delete(index);
    }
    
    const selectAllCheckbox = document.getElementById('bulkSelectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = bulkSelectedRows.size === bulkInputData.length;
        selectAllCheckbox.indeterminate = bulkSelectedRows.size > 0 && bulkSelectedRows.size < bulkInputData.length;
    }
    
    if (copiedBulkSettings) {
        renderBulkInputTable();
    }
}

function selectEmptyRows() {
    bulkSelectedRows.clear();
    bulkInputData.forEach((item, index) => {
        if (!item.startTime && !item.endTime) {
            bulkSelectedRows.add(index);
        }
    });
    renderBulkInputTable();
}

function pasteToSelected() {
    if (!copiedBulkSettings || bulkSelectedRows.size === 0) {
        alert('붙여넣기할 행을 선택해주세요.');
        return;
    }
    
    let pastedCount = 0;
    bulkSelectedRows.forEach(index => {
        const item = bulkInputData[index];
        if (item) {
            item.dayType = copiedBulkSettings.dayType;
            item.startTime = copiedBulkSettings.startTime;
            item.endTime = copiedBulkSettings.endTime;
            item.overtimeType = copiedBulkSettings.overtimeType;
            item.compensationType = copiedBulkSettings.compensationType;
            pastedCount++;
        }
    });
    
    bulkSelectedRows.clear();
    
    renderBulkInputTable();
    alert(`✅ ${pastedCount}명에게 설정이 적용되었습니다.`);
}

function pasteToAllEmpty() {
    if (!copiedBulkSettings) return;
    
    let pastedCount = 0;
    
    bulkInputData.forEach((item, index) => {
        if (!item.startTime && !item.endTime) {
            item.dayType = copiedBulkSettings.dayType;
            item.startTime = copiedBulkSettings.startTime;
            item.endTime = copiedBulkSettings.endTime;
            item.overtimeType = copiedBulkSettings.overtimeType;
            item.compensationType = copiedBulkSettings.compensationType;
            pastedCount++;
        }
    });
    
    if (pastedCount > 0) {
        renderBulkInputTable();
        alert(`✅ ${pastedCount}명에게 설정이 적용되었습니다.`);
    } else {
        alert('붙여넣기할 빈 행이 없습니다.');
    }
}

// ===== 일괄 입력: 값 변경 핸들러 =====
function onBulkDayTypeChange(index, value) {
    bulkInputData[index].dayType = value;
    
    if (value && !bulkInputData[index].overtimeType) {
        setDefaultOvertimeTypeForBulk(index, value);
    }
    
    if (value === 'night') {
        autoSetNightTime(index);
    } else if (value === 'morning') {
        autoSetMorningTime(index);
    }
}

/**
 * 야근 시간 자동 설정
 */
function autoSetNightTime(index) {
    const item = bulkInputData[index];
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
    const maxInfo = getEmployeeMaxOvertimeMinutes(item.empId, dateValue);
    
    let morningMinutes = 0;
    bulkInputData.forEach(d => {
        if (d.empId === item.empId && d.dayType === 'morning' && d.startTime && d.endTime) {
            const sMin = parseInt(d.startTime.substring(0, 2)) * 60 + parseInt(d.startTime.substring(2, 4));
            const eMin = parseInt(d.endTime.substring(0, 2)) * 60 + parseInt(d.endTime.substring(2, 4));
            morningMinutes += Math.max(0, eMin - sMin);
        }
    });
    
    let remainingMinutes = maxInfo.maxMinutes - morningMinutes;
    if (remainingMinutes <= 0) remainingMinutes = 60;
    
    const startTime = calculateNightStartTime(schedule);
    const endTime = calculateNightEndTime(schedule, morningMinutes, remainingMinutes);
    
    bulkInputData[index].startTime = startTime;
    bulkInputData[index].endTime = endTime;
    
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (row) {
        const inputs = row.querySelectorAll('.time-input');
        if (inputs[0]) inputs[0].value = startTime;
        if (inputs[1]) inputs[1].value = endTime;
    }
    
    updateBulkRowStyle(index);
}

/**
 * 야근 시작시간 계산
 */
function calculateNightStartTime(schedule) {
    let nightStartMin;
    
    if (schedule.isReduced) {
        const workStartParts = schedule.workStart.split(':');
        const regularStartMin = parseInt(workStartParts[0]) * 60 + parseInt(workStartParts[1]);
        const regularMinutes = schedule.dailyHours * 60;
        nightStartMin = regularStartMin + regularMinutes;
    } else {
        const workEndParts = schedule.workEnd.split(':');
        nightStartMin = parseInt(workEndParts[0]) * 60 + parseInt(workEndParts[1]);
    }
    
    const hour = Math.floor(nightStartMin / 60);
    const min = nightStartMin % 60;
    return `${String(hour).padStart(2, '0')}${String(min).padStart(2, '0')}`;
}

/**
 * 야근 종료시간 계산 (휴게시간 고려)
 */
function calculateNightEndTime(schedule, morningMinutes, targetNightMinutes) {
    const regularMinutes = schedule.dailyHours * 60;
    
    const workStartParts = schedule.workStart.split(':');
    const regularStartMin = parseInt(workStartParts[0]) * 60 + parseInt(workStartParts[1]);
    
    const rangeStartMin = morningMinutes > 0 
        ? (regularStartMin - morningMinutes) 
        : regularStartMin;
    
    const totalOvertimeMinutes = morningMinutes + targetNightMinutes;
    const requiredWorkMinutes = regularMinutes + totalOvertimeMinutes;
    
    let requiredBreak = 0;
    if (requiredWorkMinutes >= 480) requiredBreak = 60;
    else if (requiredWorkMinutes >= 240) requiredBreak = 30;
    
    const requiredTotalRange = requiredWorkMinutes + requiredBreak;
    let nightEndMin = rangeStartMin + requiredTotalRange;
    
    if (nightEndMin > 21 * 60) nightEndMin = 21 * 60;
    
    const endHour = Math.floor(nightEndMin / 60);
    const endMin = nightEndMin % 60;
    
    return `${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}`;
}

/**
 * 조근 시간 자동 설정
 */
function autoSetMorningTime(index) {
    const item = bulkInputData[index];
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    if (item.startTime) return;
    
    const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
    
    const workStartParts = schedule.workStart.split(':');
    const endHour = parseInt(workStartParts[0]);
    const endMin = parseInt(workStartParts[1]);
    
    const startHour = endHour - 1;
    const startMin = endMin;
    
    const startTime = `${String(startHour).padStart(2, '0')}${String(startMin).padStart(2, '0')}`;
    const endTime = `${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}`;
    
    bulkInputData[index].startTime = startTime;
    bulkInputData[index].endTime = endTime;
    
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (row) {
        const inputs = row.querySelectorAll('.time-input');
        if (inputs[0]) inputs[0].value = startTime;
        if (inputs[1]) inputs[1].value = endTime;
    }
    
    updateBulkRowStyle(index);
}

function onBulkTimeInput(index, field, value) {
    const digits = value.replace(/\D/g, '');
    bulkInputData[index][field === 'start' ? 'startTime' : 'endTime'] = digits;
}

function onBulkTimeBlur(index, field, input) {
    const digits = input.value.replace(/\D/g, '');
    
    if (digits) {
        const formatted = formatTimeDigits(digits);
        input.value = formatted;
        bulkInputData[index][field === 'start' ? 'startTime' : 'endTime'] = formatted;
        
        if (field === 'start' && formatted) {
            autoSetBulkDayType(index, formatted);
        }
        
        const item = bulkInputData[index];
        if (item.dayType === 'morning') {
            updateRelatedNightTime(item.empId);
        }
    }
    
    updateBulkRowStyle(index);
}

/**
 * 조근 변경 시 해당 직원의 야근 시간 재계산
 */
function updateRelatedNightTime(empId) {
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    const schedule = getEmployeeWorkSchedule(empId, dateValue);
    const maxInfo = getEmployeeMaxOvertimeMinutes(empId, dateValue);
    
    let morningMinutes = 0;
    bulkInputData.forEach(d => {
        if (d.empId === empId && d.dayType === 'morning' && d.startTime && d.endTime) {
            const sMin = parseInt(d.startTime.substring(0, 2)) * 60 + parseInt(d.startTime.substring(2, 4));
            const eMin = parseInt(d.endTime.substring(0, 2)) * 60 + parseInt(d.endTime.substring(2, 4));
            morningMinutes += Math.max(0, eMin - sMin);
        }
    });
    
    let remainingMinutes = maxInfo.maxMinutes - morningMinutes;
    if (remainingMinutes <= 0) remainingMinutes = 60;
    
    bulkInputData.forEach((item, idx) => {
        if (item.empId === empId && item.dayType === 'night') {
            const startTime = calculateNightStartTime(schedule);
            const endTime = calculateNightEndTime(schedule, morningMinutes, remainingMinutes);
            
            bulkInputData[idx].startTime = startTime;
            bulkInputData[idx].endTime = endTime;
            
            const row = document.querySelector(`tr[data-index="${idx}"]`);
            if (row) {
                const inputs = row.querySelectorAll('.time-input');
                if (inputs[0]) inputs[0].value = startTime;
                if (inputs[1]) inputs[1].value = endTime;
            }
            
            updateBulkRowStyle(idx);
        }
    });
}

function formatTimeDigits(digits) {
    if (!digits) return '';
    
    let padded = digits;
    if (digits.length === 1) padded = '0' + digits + '00';
    else if (digits.length === 2) padded = digits + '00';
    else if (digits.length === 3) padded = '0' + digits;
    else padded = digits.substring(0, 4);
    
    return padded;
}

function autoSetBulkDayType(index, startTime) {
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    const item = bulkInputData[index];
    const hour = parseInt(startTime.substring(0, 2)) || 0;
    const minute = parseInt(startTime.substring(2, 4)) || 0;
    const startMinutes = hour * 60 + minute;
    const holiday = checkHoliday(dateValue);
    
    let dayType = '';
    let autoEndTime = '';
    
    if (holiday && holiday.isHoliday) {
        dayType = 'holiday';
    } else {
        const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
        const maxInfo = getEmployeeMaxOvertimeMinutes(item.empId, dateValue);
        
        const workStartParts = schedule.workStart.split(':');
        const regularStartMin = parseInt(workStartParts[0]) * 60 + parseInt(workStartParts[1]);
        
        if (startMinutes < regularStartMin) {
            dayType = 'morning';
            autoEndTime = schedule.workStart.replace(':', '');
        } else {
            dayType = 'night';
            
            let morningMinutes = 0;
            bulkInputData.forEach(d => {
                if (d.empId === item.empId && d.dayType === 'morning' && d.startTime && d.endTime) {
                    const sMin = parseInt(d.startTime.substring(0, 2)) * 60 + parseInt(d.startTime.substring(2, 4));
                    const eMin = parseInt(d.endTime.substring(0, 2)) * 60 + parseInt(d.endTime.substring(2, 4));
                    morningMinutes += Math.max(0, eMin - sMin);
                }
            });
            
            let remainingMinutes = maxInfo.maxMinutes - morningMinutes;
            if (remainingMinutes <= 0) remainingMinutes = 60;
            
            autoEndTime = calculateNightEndTime(schedule, morningMinutes, remainingMinutes);
        }
    }
    
    bulkInputData[index].dayType = dayType;
    
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (row) {
        const select = row.querySelector('select');
        if (select) select.value = dayType;
    }
    
    if (autoEndTime) {
        bulkInputData[index].endTime = autoEndTime;
        
        if (row) {
            const endInput = row.querySelectorAll('.time-input')[1];
            if (endInput) endInput.value = autoEndTime;
        }
        
        updateBulkRowStyle(index);
    }
    
    if (!bulkInputData[index].overtimeType) {
        setDefaultOvertimeTypeForBulk(index, dayType);
    }
}

function setDefaultOvertimeTypeForBulk(index, dayType) {
    const enabledTypes = getEnabledOvertimeTypesSync();
    let defaultType = '';
    
    if (dayType === 'morning') {
        defaultType = enabledTypes.find(t => t.code === 'extended15x')?.code || 
                      enabledTypes.find(t => t.code === 'extended1x')?.code || '';
    } else if (dayType === 'night') {
        defaultType = enabledTypes.find(t => t.code === 'extended15x')?.code ||
                      enabledTypes.find(t => t.code === 'extendedNight')?.code || '';
    } else if (dayType === 'holiday') {
        defaultType = enabledTypes.find(t => t.code === 'holiday')?.code ||
                      enabledTypes.find(t => t.code === 'holiday1x')?.code || '';
    }
    
    if (defaultType) {
        bulkInputData[index].overtimeType = defaultType;
        
        const row = document.querySelector(`tr[data-index="${index}"]`);
        if (row) {
            const selects = row.querySelectorAll('select');
            if (selects[2]) selects[2].value = defaultType;
        }
    }
}

function onBulkTypeChange(index, value) {
    bulkInputData[index].overtimeType = value;
}

function onBulkCompChange(index, value) {
    bulkInputData[index].compensationType = value;
}

// ===== updateBulkRowStyle - 행 스타일 실시간 업데이트 =====
function updateBulkRowStyle(index) {
    const item = bulkInputData[index];
    if (!item) return;
    
    const dateValue = document.getElementById('bulkInputDate').value;
    
    const empTotalMinutes = calculateAllEmployeeTotalMinutes();
    const empHolidayMinutes = calculateAllEmployeeHolidayMinutes();
    const totalMin = empTotalMinutes[item.empId] || 0;
    const isHoliday = item.dayType === 'holiday';
    const isFilled = item.startTime && item.endTime;
    
    const maxInfo = getEmployeeMaxOvertimeMinutes(item.empId, dateValue);
    const isOverLimit = !isHoliday && (totalMin > maxInfo.maxMinutes || maxInfo.forbidden);
    
    let isInvalidHourUnit = false;
    let holidayTotalMin = 0;
    
    if (isHoliday) {
        const holidayInfo = empHolidayMinutes[item.empId];
        if (holidayInfo) {
            holidayTotalMin = holidayInfo.totalMin;
            isInvalidHourUnit = holidayTotalMin > 0 && holidayTotalMin % 60 !== 0;
        }
    } else {
        isInvalidHourUnit = totalMin > 0 && totalMin % 60 !== 0;
    }
    
    let isOver21 = false;
    if (item.dayType === 'night' && item.endTime) {
        const endMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        isOver21 = endMin > 21 * 60;
    }
    
    let isTimeError = false;
    if (isFilled) {
        const sMin = parseInt(item.startTime.substring(0, 2)) * 60 + parseInt(item.startTime.substring(2, 4));
        const eMin = parseInt(item.endTime.substring(0, 2)) * 60 + parseInt(item.endTime.substring(2, 4));
        const duration = eMin - sMin;
        isTimeError = (eMin <= sMin) || (duration < 60);
    }
    
    let isBreakTransition = false;
    if (!isHoliday && !isTimeError && isFilled) {
        const empItems = bulkInputData.filter(d => 
            d.empId === item.empId && 
            (d.dayType === 'morning' || d.dayType === 'night') &&
            d.startTime && d.endTime
        );
        
        const hasMorning = empItems.some(d => d.dayType === 'morning');
        const hasNight = empItems.some(d => d.dayType === 'night');
        
        if (hasMorning && hasNight && empItems.length >= 2) {
            let earliestStart = null, latestEnd = null;
            empItems.forEach(ei => {
                const s = parseInt(ei.startTime.substring(0, 2)) * 60 + parseInt(ei.startTime.substring(2, 4));
                const e = parseInt(ei.endTime.substring(0, 2)) * 60 + parseInt(ei.endTime.substring(2, 4));
                if (earliestStart === null || s < earliestStart) earliestStart = s;
                if (latestEnd === null || e > latestEnd) latestEnd = e;
            });
            
            const schedule = getEmployeeWorkSchedule(item.empId, dateValue);
            const regularMin = schedule.dailyHours * 60;
            const regularStartMin = parseInt(schedule.workStart.split(':')[0]) * 60 + parseInt(schedule.workStart.split(':')[1]);
            const regularEndMin = regularStartMin + regularMin;
            
            const totalStart = Math.min(earliestStart, regularStartMin);
            const totalEnd = Math.max(latestEnd, regularEndMin);
            const totalRange = totalEnd - totalStart;
            
            const currentBreak = totalRange >= 480 ? 60 : (totalRange >= 240 ? 30 : 0);
            const reducedRange = totalRange - 30;
            const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
            
            const currentOvertime = Math.max(0, (totalRange - currentBreak) - regularMin);
            const reducedOvertime = Math.max(0, (reducedRange - reducedBreak) - regularMin);
            
            isBreakTransition = (currentOvertime === reducedOvertime && 
                                currentOvertime > 0 && 
                                totalRange >= 240);
        }
    }
    
    let isHolidayBreakTransition = false;
    if (isHoliday && isFilled) {
        const holidayInfo = empHolidayMinutes[item.empId];
        if (holidayInfo && holidayInfo.rangeMin >= 240) {
            const rangeMin = holidayInfo.rangeMin;
            const currentBreak = rangeMin >= 480 ? 60 : (rangeMin >= 240 ? 30 : 0);
            const reducedRange = rangeMin - 30;
            const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
            
            const currentRecognized = rangeMin - currentBreak;
            const reducedRecognized = reducedRange - reducedBreak;
            
            isHolidayBreakTransition = (currentRecognized === reducedRecognized && currentRecognized > 0);
        }
    }
    
    let isHolidayOverlap = false;
    if (isHoliday && isFilled) {
        isHolidayOverlap = checkHolidayTimeOverlap(item.empId, index);
    }
    
    let isHolidayOverLimit = false;
    if (isHoliday && holidayTotalMin > 480) {
        isHolidayOverLimit = true;
    }
    
    const hasError = isOverLimit || isInvalidHourUnit || isOver21 || isTimeError || isBreakTransition || isHolidayBreakTransition || isHolidayOverlap || isHolidayOverLimit;
    
    const holidayFirstIndex = bulkInputData.findIndex(d => d.empId === item.empId && d.dayType === 'holiday');
    const isFirstHolidayRow = index === holidayFirstIndex;
    
    // 해당 직원의 모든 행 업데이트
    const empRows = document.querySelectorAll(`tr[data-empid="${item.empId}"]`);
    empRows.forEach((row, rowIdx) => {
        const rowIndex = parseInt(row.dataset.index);
        const rowItem = bulkInputData[rowIndex];
        const rowFilled = rowItem && rowItem.startTime && rowItem.endTime;
        const rowIsHoliday = rowItem.dayType === 'holiday';
        
        let rowOver21 = false;
        if (rowItem.dayType === 'night' && rowItem.endTime) {
            const eMin = parseInt(rowItem.endTime.substring(0, 2)) * 60 + parseInt(rowItem.endTime.substring(2, 4));
            rowOver21 = eMin > 21 * 60;
        }
        
        let rowTimeError = false;
        if (rowFilled) {
            const sMin = parseInt(rowItem.startTime.substring(0, 2)) * 60 + parseInt(rowItem.startTime.substring(2, 4));
            const eMin = parseInt(rowItem.endTime.substring(0, 2)) * 60 + parseInt(rowItem.endTime.substring(2, 4));
            rowTimeError = (eMin <= sMin) || (eMin - sMin < 60);
        }
        
        let rowHasError = false;
        const rowHolidayFirstIndex = bulkInputData.findIndex(d => d.empId === rowItem.empId && d.dayType === 'holiday');
        const isRowFirstHoliday = rowIndex === rowHolidayFirstIndex;
        
        if (rowIsHoliday) {
            rowHasError = (isInvalidHourUnit || rowTimeError || isHolidayBreakTransition);
        } else {
            rowHasError = hasError || rowOver21 || rowTimeError;
        }
        
        const rowHasErrorFinal = rowHasError || rowOver21 || rowTimeError;
        row.classList.remove('bulk-row-filled', 'bulk-row-empty', 'bulk-row-overlimit', 'bulk-row-selected');
        
        if (rowHasErrorFinal) {
            row.classList.add('bulk-row-overlimit');
        } else if (rowFilled) {
            row.classList.add('bulk-row-filled');
        } else {
            row.classList.add('bulk-row-empty');
        }
        
        // 합계 셀 업데이트
        const totalCell = row.querySelector('.col-total');
        if (totalCell) {
            if (rowTimeError) {
                totalCell.textContent = '⛔';
                totalCell.className = 'col-total total-overlimit';
            } else if (rowIsHoliday && isHolidayOverlap) {
                totalCell.textContent = '🔄';
                totalCell.className = 'col-total total-overlimit';
            } else if (rowIsHoliday && isRowFirstHoliday && holidayTotalMin > 0) {
                let warningIcon = '';
                if (isHolidayOverLimit) warningIcon = ' ⚠️';
                else if (isHolidayBreakTransition) warningIcon = ' ⚡';
                else if (isInvalidHourUnit) warningIcon = ' ⏱️';
                totalCell.textContent = `${formatMinutesToTime(holidayTotalMin)}/8시간${warningIcon}`;
                totalCell.className = 'col-total ' + ((isInvalidHourUnit || isHolidayBreakTransition || isHolidayOverLimit) ? 'total-overlimit' : 'total-normal');
            } else if (rowIsHoliday) {
                totalCell.textContent = '';
                totalCell.className = 'col-total';
            } else if (rowIdx === 0) {
                const maxDisplay = `/${formatMinutesToTime(maxInfo.maxMinutes)}`;
                let warningIcon = '';
                if (isTimeError) warningIcon = ' ⛔';
                else if (rowOver21) warningIcon = ' 🌙';
                else if (isBreakTransition) warningIcon = ' ⚡';
                else if (maxInfo.forbidden) warningIcon = ' 🚫';
                else if (isInvalidHourUnit) warningIcon = ' ⏱️';
                else if (isOverLimit) warningIcon = ' ⚠️';
                totalCell.textContent = formatMinutesToTime(totalMin) + maxDisplay + warningIcon;
                totalCell.className = 'col-total ' + ((hasError || rowOver21) ? 'total-overlimit' : (totalMin > 0 ? 'total-normal' : ''));
            } else if (rowOver21) {
                totalCell.textContent = '🌙';
                totalCell.className = 'col-total total-overlimit';
            } else {
                totalCell.textContent = '';
                totalCell.className = 'col-total';
            }
        }
    });
    
    // 카운트 및 경고 업데이트
    const filledCount = bulkInputData.filter(d => d.startTime && d.endTime).length;
    
    const overLimitEmps = Object.entries(empTotalMinutes).filter(([id, min]) => {
        const empData = bulkInputData.filter(d => d.empId === id);
        const hasWeekday = empData.some(d => d.dayType === 'morning' || d.dayType === 'night');
        if (!hasWeekday) return false;
        const empMaxInfo = getEmployeeMaxOvertimeMinutes(id, dateValue);
        return empMaxInfo.forbidden || min > empMaxInfo.maxMinutes;
    });
    
    const hourUnitErrors = Object.entries(empTotalMinutes).filter(([id, min]) => {
        const empData = bulkInputData.filter(d => d.empId === id);
        const hasWeekday = empData.some(d => d.dayType === 'morning' || d.dayType === 'night');
        return hasWeekday && min > 0 && min % 60 !== 0;
    });
    
    const holidayHourUnitErrors = Object.entries(empHolidayMinutes).filter(([empId, info]) => {
        return info.totalMin > 0 && info.totalMin % 60 !== 0;
    });
    
    const holidayBreakTransitionErrors = Object.entries(empHolidayMinutes).filter(([empId, info]) => {
        if (!info || info.isNonContinuous) return false;
        if (info.rangeMin < 240) return false;
        const rangeMin = info.rangeMin;
        const currentBreak = rangeMin >= 480 ? 60 : (rangeMin >= 240 ? 30 : 0);
        const reducedRange = rangeMin - 30;
        const reducedBreak = reducedRange >= 480 ? 60 : (reducedRange >= 240 ? 30 : 0);
        const currentRecognized = rangeMin - currentBreak;
        const reducedRecognized = reducedRange - reducedBreak;
        return currentRecognized === reducedRecognized && currentRecognized > 0;
    });
    
    const over21Errors = bulkInputData.filter(rowItem => {
        if (rowItem.dayType !== 'night') return false;
        if (!rowItem.endTime) return false;
        const eMin = parseInt(rowItem.endTime.substring(0, 2)) * 60 + parseInt(rowItem.endTime.substring(2, 4));
        return eMin > 21 * 60;
    });
    
    const timeErrors = bulkInputData.filter(rowItem => {
        if (!rowItem.startTime || !rowItem.endTime) return false;
        const sMin = parseInt(rowItem.startTime.substring(0, 2)) * 60 + parseInt(rowItem.startTime.substring(2, 4));
        const eMin = parseInt(rowItem.endTime.substring(0, 2)) * 60 + parseInt(rowItem.endTime.substring(2, 4));
        return (eMin <= sMin) || (eMin - sMin < 60);
    });
    
    const holidayOverlapEmps = new Set();
    bulkInputData.forEach((item2, idx) => {
        if (item2.dayType === 'holiday' && item2.startTime && item2.endTime) {
            if (checkHolidayTimeOverlap(item2.empId, idx)) {
                holidayOverlapEmps.add(item2.empId);
            }
        }
    });
    
    const holidayOverLimitEmps = Object.entries(empHolidayMinutes).filter(([empId, info]) => {
        return info.totalMin > 480;
    });
    
    document.getElementById('bulkInputCount').textContent = `(${bulkInputData.length}행, 입력 ${filledCount}건)`;
    
    let saveInfo = `시간이 입력된 ${filledCount}건만 저장됩니다.`;
    if (timeErrors.length > 0) saveInfo += ` ⛔ ${timeErrors.length}건 시간 오류!`;
    if (holidayOverlapEmps.size > 0) saveInfo += ` 🔄 휴일 ${holidayOverlapEmps.size}명 시간 겹침!`;
    if (overLimitEmps.length > 0) saveInfo += ` ⚠️ ${overLimitEmps.length}명 제한 초과!`;
    if (holidayOverLimitEmps.length > 0) saveInfo += ` ⚠️ 휴일 ${holidayOverLimitEmps.length}명 8시간 초과!`;
    if (hourUnitErrors.length > 0) saveInfo += ` ⏱️ 평일 ${hourUnitErrors.length}명 1시간 단위 오류!`;
    if (holidayHourUnitErrors.length > 0) saveInfo += ` ⏱️ 휴일 ${holidayHourUnitErrors.length}명 1시간 단위 오류!`;
    if (holidayBreakTransitionErrors.length > 0) saveInfo += ` ⚡ 휴일 ${holidayBreakTransitionErrors.length}명 휴게전환!`;
    if (over21Errors.length > 0) saveInfo += ` 🌙 ${over21Errors.length}건 21시 초과!`;
    document.getElementById('bulkSaveInfo').innerHTML = saveInfo;
}

// ===== 일괄 입력: 기존 데이터 로드 =====
async function loadExistingBulkRecords() {
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    const [year, month, day] = dateValue.split('-').map(Number);
    
    try {
        const data = await OvertimeDB.getOvertimeDaily();
        const monthData = data[String(year)]?.[String(month)] || {};
        const allEmployees = window.employees || [];
        
        bulkInputData = [];
        bulkSelectedRows.clear();
        
        for (const empId in monthData) {
            const empRecords = monthData[empId]?.records || [];
            const dayRecords = empRecords.filter(r => r.date === dateValue);
            
            if (dayRecords.length > 0) {
                const emp = allEmployees.find(e => e.id === empId);
                
                if (emp) {
                    const name = emp.personalInfo?.name || emp.name || '이름없음';
                    const dept = emp.currentPosition?.dept || '';
                    
                    dayRecords.forEach(dayRecord => {
                        bulkInputData.push({
                            empId: empId,
                            name: name,
                            dept: dept,
                            dayType: dayRecord.dayType || '',
                            startTime: dayRecord.requestStart || '',
                            endTime: dayRecord.requestEnd || '',
                            originalStartTime: dayRecord.requestStart || '',
                            originalEndTime: dayRecord.requestEnd || '',
                            overtimeType: dayRecord.overtimeType || '',
                            compensationType: dayRecord.compensationType || 'pay'
                        });
                    });
                }
            }
        }
        
        bulkInputData.sort((a, b) => {
            if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
            if (a.name !== b.name) return a.name.localeCompare(b.name);
            return (a.startTime || '').localeCompare(b.startTime || '');
        });
        
        renderBulkInputTable();
        
    } catch (e) {
        console.error('기존 데이터 로드 실패:', e);
    }
}

// ===== 일괄 입력: 저장 =====
async function saveBulkInput() {
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    const toSave = bulkInputData.filter(d => d.startTime && d.endTime && d.overtimeType);
    
    if (toSave.length === 0) {
        alert('저장할 데이터가 없습니다.\n시작시간, 종료시간, 유형을 모두 입력해주세요.');
        return;
    }
    
    const validationResult = validateWithDetailedGuide(toSave, dateValue);
    if (!validationResult.valid) {
        showDetailedErrorGuide(validationResult.errors);
        return;
    }
    
    const [year, month, day] = dateValue.split('-').map(Number);
    
    try {
        const data = await OvertimeDB.getOvertimeDaily();
        
        if (!data[String(year)]) data[String(year)] = {};
        if (!data[String(year)][String(month)]) data[String(year)][String(month)] = {};
        
        let savedCount = 0;
        let deletedCount = 0;
        const processedEmps = new Set();
        
        const existingEmpIds = Object.keys(data[String(year)][String(month)] || {}).filter(empId => {
            const records = data[String(year)][String(month)][empId]?.records || [];
            return records.some(r => r.date === dateValue);
        });
        const currentEmpIds = new Set(toSave.map(item => item.empId));
        const deletedEmps = existingEmpIds.filter(id => !currentEmpIds.has(id));
        
        toSave.forEach((item, idx) => {
            if (!data[String(year)][String(month)][item.empId]) {
                data[String(year)][String(month)][item.empId] = { records: [] };
            }
            
            const empData = data[String(year)][String(month)][item.empId];
            
            if (!processedEmps.has(item.empId)) {
                empData.records = empData.records.filter(r => r.date !== dateValue);
                processedEmps.add(item.empId);
            }
            
            const start = item.startTime;
            const end = item.endTime;
            const startMinutes = parseInt(start.substring(0, 2)) * 60 + parseInt(start.substring(2, 4));
            const endMinutes = parseInt(end.substring(0, 2)) * 60 + parseInt(end.substring(2, 4));
            let recognizedMinutes = Math.max(0, endMinutes - startMinutes);
            
            if (item.dayType === 'holiday' && recognizedMinutes >= 240) {
                const restPeriods = Math.floor(recognizedMinutes / 240);
                recognizedMinutes -= restPeriods * 30;
            }
            
            const newRecord = {
                date: dateValue,
                dayType: item.dayType || 'night',
                requestStart: start,
                requestEnd: end,
                actualStart: start,
                actualEnd: end,
                recognizedMinutes: recognizedMinutes,
                overtimeType: item.overtimeType,
                compensationType: item.compensationType,
                note: ''
            };
            
            empData.records.push(newRecord);
            savedCount++;
            
            empData.records.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (a.requestStart || '').localeCompare(b.requestStart || '');
            });
        });
        
        deletedEmps.forEach(empId => {
            if (data[String(year)]?.[String(month)]?.[empId]) {
                data[String(year)][String(month)][empId].records = 
                    data[String(year)][String(month)][empId].records.filter(r => r.date !== dateValue);
                deletedCount++;
            }
        });
        
        await OvertimeDB.saveOvertimeDaily(data);
        
        let message = '저장 완료!';
        if (savedCount > 0) message += `\n- 저장: ${savedCount}건`;
        if (deletedCount > 0) message += `\n- 삭제: ${deletedCount}명`;
        alert(message);
        
        loadExistingBulkRecords();
        loadOvertimeCalendar();
        
    } catch (e) {
        console.error('저장 실패:', e);
        alert('저장에 실패했습니다.');
    }
}

// ===== 일괄 입력: 전체 삭제 =====
async function clearBulkInput() {
    if (bulkInputData.length === 0) return;
    
    const dateValue = document.getElementById('bulkInputDate').value;
    if (!dateValue) return;
    
    if (!confirm(`${bulkInputData.length}개 행의 데이터를 모두 삭제하시겠습니까?\n\n⚠️ 저장된 기록도 함께 삭제됩니다.`)) return;
    
    try {
        const [year, month] = dateValue.split('-').map(Number);
        const data = await OvertimeDB.getOvertimeDaily();
        
        if (data[String(year)]?.[String(month)]) {
            for (const empId in data[String(year)][String(month)]) {
                const empData = data[String(year)][String(month)][empId];
                if (empData.records) {
                    empData.records = empData.records.filter(r => r.date !== dateValue);
                }
            }
            await OvertimeDB.saveOvertimeDaily(data);
        }
    } catch (e) {
        console.error('전체 삭제 실패:', e);
    }
    
    bulkInputData = [];
    bulkSelectedRows.clear();
    renderBulkInputTable();
    loadOvertimeCalendar();
    
    alert('해당 날짜의 모든 기록이 삭제되었습니다.');
}

// ===== 일괄 입력: 초기화 (저장된 기록만 다시 로드) =====
function resetBulkInput() {
    if (bulkInputData.length === 0) return;
    
    const hasUnsavedData = bulkInputData.some(d => d.startTime || d.endTime);
    if (hasUnsavedData) {
        if (!confirm('입력 중인 데이터가 있습니다.\n초기화하면 저장하지 않은 내용은 사라집니다.\n\n초기화하시겠습니까?')) return;
    }
    
    loadExistingBulkRecords();
}
