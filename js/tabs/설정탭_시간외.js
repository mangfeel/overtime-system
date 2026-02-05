/**
 * 설정탭_시간외.js
 * 설정 탭 관련 기능 모듈
 * - 공휴일 관리 (연도별 변동 공휴일 CRUD, 전년도 복사)
 * - 시간외근무 유형 설정 (카테고리별 체크박스)
 * - 제한 설정 (주간/월간 한도)
 * - 시스템 정보 표시
 * 
 * 의존성:
 * - OvertimeDB (데이터베이스_시간외.js) - getVariableHolidays, saveVariableHolidays, getOvertimeSettings, saveOvertimeSettings, getLimitSettings, saveLimitSettings, getHRSalaryTables, getHRPositionAllowances
 * - OVERTIME_TYPES, FIXED_HOLIDAYS (상수_시간외.js)
 * - escapeHtml (유틸_시간외.js)
 * - HolidayManager.addHoliday, HolidayManager.removeHoliday (공휴일_시간외.js)
 * - loadOvertimeTypeSettings (설정_시간외.js)
 * - employees (전역 - 초기화_시간외.js)
 */

// ===== 공휴일 관리 =====

/**
 * 공휴일 연도 선택기 초기화
 */
function initHolidayYearSelector() {
    const select = document.getElementById('holidayYear');
    if (!select) return;
    
    const currentYear = new Date().getFullYear();
    const START_YEAR = 2025;
    const END_YEAR = 2044;
    
    select.innerHTML = '';
    for (let y = START_YEAR; y <= END_YEAR; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y + '년';
        if (y === Math.max(currentYear, START_YEAR)) option.selected = true;
        select.appendChild(option);
    }
    
    renderHolidayList();
}

/**
 * 공휴일 목록 렌더링
 */
