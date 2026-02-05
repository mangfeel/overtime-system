/**
 * 근태관리_시간외.js
 * 근태 데이터 관리 모듈
 * - 근태 데이터 파싱 (형식1: 이름/출퇴근, 형식2: 날짜별 그룹)
 * - 직원 매칭 (이름 + 생년월일, 동명이인 처리)
 * - 달력 형식 근태 현황
 * - 근태 기록 CRUD (수정, 삭제, 수동 추가)
 * - 월 전체 삭제, 특정 날짜 삭제
 * 
 * 의존성:
 * - OvertimeDB (데이터베이스_시간외.js) - getAttendance, saveAttendance
 * - ATTENDANCE_KEY (상수_시간외.js)
 * - escapeHtml (유틸_시간외.js)
 * - SalaryCalculator.getAssignmentAtDate (급여계산_시간외.js)
 * - checkHoliday (공휴일_시간외.js)
 * - employees (전역 - 초기화_시간외.js)
 */

// ===== 모듈 상태 변수 =====

// 파싱된 근태 데이터 임시 저장
let parsedAttendanceData = [];

// 달력에서 선택된 날짜
let selectedCalendarDate = null;

// ===== 날짜 유틸리티 =====

/**
 * 다양한 날짜 형식을 YYYY-MM-DD로 표준화
 * 지원 형식: 2025-11-01, 2025/11/01, 2025.11.01, 2025/1/1, 2025.1.1 등
 * @param {string} dateStr - 원본 날짜 문자열
 * @returns {string|null} YYYY-MM-DD 형식 또는 null
 */
function normalizeDate(dateStr) {
    if (!dateStr) return null;
    
    const dateMatch = dateStr.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (dateMatch) {
        const year = dateMatch[1];
        const month = String(parseInt(dateMatch[2])).padStart(2, '0');
        const day = String(parseInt(dateMatch[3])).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return null;
}

/**
 * 날짜 문자열이 유효한 날짜 형식인지 확인
 * @param {string} str - 확인할 문자열
 * @returns {boolean}
 */
function isDateFormat(str) {
    if (!str) return false;
    return /^\d{4}[-\/.]?\d{1,2}[-\/.]?\d{1,2}$/.test(str.trim());
}

// ===== 근태 데이터 파싱 =====

/**
 * 근태 데이터 파싱 (메인 진입점)
 * 두 가지 형식 자동 감지:
 * - 형식 1: 이름 \t 출근일시 \t 퇴근일시
 * - 형식 2: 날짜 행 + 생년월일 \t 이름 \t 출근 \t 퇴근
 */
function parseAttendanceData() {
    const textarea = document.getElementById('attendancePasteArea');
    const rawText = textarea.value.trim();
    
    if (!rawText) {
        alert('붙여넣은 데이터가 없습니다.');
        return;
    }
    
    const lines = rawText.split('\n').filter(line => line.trim());
    parsedAttendanceData = [];
    
    // 형식 감지: 첫 줄이 순수 날짜 형식인지 확인
    const firstLine = lines[0].trim();
    const isFormat2 = /^\d{4}[-\/.]?\d{1,2}[-\/.]?\d{1,2}\s*$/.test(firstLine);
    
    if (isFormat2) {
        parseFormat2(lines);
    } else {
        parseFormat1(lines);
    }
    
    // 직원 매칭
    matchEmployees();
    
    // 미리보기 렌더링
    renderAttendancePreview();
}

/**
 * 형식 1 파싱:
 * - 3컬럼: 이름 \t 출근일시 \t 퇴근일시
 * - 5컬럼: 이름 \t 근무일자 \t 카드번호 \t 출근일시 \t 퇴근일시
 * - 미출근: 이름 \t 근무일자 \t 카드번호 (출퇴근 시간 없음)
 */
function parseFormat1(lines) {
    lines.forEach(line => {
        const parts = line.split(/\t/).map(p => p.trim());
        
        console.log('파싱 라인:', line);
        console.log('분리된 parts:', parts, '길이:', parts.length);
        
        if (parts.length < 3) return;
        
        const name = parts[0];
        let date = null;
        let checkIn = '';
        let checkOut = '';
        let isAbsent = false;
        let birthDate = '';
        
        const normalizedDate = normalizeDate(parts[1]);
        const isPureDateFormat = normalizedDate && !parts[1].includes(':');
        
        if (isPureDateFormat) {
            // 5컬럼 형식 또는 미출근
            date = normalizedDate;
            
            // 카드번호에서 생년월일 추출 (앞 6자리 = YYMMDD)
            if (parts[2]) {
                const cardNumber = parts[2].replace(/[-*\s]/g, '');
                const birthMatch = cardNumber.match(/^(\d{6})/);
                if (birthMatch) {
                    const yymmdd = birthMatch[1];
                    const mm = parseInt(yymmdd.substring(2, 4));
                    const dd = parseInt(yymmdd.substring(4, 6));
                    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                        birthDate = yymmdd;
                        console.log('→ 카드번호에서 생년월일 추출:', birthDate);
                    }
                }
            }
            
            // 출퇴근 시간 추출
            if (parts.length >= 4 && parts[3]) {
                const checkInMatch = parts[3].match(/(\d{1,2}:\d{2})/);
                if (checkInMatch) checkIn = checkInMatch[1];
            }
            if (parts.length >= 5 && parts[4]) {
                const checkOutMatch = parts[4].match(/(\d{1,2}:\d{2})/);
                if (checkOutMatch) checkOut = checkOutMatch[1];
            }
            
            // 출퇴근 시간이 모두 없으면 미출근
            if (!checkIn && !checkOut) {
                isAbsent = true;
                console.log('→ 미출근 처리:', name, date);
            }
        } else {
            // 3컬럼 형식 (이름, 출근일시, 퇴근일시)
            const checkInDateTimeMatch = parts[1].match(/(\d{4}[-\/.]?\d{1,2}[-\/.]?\d{1,2})\s+(\d{1,2}:\d{2})/);
            const checkOutDateTimeMatch = parts[2]?.match(/(\d{4}[-\/.]?\d{1,2}[-\/.]?\d{1,2})\s+(\d{1,2}:\d{2})/);
            
            if (checkInDateTimeMatch) {
                date = normalizeDate(checkInDateTimeMatch[1]);
                checkIn = checkInDateTimeMatch[2];
            }
            if (checkOutDateTimeMatch) {
                if (!date) date = normalizeDate(checkOutDateTimeMatch[1]);
                checkOut = checkOutDateTimeMatch[2];
            }
        }
        
        if (name && date) {
            parsedAttendanceData.push({
                name,
                date,
                checkIn,
                checkOut,
                absent: isAbsent,
                birthDate,
                empId: null,
                matched: false
            });
            console.log('추가됨:', name, date, checkIn || '(없음)', checkOut || '(없음)', birthDate ? `[${birthDate}]` : '', isAbsent ? '★미출근★' : '');
        }
    });
    
    console.log('총 파싱 결과:', parsedAttendanceData.length, '건');
}

/**
 * 형식 2 파싱: 날짜 행 + 생년월일 \t 이름 \t 출근 \t 퇴근
 */
