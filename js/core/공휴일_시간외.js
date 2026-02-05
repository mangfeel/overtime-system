/**
 * 공휴일_시간외.js - 공휴일 관리
 * 
 * 고정 공휴일 + 변동 공휴일 조회/추가/삭제
 * OvertimeDB를 통해 데이터 저장
 * 
 * @version 1.0.0
 * @since 2026-02-05
 * 
 * [의존성] 상수_시간외.js (FIXED_HOLIDAYS, DEFAULT_VARIABLE_HOLIDAYS)
 * [의존성] 데이터베이스_시간외.js (OvertimeDB)
 */

// 메모리 캐시 (매번 async 호출 방지)
let _variableHolidaysCache = null;

/**
 * 변동 공휴일 로드 (저장소 우선, 없으면 기본값)
 * @returns {Promise<Object>}
 */
async function loadVariableHolidays() {
    try {
        const saved = await OvertimeDB.getHolidays();
        if (saved) {
            _variableHolidaysCache = saved;
            return saved;
        }
    } catch (e) {
        console.error('공휴일 로드 실패:', e);
    }
    _variableHolidaysCache = { ...DEFAULT_VARIABLE_HOLIDAYS };
    return { ...DEFAULT_VARIABLE_HOLIDAYS };
}

/**
 * 변동 공휴일 저장
 * @param {Object} holidays - 연도별 공휴일 객체
 */
async function saveVariableHolidays(holidays) {
    try {
        await OvertimeDB.setHolidays(holidays);
        _variableHolidaysCache = holidays;
    } catch (e) {
        console.error('공휴일 저장 실패:', e);
    }
}

/**
 * 특정 날짜가 공휴일인지 확인 (동기 - 캐시 사용)
 * ⚠️ 호출 전 loadVariableHolidays()를 한 번 실행해야 함
 * @param {string} dateStr - YYYY-MM-DD 형식
 * @returns {Object|null} { isHoliday: boolean, name: string }
 */
function checkHoliday(dateStr) {
    if (!dateStr) return null;
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = date.getDay();
    
    // 토/일 체크
    if (dayOfWeek === 0) {
        return { isHoliday: true, name: '일요일' };
    }
    if (dayOfWeek === 6) {
        return { isHoliday: true, name: '토요일' };
    }
    
    // 고정 공휴일
    const fixedHoliday = FIXED_HOLIDAYS.find(h => h.month === month && h.day === day);
    if (fixedHoliday) {
        return { isHoliday: true, name: fixedHoliday.name };
    }
    
    // 변동 공휴일 (캐시 사용)
    const variableHolidays = _variableHolidaysCache || DEFAULT_VARIABLE_HOLIDAYS;
    const yearHolidays = variableHolidays[year] || [];
    const variableHoliday = yearHolidays.find(h => h.month === month && h.day === day);
    if (variableHoliday) {
        return { isHoliday: true, name: variableHoliday.name };
    }
    
    return { isHoliday: false, name: '' };
}

/**
 * 공휴일 추가
 * @param {number} year - 연도
 * @param {number} month - 월
 * @param {number} day - 일
 * @param {string} name - 공휴일명
 * @returns {Promise<boolean>} 성공 여부
 */
async function addHoliday(year, month, day, name) {
    const holidays = await loadVariableHolidays();
    if (!holidays[year]) {
        holidays[year] = [];
    }
    
    // 중복 체크
    const exists = holidays[year].some(h => h.month === month && h.day === day);
    if (exists) {
        alert('이미 등록된 날짜입니다.');
        return false;
    }
    
    holidays[year].push({ month, day, name });
    holidays[year].sort((a, b) => (a.month * 100 + a.day) - (b.month * 100 + b.day));
    await saveVariableHolidays(holidays);
    return true;
}

/**
 * 공휴일 삭제
 * @param {number} year - 연도
 * @param {number} month - 월
 * @param {number} day - 일
 * @returns {Promise<boolean>} 성공 여부
 */
async function removeHoliday(year, month, day) {
    const holidays = await loadVariableHolidays();
    if (!holidays[year]) return false;
    
    const index = holidays[year].findIndex(h => h.month === month && h.day === day);
    if (index === -1) return false;
    
    holidays[year].splice(index, 1);
    await saveVariableHolidays(holidays);
    return true;
}

/**
 * 전년도 공휴일 복사
 * @param {number} targetYear - 복사 대상 연도
 * @param {number} sourceYear - 복사 원본 연도
 * @returns {Promise<boolean>} 성공 여부
 */
async function copyPrevYearHolidays(targetYear, sourceYear) {
    const holidays = await loadVariableHolidays();
    const sourceHolidays = holidays[sourceYear];
    
    if (!sourceHolidays || sourceHolidays.length === 0) {
        alert(`${sourceYear}년 공휴일 데이터가 없습니다.`);
        return false;
    }
    
    if (!holidays[targetYear]) {
        holidays[targetYear] = [];
    }
    
    let addedCount = 0;
    sourceHolidays.forEach(h => {
        const exists = holidays[targetYear].some(eh => eh.month === h.month && eh.day === h.day);
        if (!exists) {
            holidays[targetYear].push({ month: h.month, day: h.day, name: h.name });
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        holidays[targetYear].sort((a, b) => (a.month * 100 + a.day) - (b.month * 100 + b.day));
        await saveVariableHolidays(holidays);
    }
    
    alert(`${sourceYear}년에서 ${addedCount}개 공휴일을 복사했습니다.`);
    return true;
}

console.log('[공휴일] 공휴일_시간외.js 로드 완료');