async function renderHolidayList() {
    const year = parseInt(document.getElementById('holidayYear').value);
    const container = document.getElementById('holidayListContainer');
    
    // 고정 공휴일
    let html = `
        <div style="margin-bottom:20px;">
            <h4 style="font-size:14px;color:#6b7280;margin-bottom:10px;">📌 고정 공휴일 (매년 자동 적용)</h4>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
    `;
    
    FIXED_HOLIDAYS.forEach(h => {
        html += `<span class="badge badge-weekday" style="padding:6px 10px;">${h.month}/${h.day} ${h.name}</span>`;
    });
    
    html += `</div></div>`;
    
    // 변동 공휴일
    const holidays = await OvertimeDB.getVariableHolidays();
    const yearHolidays = holidays[year] || [];
    
    html += `
        <div>
            <h4 style="font-size:14px;color:#6b7280;margin-bottom:10px;">📅 ${year}년 변동 공휴일</h4>
    `;
    
    if (yearHolidays.length === 0) {
        html += `<div class="empty-state" style="padding:30px;"><div class="empty-state-text">등록된 공휴일이 없습니다</div></div>`;
    } else {
        html += `<div class="table-container"><table><thead><tr><th>날짜</th><th>요일</th><th>공휴일명</th><th>관리</th></tr></thead><tbody>`;
        
        yearHolidays.forEach(h => {
            const dateStr = `${year}-${String(h.month).padStart(2,'0')}-${String(h.day).padStart(2,'0')}`;
            const date = new Date(dateStr);
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const dayName = dayNames[date.getDay()];
            
            html += `
                <tr>
                    <td>${h.month}월 ${h.day}일</td>
                    <td>${dayName}요일</td>
                    <td>${escapeHtml(h.name)}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="deleteHoliday(${year}, ${h.month}, ${h.day})">🗑️</button>
                    </td>
                </tr>
            `;
        });
        
        html += `</tbody></table></div>`;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

/**
 * 공휴일 추가 모달 열기
 */
function openAddHolidayModal() {
    const year = document.getElementById('holidayYear').value;
    document.getElementById('newHolidayDate').value = `${year}-01-01`;
    document.getElementById('newHolidayName').value = '';
    document.getElementById('holidayModal').classList.add('active');
}

/**
 * 공휴일 모달 닫기
 */
function closeHolidayModal() {
    document.getElementById('holidayModal').classList.remove('active');
}

/**
 * 새 공휴일 저장
 */
async function saveNewHoliday() {
    const dateValue = document.getElementById('newHolidayDate').value;
    const name = document.getElementById('newHolidayName').value.trim();
    
    if (!dateValue || !name) {
        alert('날짜와 공휴일명을 모두 입력해주세요.');
        return;
    }
    
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if (await HolidayManager.addHoliday(year, month, day, name)) {
        closeHolidayModal();
        // 해당 연도로 이동
        document.getElementById('holidayYear').value = year;
        await renderHolidayList();
        alert('공휴일이 추가되었습니다.');
    }
}

/**
 * 공휴일 삭제
 */
async function deleteHoliday(year, month, day) {
    if (!confirm('이 공휴일을 삭제하시겠습니까?')) return;
    
    if (await HolidayManager.removeHoliday(year, month, day)) {
        await renderHolidayList();
    }
}

/**
 * 전년도 공휴일 복사
 */
async function copyPrevYearHolidays() {
    const currentYear = parseInt(document.getElementById('holidayYear').value);
    const prevYear = currentYear - 1;
    
    const holidays = await OvertimeDB.getVariableHolidays();
    const prevHolidays = holidays[prevYear] || [];
    
    if (prevHolidays.length === 0) {
        alert(`${prevYear}년에 등록된 공휴일이 없습니다.`);
        return;
    }
    
    if (!confirm(`${prevYear}년 공휴일 ${prevHolidays.length}개를 ${currentYear}년으로 복사하시겠습니까?\n\n※ 날짜만 복사되며, 실제 공휴일 날짜는 매년 다르므로 반드시 수정이 필요합니다.`)) {
        return;
    }
    
    // 기존 데이터 유지하면서 복사
    if (!holidays[currentYear]) {
        holidays[currentYear] = [];
    }
    
    let addedCount = 0;
    prevHolidays.forEach(h => {
        const exists = holidays[currentYear].some(existing => 
            existing.month === h.month && existing.day === h.day
        );
        if (!exists) {
            holidays[currentYear].push({ ...h });
            addedCount++;
        }
    });
    
    holidays[currentYear].sort((a, b) => (a.month * 100 + a.day) - (b.month * 100 + b.day));
    await OvertimeDB.saveVariableHolidays(holidays);
    await renderHolidayList();
    
    alert(`${addedCount}개의 공휴일이 복사되었습니다.`);
}

// ===== 시간외근무 유형 설정 =====

/**
 * 시간외근무 유형 설정 저장
 */
async function saveOvertimeTypeSettings() {
    const enabledTypes = {};
    
    Object.keys(OVERTIME_TYPES).forEach(code => {
        const checkbox = document.getElementById('type_' + code);
        enabledTypes[code] = checkbox ? checkbox.checked : false;
    });
    
    await OvertimeDB.saveOvertimeSettings({ enabledTypes });
    alert('설정이 저장되었습니다.');
}

/**
 * 시간외근무 유형 설정 렌더링
 */
async function renderOvertimeTypeSettings() {
    const settings = await loadOvertimeTypeSettings();
    const container = document.getElementById('overtimeTypeSettings');
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;">';
    
    // 조근
    html += '<div class="card"><div class="card-title">🌅 조근 (오전~오후)</div>';
    Object.values(OVERTIME_TYPES).filter(t => t.category === 'morning').forEach(type => {
        html += `
            <label style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">
                <input type="checkbox" id="type_${type.code}" ${settings[type.code] ? 'checked' : ''}>
                <span>${type.name}</span>
                <small style="color:#6b7280;">(${type.rate}배)</small>
            </label>
        `;
    });
    html += '</div>';
    
    // 야근
    html += '<div class="card"><div class="card-title">🌙 야근 (저녁~야간)</div>';
    Object.values(OVERTIME_TYPES).filter(t => t.category === 'night').forEach(type => {
        html += `
            <label style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">
                <input type="checkbox" id="type_${type.code}" ${settings[type.code] ? 'checked' : ''}>
                <span>${type.name}</span>
                <small style="color:#6b7280;">(${type.rate}배)</small>
            </label>
        `;
    });
    html += '</div>';
    
    // 휴일
    html += '<div class="card"><div class="card-title">🎌 휴일 근무</div>';
    Object.values(OVERTIME_TYPES).filter(t => t.category === 'holiday').forEach(type => {
        html += `
            <label style="display:flex;align-items:center;gap:10px;padding:8px;cursor:pointer;">
                <input type="checkbox" id="type_${type.code}" ${settings[type.code] ? 'checked' : ''}>
                <span>${type.name}</span>
                <small style="color:#6b7280;">(${type.rate}배)</small>
            </label>
        `;
    });
    html += '</div>';
    
    html += '</div>';
    container.innerHTML = html;
}

// ===== 제한 설정 관리 =====

/**
 * 제한 설정 불러오기
 */
async function loadLimitSettings() {
    const saved = await OvertimeDB.getLimitSettings();
    if (saved) {
        document.getElementById('weeklyLimitHours').value = saved.weeklyLimit || 12;
        document.getElementById('monthlyPayLimitHours').value = saved.monthlyPayLimit || 20;
    }
}

/**
 * 제한 설정 저장
 */
async function saveLimitSettings() {
    const weeklyLimit = parseInt(document.getElementById('weeklyLimitHours').value) || 12;
    const monthlyPayLimit = parseInt(document.getElementById('monthlyPayLimitHours').value) || 20;
    
    const settings = { weeklyLimit, monthlyPayLimit };
    await OvertimeDB.saveLimitSettings(settings);
    
    document.getElementById('limitSaveStatus').textContent = '✅ 저장되었습니다';
    setTimeout(() => {
        document.getElementById('limitSaveStatus').textContent = '';
    }, 2000);
}

/**
 * 제한 설정 가져오기
 */
async function getLimitSettings() {
    const saved = await OvertimeDB.getLimitSettings();
    if (saved) {
        return saved;
    }
    return { weeklyLimit: 12, monthlyPayLimit: 20 };
}

// ===== 시스템 정보 =====

/**
 * 시스템 정보 로드 (설정 탭 초기화 시 호출)
 */
async function loadSystemInfo() {
    renderOvertimeTypeSettings();
    initHolidayYearSelector();  // 공휴일 연도 선택기 초기화
    
    const container = document.getElementById('systemInfo');
    
    try {
        // employees는 전역 변수 (초기화_시간외.js에서 로드)
        const employeeCount = (typeof employees !== 'undefined' && employees) ? employees.length : 0;
        
        const salaryTables = await OvertimeDB.getHRSalaryTables();
        const salaryYears = Object.keys(salaryTables).sort().reverse();
        
        const positionAllowances = await OvertimeDB.getHRPositionAllowances();
        const allowanceYears = Object.keys(positionAllowances).sort().reverse();
        
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">
                <div class="stat-card">
                    <div class="stat-card-title">등록 직원 수</div>
                    <div class="stat-card-value">${employeeCount}명</div>
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
                    <div class="stat-card-sub">데스크탑 앱</div>
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