function parseFormat2(lines) {
    let currentDate = null;
    
    lines.forEach(line => {
        const trimmed = line.trim();
        
        // 날짜 행 감지
        const dateMatch = trimmed.match(/^(\d{4}[-\/.]?\d{1,2}[-\/.]?\d{1,2})\s*$/);
        if (dateMatch) {
            currentDate = normalizeDate(dateMatch[1]);
            return;
        }
        
        if (!currentDate) return;
        
        // 데이터 행 파싱
        const parts = line.split('\t').map(p => p.trim()).filter(p => p);
        if (parts.length < 2) return;
        
        let birthDate = '';
        let name = '';
        let checkIn = '';
        let checkOut = '';
        let hasInvalidTime = false;
        
        parts.forEach((part, idx) => {
            // 생년월일 (6자리 숫자)
            if (/^\d{6}$/.test(part) && !birthDate) {
                birthDate = part;
            }
            // --:--:-- 형식 감지 (미출근 표시)
            else if (/^--:--:--$/.test(part) || /^-+:-+:-+$/.test(part)) {
                hasInvalidTime = true;
            }
            // 시간 형식 (HH:MM:SS 또는 HH:MM)
            else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(part)) {
                if (!checkIn) {
                    checkIn = part.substring(0, 5);
                } else if (!checkOut) {
                    checkOut = part.substring(0, 5);
                }
            }
            // 이름 (한글)
            else if (/^[가-힣]{2,4}$/.test(part) && !name) {
                name = part;
            }
        });
        
        if (!name) return;
        
        const isAbsent = hasInvalidTime || (!checkIn && !checkOut);
        
        if (name && currentDate) {
            parsedAttendanceData.push({
                name,
                birthDate,
                date: currentDate,
                checkIn: checkIn || '',
                checkOut: checkOut || '',
                absent: isAbsent,
                empId: null,
                matched: false
            });
            
            if (isAbsent) {
                console.log('→ 미출근 처리 (형식2):', name, currentDate);
            }
        }
    });
}

// ===== 직원 매칭 =====

/**
 * 직원 매칭
 * employees 전역 변수 사용 (초기화_시간외.js에서 로드)
 */
function matchEmployees() {
    try {
        // employees는 전역 변수 (초기화_시간외.js에서 로드)
        if (!employees || employees.length === 0) {
            console.log('⚠️ 직원 데이터가 없습니다!');
            return;
        }
        
        console.log('직원 수:', employees.length);
        console.log('파싱된 데이터 수:', parsedAttendanceData.length);
        console.log('첫 직원 예시:', employees[0]?.personalInfo?.name || employees[0]?.name);
        
        parsedAttendanceData.forEach(record => {
            // 해당 날짜에 재직 중인 직원만 필터링
            const activeEmployees = employees.filter(e => {
                const entryDate = e.employment?.entryDate;
                const retireDate = e.employment?.retirementDate;
                
                if (entryDate && record.date < entryDate) return false;
                if (retireDate && record.date > retireDate) return false;
                
                return true;
            });
            
            // 이름으로 매칭
            const nameMatches = activeEmployees.filter(e => {
                const empName = e.personalInfo?.name || e.name || '';
                return empName === record.name;
            });
            
            let emp = null;
            
            if (nameMatches.length === 1) {
                emp = nameMatches[0];
            } else if (nameMatches.length > 1) {
                // 동명이인: 생년월일로 추가 매칭
                console.log(`⚠️ 동명이인 ${nameMatches.length}명 발견:`, record.name);
                
                if (record.birthDate) {
                    emp = nameMatches.find(e => {
                        const empBirth = e.personalInfo?.birthDate || '';
                        if (empBirth) {
                            const empYYMMDD = empBirth.replace(/\D/g, '').substring(2, 8);
                            return empYYMMDD === record.birthDate;
                        }
                        return false;
                    });
                    
                    if (emp) {
                        console.log('  → 생년월일로 매칭:', record.birthDate);
                    }
                }
                
                // 생년월일로도 매칭 안 되면 동명이인 경고 플래그
                if (!emp) {
                    record.hasSameNameIssue = true;
                    record.sameNameCandidates = nameMatches.map(e => {
                        const assignment = SalaryCalculator.getAssignmentAtDate(e, record.date);
                        return {
                            id: e.id,
                            name: e.personalInfo?.name || e.name,
                            uniqueCode: e.personalInfo?.uniqueCode || '',
                            dept: assignment?.department || assignment?.dept || e.currentPosition?.dept || '',
                            entryDate: e.employment?.entryDate || ''
                        };
                    });
                    console.log('  → 동명이인 선택 필요');
                }
            }
            
            // 이름 매칭 실패 시 생년월일로 매칭 시도
            if (!emp && record.birthDate && nameMatches.length === 0) {
                emp = activeEmployees.find(e => {
                    const empBirth = e.personalInfo?.birthDate || '';
                    if (empBirth) {
                        const empYYMMDD = empBirth.replace(/\D/g, '').substring(2, 8);
                        return empYYMMDD === record.birthDate;
                    }
                    return false;
                });
            }
            
            if (emp) {
                record.empId = emp.id;
                record.matched = true;
                const assignment = SalaryCalculator.getAssignmentAtDate(emp, record.date);
                record.dept = assignment?.department || assignment?.dept || emp.currentPosition?.dept || '';
                record.uniqueCode = emp.personalInfo?.uniqueCode || '';
                record.entryDate = emp.employment?.entryDate || '';
                console.log('✓ 매칭:', record.name, record.uniqueCode || '', '부서:', record.dept);
            } else if (!record.hasSameNameIssue) {
                console.log('✗ 미매칭:', record.name);
            }
        });
        
        const matchedCount = parsedAttendanceData.filter(r => r.matched).length;
        const sameNameCount = parsedAttendanceData.filter(r => r.hasSameNameIssue).length;
        console.log('총 매칭 결과:', matchedCount, '/', parsedAttendanceData.length);
        if (sameNameCount > 0) {
            console.log('⚠️ 동명이인 선택 필요:', sameNameCount, '건');
        }
        
    } catch (e) {
        console.error('직원 매칭 오류:', e);
    }
}

// ===== 미리보기 렌더링 =====

/**
 * 파싱 결과 미리보기 렌더링
 */
