/**
 * 설정_시간외.js - 설정 관리
 * 
 * 시간외근무 유형 활성화/비활성화, 주간/월간 제한 설정
 * OvertimeDB를 통해 데이터 저장
 * 
 * @version 1.0.1
 * @since 2026-02-05
 * 
 * [변경이력]
 * v1.0.1 - _overtimeSettingsCache + getEnabledOvertimeTypesSync() 추가 (동기 접근용)
 * 
 * [의존성] 상수_시간외.js (OVERTIME_TYPES, DEFAULT_ENABLED_TYPES)
 * [의존성] 데이터베이스_시간외.js (OvertimeDB)
 */

// ===== 설정 캐시 (초기화 시 로드, 이후 동기 접근) =====
let _overtimeSettingsCache = null;

// ===== 시간외근무 유형 설정 =====

/**
 * 활성화된 시간외근무 유형 목록 반환 (비동기)
 * @returns {Promise<Array>} OVERTIME_TYPES에서 활성화된 항목 배열
 */
async function getEnabledOvertimeTypes() {
    try {
        const settings = await OvertimeDB.getOvertimeSettings();
        const enabled = settings.enabledTypes || DEFAULT_ENABLED_TYPES;
        
        return Object.values(OVERTIME_TYPES).filter(type => enabled[type.code]);
    } catch (e) {
        console.error('시간외근무 유형 로드 실패:', e);
        return Object.values(OVERTIME_TYPES).filter(type => DEFAULT_ENABLED_TYPES[type.code]);
    }
}

/**
 * 활성화된 시간외근무 유형 목록 반환 (동기 - 캐시 사용)
 * 초기화 시 loadOvertimeTypeSettings()가 호출된 후 사용 가능
 * @returns {Array} OVERTIME_TYPES에서 활성화된 항목 배열
 */
function getEnabledOvertimeTypesSync() {
    const enabled = _overtimeSettingsCache || DEFAULT_ENABLED_TYPES;
    return Object.values(OVERTIME_TYPES).filter(type => enabled[type.code]);
}

/**
 * 시간외근무 유형 설정 불러오기
 * @returns {Promise<Object>} 활성화 상태 맵
 */
async function loadOvertimeTypeSettings() {
    try {
        const data = await OvertimeDB.getOvertimeSettings();
        _overtimeSettingsCache = data.enabledTypes || DEFAULT_ENABLED_TYPES;
        return _overtimeSettingsCache;
    } catch (e) {
        _overtimeSettingsCache = DEFAULT_ENABLED_TYPES;
        return _overtimeSettingsCache;
    }
}

/**
 * 시간외근무 유형 설정 저장 (체크박스 → 저장소)
 */
async function saveOvertimeTypeSettings() {
    const enabledTypes = {};
    
    Object.keys(OVERTIME_TYPES).forEach(code => {
        const checkbox = document.getElementById('type_' + code);
        enabledTypes[code] = checkbox ? checkbox.checked : false;
    });
    
    await OvertimeDB.setOvertimeSettings({ enabledTypes });
    
    // 캐시도 업데이트
    _overtimeSettingsCache = enabledTypes;
    
    alert('설정이 저장되었습니다.');
}

/**
 * 시간외근무 유형 설정 UI 렌더링
 */
async function renderOvertimeTypeSettings() {
    const settings = await loadOvertimeTypeSettings();
    const container = document.getElementById('overtimeTypeSettings');
    if (!container) return;
    
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

// ===== 제한 설정 =====

/**
 * 제한 설정 UI에서 불러오기
 */
async function loadLimitSettings() {
    const settings = await OvertimeDB.getLimitSettings();
    if (settings) {
        const weeklyEl = document.getElementById('weeklyLimitHours');
        const monthlyEl = document.getElementById('monthlyPayLimitHours');
        if (weeklyEl) weeklyEl.value = settings.weeklyLimit || 12;
        if (monthlyEl) monthlyEl.value = settings.monthlyPayLimit || 20;
    }
}

/**
 * 제한 설정 저장
 */
async function saveLimitSettings() {
    const weeklyLimit = parseInt(document.getElementById('weeklyLimitHours').value) || 12;
    const monthlyPayLimit = parseInt(document.getElementById('monthlyPayLimitHours').value) || 20;
    
    await OvertimeDB.setLimitSettings({ weeklyLimit, monthlyPayLimit });
    
    const statusEl = document.getElementById('limitSaveStatus');
    if (statusEl) {
        statusEl.textContent = '✅ 저장되었습니다';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
    }
}

/**
 * 제한 설정 가져오기 (보고서용)
 * @returns {Promise<Object>} { weeklyLimit, monthlyPayLimit }
 */
async function getLimitSettings() {
    const saved = await OvertimeDB.getLimitSettings();
    if (saved) {
        return saved;
    }
    return { weeklyLimit: 12, monthlyPayLimit: 20 };
}

console.log('[설정] 설정_시간외.js 로드 완료');
