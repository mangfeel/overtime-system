/**
 * 유틸_시간외.js - 공통 유틸리티 함수
 * 
 * 시간 포맷, 통화 포맷, HTML escape, 시간 입력 처리 등
 * 
 * @version 1.0.0
 * @since 2026-02-05
 */

// ===== 시간 포맷 =====

/**
 * 분을 HH:MM 형식으로 변환
 * @param {number} totalMin - 총 분
 * @returns {string} "02:30"
 */
function formatTimeFromMinutes(totalMin) {
    const hour = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * 분을 "N시간M분" 형식으로 변환
 * @param {number} minutes - 총 분
 * @returns {string} "3시간" 또는 "2시간30분"
 */
function formatMinutesToTime(minutes) {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}시간${m > 0 ? m + '분' : ''}`;
}

/**
 * 4자리 시간 문자열을 HH:MM으로 변환
 * @param {string} time - "1830"
 * @returns {string} "18:30"
 */
function formatTime(time) {
    if (!time) return '';
    const str = String(time).padStart(4, '0');
    return str.substring(0, 2) + ':' + str.substring(2);
}

/**
 * 시간 범위 포맷
 * @param {string} start - "0700"
 * @param {string} end - "1800"
 * @returns {string} "07:00 ~ 18:00"
 */
function formatTimeRange(start, end) {
    if (!start || !end) return '-';
    return formatTime(start) + ' ~ ' + formatTime(end);
}

/**
 * 시간 입력값 포맷 (input용)
 * @param {string} time - "1830"
 * @returns {string} "18:30"
 */
function formatTimeForInput(time) {
    if (!time) return '';
    const str = String(time).padStart(4, '0');
    return str.substring(0, 2) + ':' + str.substring(2);
}

/**
 * 시간 값 포맷 (다양한 자릿수 처리)
 * @param {string} value - "8", "18", "830", "1830"
 * @returns {string} "HH:MM" 또는 ""
 */
function formatTimeValue(value) {
    if (!value) return '';
    
    let v = String(value).replace(/[^0-9]/g, '');
    
    if (v.length === 1) v = '0' + v + '00';
    else if (v.length === 2) v = v + '00';
    else if (v.length === 3) v = '0' + v;
    
    if (v.length < 4) return '';
    
    const hour = v.substring(0, 2);
    const minute = v.substring(2, 4);
    
    return `${hour}:${minute}`;
}

/**
 * 시간 자릿수 정리 (4자리로 패딩)
 * @param {string} digits - "8", "18", "830", "1830"
 * @returns {string} "0800", "1800", "0830", "1830"
 */
function formatTimeDigits(digits) {
    if (!digits) return '';
    let v = String(digits).replace(/[^0-9]/g, '');
    if (v.length === 1) v = '0' + v + '00';
    else if (v.length === 2) v = v + '00';
    else if (v.length === 3) v = '0' + v;
    return v;
}

// ===== 통화 포맷 =====

/**
 * 금액 포맷 (원 단위)
 * @param {number} amount - 금액
 * @returns {string} "1,234,567원" 또는 "-"
 */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return Math.round(amount).toLocaleString() + '원';
}

// ===== 근무구분 =====

/**
 * 근무구분 코드를 표시명으로 변환
 * @param {string} dayType - 'morning' | 'night' | 'holiday'
 * @returns {string} '조근' | '야근' | '휴일'
 */
function getDayTypeName(dayType) {
    switch (dayType) {
        case 'morning': return '조근';
        case 'night': return '야근';
        case 'holiday': return '휴일';
        default: return dayType;
    }
}

// ===== HTML/텍스트 유틸 =====

/**
 * HTML 이스케이프
 * @param {string} text - 원본 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 시간 입력 처리 =====

/**
 * 시간 input의 시간 표시 업데이트
 * @param {HTMLInputElement} input - 시간 입력 요소
 */
function updateTimeDisplay(input) {
    const displayId = input.id + 'Display';
    const display = document.getElementById(displayId);
    if (!display) return;
    
    const value = input.value;
    if (!value || value.length < 3) {
        display.textContent = '';
        return;
    }
    
    const formatted = formatTimeValue(value);
    display.textContent = formatted ? `→ ${formatted}` : '';
}

/**
 * 시간 입력 이벤트 처리 (숫자만 허용)
 * @param {HTMLInputElement} input - 시간 입력 요소
 */
function onTimeInput(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    updateTimeDisplay(input);
}

/**
 * 시간 입력 포맷 (blur 시)
 * @param {HTMLInputElement} input - 시간 입력 요소
 */
function formatTimeInput(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    
    if (value === '') {
        updateTimeDisplay(input);
        return;
    }
    
    if (value.length === 1) {
        value = '0' + value + '00';
    } else if (value.length === 2) {
        value = value + '00';
    } else if (value.length === 3) {
        value = '0' + value;
    }
    
    // 유효성 검사
    const hour = parseInt(value.substring(0, 2));
    const minute = parseInt(value.substring(2, 4));
    
    if (hour > 23) value = '23' + value.substring(2);
    if (minute > 59) value = value.substring(0, 2) + '59';
    
    input.value = value;
    updateTimeDisplay(input);
}

/**
 * 시간 input에서 4자리 값 가져오기
 * @param {string} inputId - input 요소 ID
 * @returns {string} "1830" 형식 4자리
 */
function getTimeInputValue(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value) return '';
    
    let value = input.value.replace(/[^0-9]/g, '');
    
    if (value.length === 1) value = '0' + value + '00';
    else if (value.length === 2) value = value + '00';
    else if (value.length === 3) value = '0' + value;
    
    return value;
}

/**
 * 시간 input에 값 설정
 * @param {string} inputId - input 요소 ID
 * @param {string} value - "1830" 형식
 */
function setTimeInputValue(inputId, value) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.value = value || '';
    updateTimeDisplay(input);
}

// ===== 근태/시간외 공통 =====

/**
 * 근태 데이터에서 특정 직원의 퇴근 시간 가져오기
 * @param {Object} attendanceData - 전체 근태 데이터
 * @param {string} empId - 직원 ID
 * @param {string} dateStr - 날짜 (YYYY-MM-DD)
 * @returns {string|null} 퇴근 시간 (HH:MM) 또는 null
 */
function getAttendanceCheckOut(attendanceData, empId, dateStr) {
    try {
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        
        const record = attendanceData[year]?.[month]?.[empId]?.[dateStr];
        if (record && record.checkOut && !record.absent) {
            return record.checkOut;
        }
        return null;
    } catch (e) {
        console.error('근태 데이터 조회 실패:', e);
        return null;
    }
}

/**
 * 실제 퇴근 시간 기반 인정시간 계산
 * @param {Object} record - 시간외근무 레코드
 * @param {Object} attendanceData - 전체 근태 데이터
 * @param {string} empId - 직원 ID
 * @param {string} dateStr - 날짜
 * @returns {Object} { minutes, adjusted, reason, noAttendance? }
 */
function calculateActualRecognizedMinutes(record, attendanceData, empId, dateStr) {
    const requestedMinutes = record.recognizedMinutes || 0;
    
    // 휴일근무는 퇴근 시간과 무관하게 신청 시간 그대로
    if (record.dayType === 'holiday') {
        return { minutes: requestedMinutes, adjusted: false, reason: '' };
    }
    
    const checkOut = getAttendanceCheckOut(attendanceData, empId, dateStr);
    if (!checkOut) {
        return { 
            minutes: requestedMinutes, 
            adjusted: false, 
            reason: '근태미등록',
            noAttendance: true
        };
    }
    
    const startTime = record.requestStart || record.actualStart;
    if (!startTime) {
        return { minutes: requestedMinutes, adjusted: false, reason: '' };
    }
    
    // 시작 시간을 분으로 변환
    const startMinutes = parseInt(startTime.substring(0, 2)) * 60 + parseInt(startTime.substring(2, 4));
    
    // 퇴근 시간을 분으로 변환
    const checkOutParts = checkOut.split(':');
    const checkOutMinutes = parseInt(checkOutParts[0]) * 60 + parseInt(checkOutParts[1]);
    
    // 실제 근무 가능 시간
    const actualPossibleMinutes = Math.max(0, checkOutMinutes - startMinutes);
    
    // 1시간 단위 내림
    const actualPossibleRounded = Math.floor(actualPossibleMinutes / 60) * 60;
    
    // 인정 시간 = min(신청, 실제)
    const actualMinutes = Math.min(requestedMinutes, actualPossibleRounded);
    
    const adjusted = actualMinutes < requestedMinutes;
    let reason = '';
    if (adjusted) {
        const actualHours = Math.floor(actualPossibleMinutes / 60);
        const actualMins = actualPossibleMinutes % 60;
        reason = `퇴근 ${checkOut}, 실제 ${actualHours}시간 ${actualMins}분 근무`;
    }
    
    return {
        minutes: actualMinutes,
        adjusted: adjusted,
        reason: reason,
        requestedMinutes: requestedMinutes,
        checkOutTime: checkOut
    };
}

// ===== 직원 근무시간/제한 =====

/**
 * 직원의 해당 날짜 정규 근무시간 조회
 * @param {string} empId - 직원 ID
 * @param {string} dateValue - 날짜 (YYYY-MM-DD)
 * @param {Array} employeeList - 직원 목록 (HRData에서 가져온)
 * @returns {Object} { workStart, workEnd, dailyHours, isReduced, reductionType }
 */
function getEmployeeWorkSchedule(empId, dateValue, employeeList) {
    const defaultSchedule = {
        workStart: '09:00',
        workEnd: '18:00',
        dailyHours: 8,
        isReduced: false,
        reductionType: null
    };
    
    try {
        const emp = (employeeList || employees).find(e => e.id === empId);
        if (!emp) return defaultSchedule;
        
        const date = new Date(dateValue);
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayOfWeek = dayNames[date.getDay()];
        
        // 1. 육아기 단축근로
        if (emp.reducedWork?.childcare?.length > 0) {
            const active = emp.reducedWork.childcare.find(r => 
                r.startDate <= dateValue && r.endDate >= dateValue
            );
            if (active) {
                let schedule;
                if (active.scheduleType === 'uniform' && active.uniformSchedule) {
                    schedule = active.uniformSchedule;
                } else if (active.schedule && active.schedule[dayOfWeek]) {
                    schedule = active.schedule[dayOfWeek];
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
        
        // 2. 임신기 단축근로 (시간외근무 금지)
        if (emp.reducedWork?.pregnancy?.length > 0) {
            const active = emp.reducedWork.pregnancy.find(r => 
                r.startDate <= dateValue && r.endDate >= dateValue
            );
            if (active) {
                return {
                    workStart: active.workStart || '11:00',
                    workEnd: active.workEnd || '18:00',
                    dailyHours: 6,
                    isReduced: true,
                    reductionType: 'pregnancy',
                    overtimeForbidden: true
                };
            }
        }
        
        // 3. 10시 출근제
        if (emp.reducedWork?.flexTime?.length > 0) {
            const active = emp.reducedWork.flexTime.find(r => 
                r.startDate <= dateValue && r.endDate >= dateValue
            );
            if (active) {
                return {
                    workStart: active.workStart || '10:00',
                    workEnd: active.workEnd || '19:00',
                    dailyHours: 8,
                    isReduced: true,
                    reductionType: 'flexTime'
                };
            }
        }
        
        // 4. 단시간 근로자
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
                workStart, workEnd, dailyHours, weeklyHours,
                isReduced: true,
                reductionType: 'partTime'
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
function getEmployeeMaxOvertimeMinutes(empId, dateValue, employeeList) {
    const schedule = getEmployeeWorkSchedule(empId, dateValue, employeeList);
    
    if (schedule.overtimeForbidden) {
        return { maxMinutes: 0, reason: '임신기 근로자 (시간외근무 금지)', forbidden: true };
    }
    
    if (!schedule.isReduced && schedule.dailyHours >= 8) {
        return { maxMinutes: 180, reason: '정규 8시간 근무자', forbidden: false, schedule };
    }
    
    const nightLimitMinutes = 21 * 60;
    const morningStartLimit = 7 * 60;
    const maxTotalRange = nightLimitMinutes - morningStartLimit;
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
        schedule
    };
}

/**
 * 직원이 시간외근무 등록 가능한지 확인
 */
function checkOvertimeAllowed(empId, dateValue, totalOvertimeMinutes, employeeList) {
    const maxInfo = getEmployeeMaxOvertimeMinutes(empId, dateValue, employeeList);
    
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

console.log('[유틸] 유틸_시간외.js 로드 완료');