async function renderAttendancePreview() {
    const container = document.getElementById('attendancePreviewContainer');
    
    console.log('렌더링 시작, 데이터 수:', parsedAttendanceData.length);
    
    if (parsedAttendanceData.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <span>⚠️</span>
                <span>파싱된 데이터가 없습니다. 입력 형식을 확인해주세요.</span>
            </div>
        `;
        return;
    }
    
    // 시스템 설정 년도/월
    const systemYear = document.getElementById('attendanceYear').value;
    const systemMonth = document.getElementById('attendanceMonth').value;
    
    // 기존 저장된 데이터 로드
    const attendanceData = await OvertimeDB.getAttendance();
    
    // 각 레코드에 검증 플래그 추가
    const uniqueDates = [...new Set(parsedAttendanceData.map(r => r.date))];
    const existingDates = uniqueDates.filter(dateStr => {
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        if (attendanceData[year]?.[month]) {
            const monthData = attendanceData[year][month];
            return Object.values(monthData).some(emp => emp[dateStr]);
        }
        return false;
    });
    
    const matchedCount = parsedAttendanceData.filter(r => r.matched).length;
    const unmatchedCount = parsedAttendanceData.filter(r => !r.matched && !r.hasSameNameIssue).length;
    const sameNameCount = parsedAttendanceData.filter(r => r.hasSameNameIssue).length;
    const absentCount = parsedAttendanceData.filter(r => r.absent).length;
    const presentCount = parsedAttendanceData.filter(r => !r.absent).length;
    
    // 년도/월 불일치 체크
    const mismatchedDates = uniqueDates.filter(dateStr => {
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        return year !== systemYear || month !== systemMonth;
    });
    
    console.log('렌더링: 매칭', matchedCount, '미매칭', unmatchedCount, '동명이인', sameNameCount, '출근', presentCount, '미출근', absentCount);
    console.log('년도/월 불일치:', mismatchedDates, '중복 날짜:', existingDates);
    
    // 경고 메시지 생성
    let warningHtml = '';
    if (mismatchedDates.length > 0) {
        warningHtml += `
            <div class="alert alert-error" style="margin-bottom:10px;">
                <span>🚫</span>
                <span><strong>년도/월 불일치!</strong> 시스템 설정(${systemYear}년 ${systemMonth}월)과 다른 날짜: ${mismatchedDates.join(', ')}</span>
            </div>
        `;
    }
    if (existingDates.length > 0) {
        warningHtml += `
            <div class="alert alert-warning" style="margin-bottom:10px;">
                <span>⚠️</span>
                <span><strong>이미 등록된 날짜!</strong> ${existingDates.join(', ')} - 저장 시 덮어쓰기 됩니다.</span>
            </div>
        `;
    }
    if (sameNameCount > 0) {
        warningHtml += `
            <div class="alert" style="margin-bottom:10px;background:#fef3c7;border-color:#f59e0b;">
                <span>👥</span>
                <span><strong>동명이인 발견!</strong> ${sameNameCount}건의 동명이인을 선택해주세요. (드롭다운에서 선택)</span>
            </div>
        `;
    }
    
    let html = `
        ${warningHtml}
        <div style="margin-bottom:15px;">
            <span class="badge badge-info">총 ${parsedAttendanceData.length}건</span>
            <span class="badge badge-success">출근 ${presentCount}명</span>
            ${absentCount > 0 ? `<span class="badge" style="background:#fed7aa;color:#c2410c;">미출근 ${absentCount}명</span>` : ''}
            <span class="badge" style="background:#bbf7d0;color:#166534;">매칭 ${matchedCount}건</span>
            ${sameNameCount > 0 ? `<span class="badge" style="background:#fef08a;color:#854d0e;">동명이인 ${sameNameCount}건</span>` : ''}
            ${unmatchedCount > 0 ? `<span class="badge badge-error">미매칭 ${unmatchedCount}건</span>` : ''}
            ${mismatchedDates.length > 0 ? `<span class="badge" style="background:#fecaca;color:#991b1b;">년월불일치 ${mismatchedDates.length}일</span>` : ''}
            ${existingDates.length > 0 ? `<span class="badge" style="background:#fef08a;color:#854d0e;">중복 ${existingDates.length}일</span>` : ''}
        </div>
        <div class="table-container" style="max-height:400px;overflow-y:auto;">
            <table>
                <thead>
                    <tr>
                        <th>날짜</th>
                        <th>이름</th>
                        <th>부서/고유번호</th>
                        <th>출근</th>
                        <th>퇴근</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // 날짜순 정렬
    const sorted = [...parsedAttendanceData].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.name.localeCompare(b.name);
    });
    
    sorted.forEach((record, index) => {
        const recordYear = record.date.substring(0, 4);
        const recordMonth = String(parseInt(record.date.substring(5, 7)));
        const isMismatched = recordYear !== systemYear || recordMonth !== systemMonth;
        const isDuplicate = existingDates.includes(record.date);
        
        let rowStyle = '';
        let statusText = '';
        
        if (isMismatched) {
            rowStyle = 'background:#fecaca;';
            statusText = '<span style="color:#991b1b;font-weight:bold;">🚫 년월불일치</span>';
        } else if (record.hasSameNameIssue) {
            rowStyle = 'background:#fef3c7;';
            statusText = '<span style="color:#d97706;font-weight:bold;">👥 선택필요</span>';
        } else if (!record.matched) {
            rowStyle = 'background:#fef2f2;';
            statusText = '<span style="color:#ef4444;">✗ 미매칭</span>';
        } else if (record.absent) {
            rowStyle = 'background:#fff7ed;';
            statusText = isDuplicate 
                ? '<span style="color:#22c55e;">✓</span> <span style="color:#ca8a04;">⚠중복</span>'
                : '<span style="color:#22c55e;">✓</span>';
        } else {
            statusText = isDuplicate 
                ? '<span style="color:#22c55e;">✓</span> <span style="color:#ca8a04;">⚠중복</span>'
                : '<span style="color:#22c55e;">✓</span>';
        }
        
        if (isDuplicate && !isMismatched && record.matched && !record.hasSameNameIssue) {
            rowStyle = 'background:#fef9c3;';
        }
        
        // 부서/고유번호 셀
        let deptCell = '';
        if (record.hasSameNameIssue && record.sameNameCandidates) {
            const originalIndex = parsedAttendanceData.indexOf(record);
            deptCell = `
                <select onchange="selectSameNameEmployee(${originalIndex}, this.value)" style="font-size:12px;padding:2px 4px;">
                    <option value="">-- 선택 --</option>
                    ${record.sameNameCandidates.map(c => `
                        <option value="${c.id}">${c.dept || '부서없음'} / ${c.uniqueCode || 'ID없음'} (${c.entryDate ? c.entryDate.substring(0,4) + '입사' : ''})</option>
                    `).join('')}
                </select>
            `;
        } else {
            deptCell = record.matched 
                ? `${escapeHtml(record.dept || '')}${record.uniqueCode ? ' / ' + record.uniqueCode : ''}`
                : '';
        }
        
        html += `
            <tr style="${rowStyle}">
                <td>${record.date}${isDuplicate ? ' ⚠️' : ''}</td>
                <td>${escapeHtml(record.name)}</td>
                <td>${deptCell}</td>
                <td>${record.absent ? '<span style="color:#dc2626;font-weight:bold;">미출근</span>' : (record.checkIn || '-')}</td>
                <td>${record.absent ? '-' : (record.checkOut || '-')}</td>
                <td class="text-center">${statusText}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    console.log('렌더링 완료');
}

/**
 * 동명이인 선택
 */
function selectSameNameEmployee(recordIndex, empId) {
    if (!empId) {
        parsedAttendanceData[recordIndex].empId = null;
        parsedAttendanceData[recordIndex].matched = false;
        parsedAttendanceData[recordIndex].dept = '';
        parsedAttendanceData[recordIndex].uniqueCode = '';
    } else {
        const candidate = parsedAttendanceData[recordIndex].sameNameCandidates?.find(c => c.id === empId);
        if (candidate) {
            parsedAttendanceData[recordIndex].empId = empId;
            parsedAttendanceData[recordIndex].matched = true;
            parsedAttendanceData[recordIndex].dept = candidate.dept;
            parsedAttendanceData[recordIndex].uniqueCode = candidate.uniqueCode;
            parsedAttendanceData[recordIndex].hasSameNameIssue = false;
        }
    }
    
    renderAttendancePreview();
}

// ===== 근태 데이터 저장 =====

/**
 * 근태 데이터 저장
 */
async function saveAttendanceData() {
    console.log('=== 저장 시작 ===');
    console.log('parsedAttendanceData 길이:', parsedAttendanceData.length);
    
    if (parsedAttendanceData.length === 0) {
        alert('저장할 데이터가 없습니다.');
        return;
    }
    
    const matchedData = parsedAttendanceData.filter(r => r.matched);
    console.log('매칭된 데이터 수:', matchedData.length);
    
    if (matchedData.length === 0) {
        alert('매칭된 직원이 없습니다. 직원 정보를 확인해주세요.');
        return;
    }
    
    const systemYear = document.getElementById('attendanceYear').value;
    const systemMonth = document.getElementById('attendanceMonth').value;
    
    // 1. 년도/월 불일치 검증
    const mismatchedRecords = matchedData.filter(record => {
        const recordYear = record.date.substring(0, 4);
        const recordMonth = String(parseInt(record.date.substring(5, 7)));
        return recordYear !== systemYear || recordMonth !== systemMonth;
    });
    
    if (mismatchedRecords.length > 0) {
        const mismatchDates = [...new Set(mismatchedRecords.map(r => r.date))].slice(0, 5);
        alert(`⚠️ 년도/월 불일치 오류!\n\n` +
              `시스템 설정: ${systemYear}년 ${systemMonth}월\n` +
              `데이터에 포함된 다른 날짜: ${mismatchDates.join(', ')}${mismatchedRecords.length > 5 ? ' 외 ' + (mismatchedRecords.length - 5) + '건' : ''}\n\n` +
              `동일한 년도/월의 데이터만 등록할 수 있습니다.\n` +
              `시스템 설정을 변경하거나 데이터를 확인해주세요.`);
        return;
    }
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        console.log('기존 데이터:', Object.keys(attendanceData));
        
        // 2. 중복 날짜 검증
        const existingDates = [];
        const newDates = [...new Set(matchedData.map(r => r.date))];
        
        newDates.forEach(dateStr => {
            const year = dateStr.substring(0, 4);
            const month = String(parseInt(dateStr.substring(5, 7)));
            
            if (attendanceData[year]?.[month]) {
                const monthData = attendanceData[year][month];
                const hasData = Object.values(monthData).some(emp => emp[dateStr]);
                if (hasData) {
                    existingDates.push(dateStr);
                }
            }
        });
        
        if (existingDates.length > 0) {
            const confirmMsg = `⚠️ 이미 등록된 날짜가 있습니다!\n\n` +
                `중복 날짜: ${existingDates.join(', ')}\n\n` +
                `기존 데이터를 덮어쓰시겠습니까?\n` +
                `[확인] - 기존 데이터 덮어쓰기\n` +
                `[취소] - 등록 취소`;
            
            if (!confirm(confirmMsg)) {
                return;
            }
        }
        
        let savedCount = 0;
        let firstYear = null;
        let firstMonth = null;
        
        matchedData.forEach(record => {
            const year = record.date.substring(0, 4);
            const month = String(parseInt(record.date.substring(5, 7)));
            
            if (!firstYear) {
                firstYear = year;
                firstMonth = month;
            }
            
            if (!attendanceData[year]) attendanceData[year] = {};
            if (!attendanceData[year][month]) attendanceData[year][month] = {};
            if (!attendanceData[year][month][record.empId]) attendanceData[year][month][record.empId] = {};
            
            attendanceData[year][month][record.empId][record.date] = {
                checkIn: record.checkIn,
                checkOut: record.checkOut,
                absent: record.absent || false
            };
            
            savedCount++;
        });
        
        await OvertimeDB.saveAttendance(attendanceData);
        
        alert(`✅ ${savedCount}건의 근태 기록이 저장되었습니다.${existingDates.length > 0 ? '\n(중복 ' + existingDates.length + '일 덮어쓰기 완료)' : ''}`);
        
        // 저장된 데이터의 연도/월로 자동 이동
        if (firstYear && firstMonth) {
            document.getElementById('attendanceYear').value = firstYear;
            document.getElementById('attendanceMonth').value = firstMonth;
        }
        
        clearAttendancePaste();
        await loadAttendanceCalendar();
        
    } catch (e) {
        console.error('근태 저장 오류:', e);
        alert('저장 중 오류가 발생했습니다.');
    }
}

/**
 * 파싱 후 바로 저장 (통합 함수)
 */
async function parseAndSaveAttendance() {
    const textarea = document.getElementById('attendancePasteArea');
    const rawText = textarea.value.trim();
    
    if (!rawText) {
        alert('붙여넣은 데이터가 없습니다.');
        return;
    }
    
    parseAttendanceData();
    
    const matchedCount = parsedAttendanceData.filter(r => r.matched).length;
    if (matchedCount > 0) {
        if (confirm(`${matchedCount}건의 매칭된 데이터를 저장하시겠습니까?`)) {
            await saveAttendanceData();
        }
    } else {
        alert('매칭된 직원이 없습니다. 미리보기를 확인해주세요.');
    }
}

/**
 * 붙여넣기 영역 초기화
 */
function clearAttendancePaste() {
    document.getElementById('attendancePasteArea').value = '';
    parsedAttendanceData = [];
    document.getElementById('attendancePreviewContainer').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">데이터를 붙여넣고 '데이터 등록' 버튼을 클릭하세요</div>
        </div>
    `;
}

// ===== 특정 날짜 삭제 =====

/**
 * 특정 날짜 근태 데이터 삭제
 */
async function clearDateAttendance() {
    const dateInput = document.getElementById('attendanceDeleteDate');
    const targetDate = dateInput.value;
    
    if (!targetDate) {
        alert('삭제할 날짜를 선택해주세요.');
        return;
    }
    
    if (!confirm(`${targetDate} 근태 기록을 모두 삭제하시겠습니까?`)) return;
    
    try {
        const year = targetDate.substring(0, 4);
        const month = String(parseInt(targetDate.substring(5, 7)));
        
        const attendanceData = await OvertimeDB.getAttendance();
        
        if (!attendanceData[year]?.[month]) {
            alert('해당 날짜의 데이터가 없습니다.');
            return;
        }
        
        let deletedCount = 0;
        
        Object.keys(attendanceData[year][month]).forEach(empId => {
            if (attendanceData[year][month][empId][targetDate]) {
                delete attendanceData[year][month][empId][targetDate];
                deletedCount++;
                
                if (Object.keys(attendanceData[year][month][empId]).length === 0) {
                    delete attendanceData[year][month][empId];
                }
            }
        });
        
        if (Object.keys(attendanceData[year][month]).length === 0) {
            delete attendanceData[year][month];
        }
        if (Object.keys(attendanceData[year]).length === 0) {
            delete attendanceData[year];
        }
        
        await OvertimeDB.saveAttendance(attendanceData);
        
        document.getElementById('attendanceYear').value = year;
        document.getElementById('attendanceMonth').value = month;
        await loadAttendanceCalendar();
        
        alert(`${targetDate} 근태 기록 ${deletedCount}건이 삭제되었습니다.`);
        dateInput.value = '';
        
    } catch (e) {
        console.error('삭제 오류:', e);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

// ===== 달력 형식 근태 현황 =====

/**
 * 달력 형식 근태 현황 조회
 */
async function loadAttendanceCalendar() {
    console.log('=== 달력 조회 시작 ===');
    const year = parseInt(document.getElementById('attendanceYear').value);
    const month = parseInt(document.getElementById('attendanceMonth').value);
    const container = document.getElementById('attendanceCalendarContainer');
    
    console.log('조회 연도/월:', year, month);
    
    try {
        // employees는 전역 변수
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        let futureHireCount = 0;
        let retiredCount = 0;
        
        const activeEmployees = employees.filter(emp => {
            const empName = emp.personalInfo?.name || emp.name || '';
            
            const entryDate = emp.employment?.entryDate || emp.entryDate;
            if (entryDate && entryDate > monthEnd) {
                futureHireCount++;
                return false;
            }
            
            const retirementDate = emp.employment?.retirementDate || emp.retirementDate;
            if (retirementDate && retirementDate < monthStart) {
                retiredCount++;
                return false;
            }
            
            return true;
        });
        
        console.log('재직 직원 수 (', year, '년', month, '월 기준):', activeEmployees.length, '(미래입사:', futureHireCount, ', 퇴사:', retiredCount, ')');
        
        // 근태 데이터 가져오기
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = attendanceData[year]?.[String(month)] || {};
        console.log('해당 월 데이터 직원 수:', Object.keys(monthData).length);
        
        // 날짜 정보
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        
        const today = new Date();
        const todayStr = today.toISOString().substring(0, 10);
        
        // 날짜별 출근/미출근 집계
        const dailyStats = {};
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            dailyStats[dateStr] = { present: [], absent: [] };
        }
        
        Object.keys(monthData).forEach(empId => {
            const empRecords = monthData[empId];
            const emp = employees.find(e => e.id === empId);
            const empName = emp?.personalInfo?.name || emp?.name || empId;
            
            Object.keys(empRecords).forEach(dateStr => {
                if (dailyStats[dateStr]) {
                    const record = empRecords[dateStr];
                    if (record.absent) {
                        dailyStats[dateStr].absent.push(empName);
                    } else {
                        dailyStats[dateStr].present.push(empName);
                    }
                }
            });
        });
        
        // 달력 HTML 생성
        let html = `
            <div class="attendance-calendar">
                <div class="calendar-header sun">일</div>
                <div class="calendar-header">월</div>
                <div class="calendar-header">화</div>
                <div class="calendar-header">수</div>
                <div class="calendar-header">목</div>
                <div class="calendar-header">금</div>
                <div class="calendar-header sat">토</div>
        `;
        
        // 첫 주 빈 칸
        for (let i = 0; i < startDayOfWeek; i++) {
            html += `<div class="calendar-cell empty"></div>`;
        }
        
        // 날짜 셀
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj = new Date(year, month - 1, d);
            const dayOfWeek = dateObj.getDay();
            
            const stats = dailyStats[dateStr];
            const presentCount = stats.present.length;
            const absentCount = stats.absent.length;
            const hasData = presentCount > 0 || absentCount > 0;
            
            const holidayInfo = checkHoliday(dateStr);
            const isHoliday = holidayInfo && holidayInfo.isHoliday && holidayInfo.name !== '토요일' && holidayInfo.name !== '일요일';
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedCalendarDate;
            
            let cellClass = 'calendar-cell';
            if (isToday) cellClass += ' today';
            if (isSelected) cellClass += ' selected';
            if (hasData) cellClass += ' has-data';
            else if (!isWeekend && !isHoliday) cellClass += ' no-data';
            
            let dateClass = 'calendar-date';
            if (dayOfWeek === 0 || isHoliday) dateClass += ' sun';
            else if (dayOfWeek === 6) dateClass += ' sat';
            
            const presentTooltip = stats.present.length > 0 ? '출근: ' + stats.present.join(', ') : '';
            const absentTooltip = stats.absent.length > 0 ? '미출근: ' + stats.absent.join(', ') : '';
            
            html += `<div class="${cellClass}" data-date="${dateStr}" onclick="selectCalendarDate('${dateStr}')">`;
            html += `<div class="${dateClass}">${d}</div>`;
            
            if (hasData) {
                html += `<div class="calendar-stats">`;
                html += `<div class="calendar-stat-present" title="${presentTooltip}" style="cursor:pointer;">출근 ${presentCount}명</div>`;
                if (absentCount > 0) {
                    html += `<div class="calendar-stat-absent" title="${absentTooltip}" style="cursor:pointer;color:#dc2626;font-size:11px;">미출근 ${absentCount}명</div>`;
                }
                html += `</div>`;
            } else if (!isWeekend && !isHoliday) {
                html += `<div class="calendar-no-record">미등록</div>`;
            }
            
            html += `</div>`;
        }
        
        // 마지막 주 빈 칸
        const endDayOfWeek = lastDay.getDay();
        for (let i = endDayOfWeek + 1; i < 7; i++) {
            html += `<div class="calendar-cell empty"></div>`;
        }
        
        html += `</div>`;
        
        // 선택된 날짜 또는 오늘 날짜
        const targetDate = selectedCalendarDate || todayStr;
        const targetStats = dailyStats[targetDate] || { present: [], absent: [] };
        
        // 월 전체 요약 정보
        const totalDays = Object.keys(dailyStats).filter(d => dailyStats[d].present.length > 0 || dailyStats[d].absent.length > 0).length;
        const registeredEmployees = Object.keys(monthData).length;
        
        // 선택된 날짜 기준 재직직원 및 육아휴직자 계산
        const dateActiveEmployees = employees.filter(emp => {
            const entryDate = emp.employment?.entryDate || emp.entryDate;
            if (entryDate && entryDate > targetDate) return false;
            
            const retirementDate = emp.employment?.retirementDate || emp.retirementDate;
            if (retirementDate && retirementDate < targetDate) return false;
            
            return true;
        });
        
        // 육아휴직자 필터링
        const maternityLeaveEmployees = dateActiveEmployees.filter(emp => {
            return emp.maternityLeave && emp.maternityLeave.isOnLeave === true;
        });
        const maternityNames = maternityLeaveEmployees.map(emp => emp.personalInfo?.name || emp.name || '').join(', ');
        const maternityTooltip = maternityNames ? `육아휴직: ${maternityNames}` : '';
        
        const maternityDisplay = maternityLeaveEmployees.length > 0
            ? `<span class="badge" style="background:#fef3c7;color:#92400e;cursor:pointer;" title="${maternityTooltip}">(육아휴직: ${maternityLeaveEmployees.length}명)</span>`
            : '';
        
        // 요약 HTML
        let summaryHtml = '';
        if (selectedCalendarDate) {
            const dayPresent = targetStats.present.length;
            const dayAbsent = targetStats.absent.length;
            const hasRecord = dayPresent > 0 || dayAbsent > 0;
            
            // 선택된 날짜의 상세 데이터
            const dayRecords = [];
            
            if (monthData) {
                Object.keys(monthData).forEach(empId => {
                    const empRecord = monthData[empId][selectedCalendarDate];
                    if (empRecord) {
                        const emp = employees.find(e => e.id === empId);
                        const empName = emp?.personalInfo?.name || emp?.name || empId;
                        const dept = emp?.currentPosition?.dept || '';
                        dayRecords.push({
                            empId,
                            empName,
                            dept,
                            checkIn: empRecord.checkIn || '',
                            checkOut: empRecord.checkOut || '',
                            absent: empRecord.absent || false
                        });
                    }
                });
            }
            
            dayRecords.sort((a, b) => a.empName.localeCompare(b.empName));
            
            // 상세 목록 HTML
            let detailHtml = '';
            if (dayRecords.length > 0) {
                detailHtml = `
                    <div style="margin-top:15px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <span style="font-weight:600;color:#374151;">📋 ${selectedCalendarDate} 근태 상세 (${dayRecords.length}명)</span>
                            <button class="btn btn-sm" onclick="addManualAttendance('${selectedCalendarDate}')" style="font-size:12px;">
                                ➕ 수동 추가
                            </button>
                        </div>
                        <div class="table-container" style="max-height:300px;overflow-y:auto;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>이름</th>
                                        <th>부서</th>
                                        <th>출근</th>
                                        <th>퇴근</th>
                                        <th>상태</th>
                                        <th style="width:80px;">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                dayRecords.forEach(record => {
                    const statusText = record.absent 
                        ? '<span style="color:#dc2626;">미출근</span>' 
                        : '<span style="color:#22c55e;">출근</span>';
                    
                    detailHtml += `
                        <tr id="attendance-row-${record.empId}" style="${record.absent ? 'background:#fff7ed;' : ''}">
                            <td>${escapeHtml(record.empName)}</td>
                            <td>${escapeHtml(record.dept)}</td>
                            <td id="checkin-${record.empId}">${record.absent ? '-' : (record.checkIn || '-')}</td>
                            <td id="checkout-${record.empId}">${record.absent ? '-' : (record.checkOut || '-')}</td>
                            <td>${statusText}</td>
                            <td class="text-center">
                                <button class="btn btn-sm" onclick="editAttendanceRecord('${record.empId}', '${selectedCalendarDate}', '${escapeHtml(record.empName)}')" style="font-size:11px;padding:2px 8px;">
                                    ✏️ 수정
                                </button>
                            </td>
                        </tr>
                    `;
                });
                
                detailHtml += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
            
            summaryHtml = `
                <div style="margin-top:15px;padding:10px;background:#f5f3ff;border-radius:8px;border:1px solid #8b5cf6;">
                    <div style="margin-bottom:10px;font-weight:600;color:#8b5cf6;">📅 선택된 날짜: ${selectedCalendarDate}</div>
                    ${hasRecord ? `
                        <span class="badge badge-success">출근: ${dayPresent}명</span>
                        ${dayAbsent > 0 ? `<span class="badge" style="background:#fed7aa;color:#c2410c;">미출근: ${dayAbsent}명</span>` : ''}
                    ` : `
                        <span class="badge" style="background:#fef2f2;color:#dc2626;">근태 미등록</span>
                    `}
                    <span class="badge" style="background:#dbeafe;">재직 직원: ${dateActiveEmployees.length}명</span>
                    ${maternityDisplay}
                </div>
                ${detailHtml}
                <div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:8px;">
                    <span style="color:#64748b;font-size:12px;">📊 ${month}월 전체:</span>
                    <span class="badge badge-info">등록일수: ${totalDays}일</span>
                    <span class="badge" style="background:#e2e8f0;">등록 직원: ${registeredEmployees}명</span>
                </div>
            `;
        } else {
            // 월 전체 정보
            const totalPresent = Object.values(dailyStats).reduce((sum, d) => sum + d.present.length, 0);
            const totalAbsent = Object.values(dailyStats).reduce((sum, d) => sum + d.absent.length, 0);
            
            summaryHtml = `
                <div style="margin-top:15px;padding:10px;background:#f8fafc;border-radius:8px;">
                    <div style="margin-bottom:10px;color:#64748b;">💡 달력의 날짜를 클릭하면 해당 날짜 기준 정보가 표시됩니다.</div>
                    <span class="badge badge-info">등록일수: ${totalDays}일</span>
                    <span class="badge badge-success">출근: ${totalPresent}건</span>
                    ${totalAbsent > 0 ? `<span class="badge" style="background:#fed7aa;color:#c2410c;">미출근: ${totalAbsent}건</span>` : ''}
                    <span class="badge" style="background:#e2e8f0;">등록 직원: ${registeredEmployees}명</span>
                    <span class="badge" style="background:#dbeafe;">재직 직원: ${dateActiveEmployees.length}명</span>
                    ${maternityDisplay}
                </div>
            `;
        }
        
        html += summaryHtml;
        container.innerHTML = html;
        
        // 상세 목록도 업데이트
        await loadAttendanceRecords();
        
    } catch (e) {
        console.error('달력 조회 오류:', e);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>❌</span>
                <span>근태 현황을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

// ===== 달력 이벤트 =====

/**
 * 년도/월 변경 시 처리
 */
function onAttendancePeriodChange() {
    selectedCalendarDate = null;
    loadAttendanceCalendar();
}

/**
 * 달력 날짜 선택
 */
function selectCalendarDate(dateStr) {
    if (selectedCalendarDate === dateStr) {
        selectedCalendarDate = null;
        const deleteDateInput = document.getElementById('attendanceDeleteDate');
        if (deleteDateInput) deleteDateInput.value = '';
    } else {
        selectedCalendarDate = dateStr;
        const deleteDateInput = document.getElementById('attendanceDeleteDate');
        if (deleteDateInput) deleteDateInput.value = dateStr;
    }
    
    loadAttendanceCalendar();
}

// ===== 근태 기록 수정/삭제 =====

/**
 * 근태 기록 수정 모달
 */
async function editAttendanceRecord(empId, dateStr, empName) {
    const attendanceData = await OvertimeDB.getAttendance();
    const year = dateStr.substring(0, 4);
    const month = String(parseInt(dateStr.substring(5, 7)));
    
    const record = attendanceData[year]?.[month]?.[empId]?.[dateStr] || {};
    
    const normalizeTime = (timeStr) => {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        if (parts.length !== 2) return timeStr;
        const hour = parts[0].padStart(2, '0');
        const minute = parts[1].padStart(2, '0');
        return `${hour}:${minute}`;
    };
    
    const currentCheckIn = normalizeTime(record.checkIn || '');
    const currentCheckOut = normalizeTime(record.checkOut || '');
    const isAbsent = record.absent || false;
    
    const modalHtml = `
        <div id="editAttendanceModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
            <div style="background:white;padding:25px;border-radius:12px;width:400px;max-width:90%;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 20px 0;color:#374151;">✏️ 근태 수정</h3>
                <div style="margin-bottom:15px;padding:10px;background:#f8fafc;border-radius:8px;">
                    <div><strong>직원:</strong> ${empName}</div>
                    <div><strong>날짜:</strong> ${dateStr}</div>
                </div>
                
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:500;color:#374151;">출근 시간</label>
                    <input type="time" id="editCheckIn" value="${currentCheckIn}" 
                           style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                </div>
                
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:500;color:#374151;">퇴근 시간</label>
                    <input type="time" id="editCheckOut" value="${currentCheckOut}"
                           style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                </div>
                
                <div style="margin-bottom:20px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="editAbsent" ${isAbsent ? 'checked' : ''} onchange="toggleAbsentInputs()">
                        <span>미출근 처리</span>
                    </label>
                    <div style="margin-top:5px;font-size:12px;color:#6b7280;">
                        ※ 미출근 체크 시 출퇴근 시간은 무시됩니다.
                    </div>
                </div>
                
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="deleteAttendanceRecordFromModal('${empId}', '${dateStr}', '${empName}')" 
                            style="padding:10px 15px;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;cursor:pointer;">
                        🗑️ 삭제
                    </button>
                    <button onclick="closeEditModal()" 
                            style="padding:10px 20px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;">
                        취소
                    </button>
                    <button onclick="saveAttendanceEdit('${empId}', '${dateStr}')" 
                            style="padding:10px 20px;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;">
                        저장
                    </button>
                </div>
            </div>
        </div>
    `;
    
    closeEditModal();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    toggleAbsentInputs();
}

/**
 * 미출근 체크박스 변경 시 입력 필드 토글
 */
function toggleAbsentInputs() {
    const isAbsent = document.getElementById('editAbsent')?.checked;
    const checkInInput = document.getElementById('editCheckIn');
    const checkOutInput = document.getElementById('editCheckOut');
    
    if (checkInInput && checkOutInput) {
        checkInInput.disabled = isAbsent;
        checkOutInput.disabled = isAbsent;
        checkInInput.style.opacity = isAbsent ? '0.5' : '1';
        checkOutInput.style.opacity = isAbsent ? '0.5' : '1';
    }
}

/**
 * 수정 모달 닫기
 */
function closeEditModal() {
    const modal = document.getElementById('editAttendanceModal');
    if (modal) modal.remove();
    
    const addModal = document.getElementById('addAttendanceModal');
    if (addModal) addModal.remove();
}

/**
 * 근태 수정 저장
 */
async function saveAttendanceEdit(empId, dateStr) {
    const checkIn = document.getElementById('editCheckIn').value;
    const checkOut = document.getElementById('editCheckOut').value;
    const isAbsent = document.getElementById('editAbsent').checked;
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        
        if (!attendanceData[year]) attendanceData[year] = {};
        if (!attendanceData[year][month]) attendanceData[year][month] = {};
        if (!attendanceData[year][month][empId]) attendanceData[year][month][empId] = {};
        
        attendanceData[year][month][empId][dateStr] = {
            checkIn: isAbsent ? '' : checkIn,
            checkOut: isAbsent ? '' : checkOut,
            absent: isAbsent
        };
        
        await OvertimeDB.saveAttendance(attendanceData);
        
        closeEditModal();
        await loadAttendanceCalendar();
        
        alert('✅ 근태 기록이 수정되었습니다.');
        
    } catch (e) {
        console.error('근태 수정 오류:', e);
        alert('수정 중 오류가 발생했습니다.');
    }
}

/**
 * 모달에서 근태 기록 삭제 (3인자 버전)
 */
async function deleteAttendanceRecordFromModal(empId, dateStr, empName) {
    if (!confirm(`${empName}의 ${dateStr} 근태 기록을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        
        if (attendanceData[year]?.[month]?.[empId]?.[dateStr]) {
            delete attendanceData[year][month][empId][dateStr];
            
            if (Object.keys(attendanceData[year][month][empId]).length === 0) {
                delete attendanceData[year][month][empId];
            }
            if (Object.keys(attendanceData[year][month]).length === 0) {
                delete attendanceData[year][month];
            }
            if (Object.keys(attendanceData[year]).length === 0) {
                delete attendanceData[year];
            }
            
            await OvertimeDB.saveAttendance(attendanceData);
            
            closeEditModal();
            await loadAttendanceCalendar();
            
            alert('✅ 근태 기록이 삭제되었습니다.');
        }
    } catch (e) {
        console.error('근태 삭제 오류:', e);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

/**
 * 개별 근태 기록 삭제 (목록에서 호출, 2인자 버전)
 */
async function deleteAttendanceRecord(empId, date) {
    if (!confirm(`${date} 근태 기록을 삭제하시겠습니까?`)) return;
    
    try {
        const year = date.substring(0, 4);
        const month = String(parseInt(date.substring(5, 7)));
        
        const attendanceData = await OvertimeDB.getAttendance();
        
        if (attendanceData[year]?.[month]?.[empId]?.[date]) {
            delete attendanceData[year][month][empId][date];
            
            if (Object.keys(attendanceData[year][month][empId]).length === 0) {
                delete attendanceData[year][month][empId];
            }
            if (Object.keys(attendanceData[year][month]).length === 0) {
                delete attendanceData[year][month];
            }
            if (Object.keys(attendanceData[year]).length === 0) {
                delete attendanceData[year];
            }
            
            await OvertimeDB.saveAttendance(attendanceData);
            await loadAttendanceCalendar();
        }
    } catch (e) {
        console.error('삭제 오류:', e);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

// ===== 수동 근태 추가 =====

/**
 * 수동 근태 추가 모달
 */
async function addManualAttendance(dateStr) {
    // employees 전역 변수 사용
    const activeEmployees = employees.filter(emp => {
        const entryDate = emp.employment?.entryDate || emp.entryDate;
        if (entryDate && entryDate > dateStr) return false;
        
        const retirementDate = emp.employment?.retirementDate || emp.retirementDate;
        if (retirementDate && retirementDate < dateStr) return false;
        
        return true;
    }).sort((a, b) => {
        const nameA = a.personalInfo?.name || a.name || '';
        const nameB = b.personalInfo?.name || b.name || '';
        return nameA.localeCompare(nameB);
    });
    
    // 이미 등록된 직원 ID 목록
    const attendanceData = await OvertimeDB.getAttendance();
    const year = dateStr.substring(0, 4);
    const month = String(parseInt(dateStr.substring(5, 7)));
    const registeredIds = Object.keys(attendanceData[year]?.[month] || {}).filter(empId => {
        return attendanceData[year][month][empId][dateStr];
    });
    
    const unregisteredEmployees = activeEmployees.filter(emp => !registeredIds.includes(emp.id));
    
    const optionsHtml = unregisteredEmployees.map(emp => {
        const name = emp.personalInfo?.name || emp.name || '';
        const dept = emp.employment?.department || emp.department || '';
        return `<option value="${emp.id}">${name} (${dept})</option>`;
    }).join('');
    
    const modalHtml = `
        <div id="addAttendanceModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
            <div style="background:white;padding:25px;border-radius:12px;width:400px;max-width:90%;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 20px 0;color:#374151;">➕ 근태 수동 추가</h3>
                <div style="margin-bottom:15px;padding:10px;background:#f8fafc;border-radius:8px;">
                    <div><strong>날짜:</strong> ${dateStr}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:5px;">
                        미등록 직원: ${unregisteredEmployees.length}명
                    </div>
                </div>
                
                ${unregisteredEmployees.length > 0 ? `
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:500;color:#374151;">직원 선택</label>
                        <select id="addEmpId" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                            <option value="">-- 직원 선택 --</option>
                            ${optionsHtml}
                        </select>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:500;color:#374151;">출근 시간</label>
                        <input type="time" id="addCheckIn" value="09:00"
                               style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:500;color:#374151;">퇴근 시간</label>
                        <input type="time" id="addCheckOut" value="18:00"
                               style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" id="addAbsent" onchange="toggleAddAbsentInputs()">
                            <span>미출근 처리</span>
                        </label>
                    </div>
                    
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button onclick="closeEditModal()" 
                                style="padding:10px 20px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;">
                            취소
                        </button>
                        <button onclick="saveManualAttendance('${dateStr}')" 
                                style="padding:10px 20px;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;">
                            추가
                        </button>
                    </div>
                ` : `
                    <div class="alert alert-info" style="margin-bottom:15px;">
                        <span>ℹ️</span>
                        <span>모든 재직 직원의 근태가 이미 등록되어 있습니다.</span>
                    </div>
                    <div style="text-align:right;">
                        <button onclick="closeEditModal()" 
                                style="padding:10px 20px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;">
                            닫기
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
    
    closeEditModal();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * 수동 추가 미출근 체크박스 토글
 */
function toggleAddAbsentInputs() {
    const isAbsent = document.getElementById('addAbsent')?.checked;
    const checkInInput = document.getElementById('addCheckIn');
    const checkOutInput = document.getElementById('addCheckOut');
    
    if (checkInInput && checkOutInput) {
        checkInInput.disabled = isAbsent;
        checkOutInput.disabled = isAbsent;
        checkInInput.style.opacity = isAbsent ? '0.5' : '1';
        checkOutInput.style.opacity = isAbsent ? '0.5' : '1';
    }
}

/**
 * 수동 근태 저장
 */
async function saveManualAttendance(dateStr) {
    const empId = document.getElementById('addEmpId').value;
    const checkIn = document.getElementById('addCheckIn').value;
    const checkOut = document.getElementById('addCheckOut').value;
    const isAbsent = document.getElementById('addAbsent').checked;
    
    if (!empId) {
        alert('직원을 선택해주세요.');
        return;
    }
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        const year = dateStr.substring(0, 4);
        const month = String(parseInt(dateStr.substring(5, 7)));
        
        if (!attendanceData[year]) attendanceData[year] = {};
        if (!attendanceData[year][month]) attendanceData[year][month] = {};
        if (!attendanceData[year][month][empId]) attendanceData[year][month][empId] = {};
        
        attendanceData[year][month][empId][dateStr] = {
            checkIn: isAbsent ? '' : checkIn,
            checkOut: isAbsent ? '' : checkOut,
            absent: isAbsent
        };
        
        await OvertimeDB.saveAttendance(attendanceData);
        
        closeEditModal();
        await loadAttendanceCalendar();
        
        alert('✅ 근태 기록이 추가되었습니다.');
        
    } catch (e) {
        console.error('근태 추가 오류:', e);
        alert('추가 중 오류가 발생했습니다.');
    }
}

// ===== 상세 목록 =====

/**
 * 상세 목록 토글
 */
function toggleAttendanceList() {
    const container = document.getElementById('attendanceListContainer');
    const btn = document.getElementById('btnToggleList');
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.textContent = '📋 상세 목록 닫기';
    } else {
        container.style.display = 'none';
        btn.textContent = '📋 상세 목록 보기';
    }
}

/**
 * 등록된 근태 기록 조회
 */
async function loadAttendanceRecords() {
    const year = document.getElementById('attendanceYear').value;
    const month = document.getElementById('attendanceMonth').value;
    const container = document.getElementById('attendanceListContainer');
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = attendanceData[year]?.[month] || {};
        
        // employees 전역 변수 사용
        const records = [];
        
        Object.keys(monthData).forEach(empId => {
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            
            const empRecords = monthData[empId];
            Object.keys(empRecords).forEach(date => {
                records.push({
                    date,
                    empId,
                    name: emp.personalInfo?.name || emp.name || '',
                    dept: emp.currentPosition?.dept || '',
                    checkIn: empRecords[date].checkIn,
                    checkOut: empRecords[date].checkOut
                });
            });
        });
        
        if (records.length === 0) {
            container.innerHTML = `
                <div style="padding:20px;text-align:center;color:#9ca3af;">
                    ${year}년 ${month}월 등록된 근태 기록이 없습니다
                </div>
            `;
            return;
        }
        
        records.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.name.localeCompare(b.name);
        });
        
        let html = `
            <div style="margin-bottom:10px;">
                <span class="badge badge-info">총 ${records.length}건</span>
            </div>
            <div class="table-container" style="max-height:400px;overflow-y:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>날짜</th>
                            <th>이름</th>
                            <th>부서</th>
                            <th>출근</th>
                            <th>퇴근</th>
                            <th>삭제</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        records.forEach(record => {
            html += `
                <tr>
                    <td>${record.date}</td>
                    <td>${escapeHtml(record.name)}</td>
                    <td>${escapeHtml(record.dept)}</td>
                    <td>${record.checkIn || '-'}</td>
                    <td>${record.checkOut || '-'}</td>
                    <td class="text-center">
                        <button class="btn btn-sm" style="padding:2px 8px;font-size:11px;" 
                            onclick="deleteAttendanceRecord('${record.empId}', '${record.date}')">🗑️</button>
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
        
    } catch (e) {
        console.error('근태 조회 오류:', e);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>❌</span>
                <span>근태 기록을 불러올 수 없습니다.</span>
            </div>
        `;
    }
}

// ===== 월 전체 삭제 =====

/**
 * 월 전체 근태 데이터 삭제
 */
async function clearMonthAttendance() {
    const year = document.getElementById('attendanceYear').value;
    const month = document.getElementById('attendanceMonth').value;
    
    if (!confirm(`${year}년 ${month}월 근태 기록을 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    
    try {
        const attendanceData = await OvertimeDB.getAttendance();
        
        if (attendanceData[year]?.[month]) {
            delete attendanceData[year][month];
            
            if (Object.keys(attendanceData[year]).length === 0) {
                delete attendanceData[year];
            }
            
            await OvertimeDB.saveAttendance(attendanceData);
            await loadAttendanceCalendar();
            alert(`${year}년 ${month}월 근태 기록이 삭제되었습니다.`);
        } else {
            alert('삭제할 데이터가 없습니다.');
        }
    } catch (e) {
        console.error('삭제 오류:', e);
        alert('삭제 중 오류가 발생했습니다.');
    }
}
