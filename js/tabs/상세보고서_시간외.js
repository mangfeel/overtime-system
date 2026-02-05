/**
 * 상세보고서_시간외.js
 * 상세 보고서 (수당/대휴 내역)
 * - generateDetailReport(): 상세 보고서 진입점
 * - generateDetailReportContent(): 수당 상세 보고서
 * - generateLeaveDetailReport(): 대휴 상세 보고서
 * - downloadDetailExcel(): 상세 보고서 엑셀 다운로드
 * - downloadLeaveDetailExcel(): 대휴 엑셀 다운로드
 * - printDetailReport(): 상세 보고서 인쇄
 * 
 * 의존: 상수_시간외.js, 데이터베이스_시간외.js, 유틸_시간외.js,
 *       급여계산_시간외.js, 탭관리_시간외.js
 * 전역: employees (초기화_시간외.js)
 */

// ===== 상세 보고서 생성 =====
function generateDetailReport() {
    const year = parseInt(document.getElementById('reportYear').value);
    const month = parseInt(document.getElementById('reportMonth').value);
    const selectedDepts = getSelectedReportDepts();
    const compTypeFilter = document.getElementById('reportCompType').value;
    
    const container = document.getElementById('detailReportContainer');
    
    // 먼저 초기화 및 로딩 표시
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⏳</div>
            <div class="empty-state-text">보고서를 생성 중입니다...</div>
        </div>
    `;
    
    // 부서가 하나도 선택되지 않은 경우
    if (selectedDepts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📂</div>
                <div class="empty-state-text">부서를 1개 이상 선택해주세요</div>
            </div>
        `;
        return;
    }
    
    // 비동기로 보고서 생성 (UI 업데이트를 위해)
    setTimeout(async () => {
        if (compTypeFilter === 'leave') {
            await generateLeaveDetailReport(year, month, selectedDepts, container);
        } else {
            await generateDetailReportContent(year, month, selectedDepts, compTypeFilter, container);
        }
    }, 50);
}

/**
 * 대휴 상세 보고서 생성 (별도 서식)
 */
async function generateLeaveDetailReport(year, month, selectedDepts, container) {
    try {
        // 데이터 로드 (async)
        const dailyData = await OvertimeDB.getOvertimeDaily();
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = dailyData[String(year)]?.[String(month)] || {};
        
        // 전체 대휴 기록 수집 (일자별)
        const allRecords = [];
        
        Object.keys(monthData).forEach(empId => {
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            
            const records = monthData[empId].records || [];
            
            records.forEach(record => {
                // 대휴만 필터링
                if (record.compensationType !== 'leave') return;
                
                // 해당 날짜 기준 발령 정보 조회
                const assignment = SalaryCalculator.getAssignmentAtDate(emp, record.date);
                const dept = assignment?.department || assignment?.dept || emp.currentPosition?.dept || '';
                
                // 선택된 부서 확인
                if (!selectedDepts.includes(dept)) return;
                
                // 시간외근무 유형 정보
                const overtimeType = OVERTIME_TYPES[record.overtimeType] || {};
                const rate = overtimeType.rate || 1;
                
                // 실제 인정 시간 계산
                const actualResult = calculateActualRecognizedMinutes(record, attendanceData, empId, record.date);
                const recognizedHours = Math.floor(actualResult.minutes / 60);
                
                // 가산/미가산 시간 계산
                const is15x = rate >= 1.5;
                const addedHours = is15x ? recognizedHours * 1.5 : 0;
                const normalHours = is15x ? 0 : recognizedHours * 1.0;
                const totalHours = addedHours + normalHours;
                
                // 근태 데이터에서 출퇴근 시간 가져오기
                const recYear = record.date.substring(0, 4);
                const recMonth = String(parseInt(record.date.substring(5, 7)));
                const attRecord = attendanceData[recYear]?.[recMonth]?.[empId]?.[record.date];
                
                allRecords.push({
                    date: record.date,
                    empId,
                    name: emp.personalInfo?.name || emp.name || '',
                    birthDate: emp.personalInfo?.birthDate || '',
                    dept,
                    checkIn: attRecord?.checkIn || '',
                    checkOut: attRecord?.checkOut || '',
                    startTime: record.actualStart,
                    endTime: record.actualEnd,
                    recognizedHours,
                    addedHours,
                    normalHours,
                    totalHours,
                    noAttendance: actualResult.noAttendance
                });
            });
        });
        
        if (allRecords.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">${year}년 ${month}월 대휴 기록이 없습니다</div>
                </div>
            `;
            return;
        }
        
        // 일자순 정렬
        allRecords.sort((a, b) => a.date.localeCompare(b.date));
        
        // 직원별 집계 (성명 가나다순)
        const empSummary = {};
        allRecords.forEach(rec => {
            const key = `${rec.empId}_${rec.name}`;
            if (!empSummary[key]) {
                empSummary[key] = {
                    empId: rec.empId,
                    name: rec.name,
                    birthDate: rec.birthDate,
                    totalRecognized: 0,
                    totalAdded: 0,
                    totalNormal: 0,
                    totalSum: 0,
                    records: []
                };
            }
            empSummary[key].totalRecognized += rec.recognizedHours;
            empSummary[key].totalAdded += rec.addedHours;
            empSummary[key].totalNormal += rec.normalHours;
            empSummary[key].totalSum += rec.totalHours;
            empSummary[key].records.push(rec);
        });
        
        // 성명 가나다순 정렬
        const sortedEmpList = Object.values(empSummary).sort((a, b) => 
            a.name.localeCompare(b.name, 'ko')
        );
        
        // 동명이인 체크
        sortedEmpList.forEach(emp => {
            const sameNameEmps = sortedEmpList.filter(e => e.name === emp.name && e.empId !== emp.empId);
            if (sameNameEmps.length > 0 && emp.birthDate) {
                const birthStr = emp.birthDate.substring(2).replace(/-/g, '.');
                emp.displayName = `${emp.name} (${birthStr})`;
            } else {
                emp.displayName = emp.name;
            }
        });
        
        // 시간 포맷 함수
        const formatTime = (t) => {
            if (!t) return '';
            const str = String(t).padStart(4, '0');
            return str.substring(0, 2).replace(/^0/, '') + ':' + str.substring(2);
        };
        
        // .5로 끝나는지 확인하는 함수
        const isHalfHour = (val) => Math.round((val % 1) * 10) === 5;
        
        // 숫자 포맷 (소수점 한자리, .0은 생략)
        const formatHours = (val) => {
            if (val === 0) return '';
            return val % 1 === 0 ? String(val) : val.toFixed(1);
        };
        
        // HTML 생성
        let html = `
            <div class="table-container" id="leaveDetailReportTable">
                <div style="margin-bottom:15px;font-weight:600;font-size:16px;">
                    📋 ${year}년 ${month}월 시간외근무 직원 대휴 내역
                </div>
                <table class="detail-report-table leave-report-table">
                    <thead>
                        <tr>
                            <th>근무일자</th>
                            <th>이름</th>
                            <th>출근시간</th>
                            <th>퇴근시간</th>
                            <th>근무시작시간(신청)</th>
                            <th>근무종료시간(신청)</th>
                            <th>인정시간</th>
                            <th>인정시간(가산)</th>
                            <th>인정시간(미가산)</th>
                            <th>합계시간</th>
                            <th>비고</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // 상단: 일자별 전체 내역
        let prevDate = '';
        let bgToggle = 0;
        
        allRecords.forEach(rec => {
            if (rec.date !== prevDate) {
                bgToggle = 1 - bgToggle;
                prevDate = rec.date;
            }
            
            const bgColor = bgToggle === 1 ? '#E6F3FF' : '#FFFFFF';
            const totalClass = isHalfHour(rec.totalHours) ? 'style="color:#FF0000;font-weight:bold;"' : '';
            
            const empData = sortedEmpList.find(e => e.empId === rec.empId);
            const displayName = empData?.displayName || rec.name;
            
            html += `
                <tr style="background:${bgColor};">
                    <td>${rec.date}</td>
                    <td>${escapeHtml(displayName)}</td>
                    <td>${rec.checkIn || '-'}</td>
                    <td>${rec.checkOut || '-'}</td>
                    <td>${formatTime(rec.startTime)}</td>
                    <td>${formatTime(rec.endTime)}</td>
                    <td class="text-right">${formatHours(rec.recognizedHours)}</td>
                    <td class="text-right">${formatHours(rec.addedHours)}</td>
                    <td class="text-right">${formatHours(rec.normalHours)}</td>
                    <td class="text-right" ${totalClass}>${formatHours(rec.totalHours)}</td>
                    <td>${rec.noAttendance ? '<span style="color:#6b7280;">근태미등록</span>' : ''}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
        `;
        
        // 하단: 직원별 집계
        html += `
            <div style="margin-top:30px;padding:15px;background:#f0f0f0;border-radius:6px;">
                <div style="font-weight:bold;margin-bottom:15px;">📊 직원별 대휴 내역 집계</div>
        `;
        
        sortedEmpList.forEach(emp => {
            const totalClass = isHalfHour(emp.totalSum) ? 'style="color:#FF0000;font-weight:bold;"' : '';
            
            html += `
                <div style="margin-bottom:15px;">
                    <table class="detail-report-table leave-report-table" style="margin-bottom:5px;">
                        <tr style="background:#d9d9d9;font-weight:bold;">
                            <td style="width:100px;">${escapeHtml(emp.displayName)}</td>
                            <td style="width:60px;">합계:</td>
                            <td style="width:80px;"></td>
                            <td style="width:80px;"></td>
                            <td style="width:120px;"></td>
                            <td style="width:120px;"></td>
                            <td class="text-right" style="width:80px;">${formatHours(emp.totalRecognized)}</td>
                            <td class="text-right" style="width:100px;">${formatHours(emp.totalAdded)}</td>
                            <td class="text-right" style="width:110px;">${formatHours(emp.totalNormal)}</td>
                            <td class="text-right" style="width:80px;" ${totalClass}>${formatHours(emp.totalSum)}</td>
                            <td style="width:80px;"></td>
                        </tr>
            `;
            
            emp.records.forEach((rec, idx) => {
                const recTotalClass = isHalfHour(rec.totalHours) ? 'style="color:#FF0000;"' : '';
                const borderStyle = idx < emp.records.length - 1 ? 'border-bottom:1px dotted #ccc;' : '';
                
                html += `
                        <tr style="${borderStyle}">
                            <td>${rec.date}</td>
                            <td>${escapeHtml(emp.displayName)}</td>
                            <td>${rec.checkIn || '-'}</td>
                            <td>${rec.checkOut || '-'}</td>
                            <td>${formatTime(rec.startTime)}</td>
                            <td>${formatTime(rec.endTime)}</td>
                            <td class="text-right">${formatHours(rec.recognizedHours)}</td>
                            <td class="text-right">${formatHours(rec.addedHours)}</td>
                            <td class="text-right">${formatHours(rec.normalHours)}</td>
                            <td class="text-right" ${recTotalClass}>${formatHours(rec.totalHours)}</td>
                            <td></td>
                        </tr>
                `;
            });
            
            html += `
                    </table>
                </div>
            `;
        });
        
        html += `
            </div>
        </div>
        `;
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error('대휴 상세 보고서 생성 오류:', e);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <div class="empty-state-text">보고서 생성 중 오류가 발생했습니다</div>
            </div>
        `;
    }
}

/**
 * 상세 보고서 내용 생성 (수당)
 */
async function generateDetailReportContent(year, month, selectedDepts, compTypeFilter, container) {
    try {
        // 데이터 로드 (async)
        const dailyData = await OvertimeDB.getOvertimeDaily();
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = dailyData[String(year)]?.[String(month)] || {};
        
        // 직원+부서별 데이터 수집 (같은 직원이라도 부서가 다르면 별도 그룹)
        const employeeRecords = {};
        
        Object.keys(monthData).forEach(empId => {
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            
            const records = monthData[empId].records || [];
            if (records.length === 0) return;
            
            // 보상유형 필터링
            const filteredRecords = compTypeFilter 
                ? records.filter(r => r.compensationType === compTypeFilter)
                : records;
            
            if (filteredRecords.length === 0) return;
            
            // 각 기록을 날짜 기준 부서별로 그룹핑
            filteredRecords.forEach(record => {
                const assignment = SalaryCalculator.getAssignmentAtDate(emp, record.date);
                const dept = assignment?.department || assignment?.dept || emp.currentPosition?.dept || '';
                const appointmentCode = assignment?.code || '';
                
                if (!selectedDepts.includes(dept)) return;
                
                const groupKey = `${empId}_${dept}`;
                
                if (!employeeRecords[groupKey]) {
                    const salary = calculateEmployeeSalary(empId, year, month, record.date);
                    const uniqueCode = emp.personalInfo?.uniqueCode || emp.uniqueCode || '';
                    const birthDate = emp.personalInfo?.birthDate || '';
                    
                    employeeRecords[groupKey] = {
                        empId,
                        uniqueCode,
                        appointmentCode,
                        name: emp.personalInfo?.name || emp.name || '',
                        birthDate,
                        dept,
                        salary,
                        records: []
                    };
                }
                
                employeeRecords[groupKey].records.push(record);
            });
        });
        
        // 정렬 (부서 → 이름 가나다순)
        const sortedEmps = Object.values(employeeRecords).sort((a, b) => {
            if (a.dept !== b.dept) return a.dept.localeCompare(b.dept, 'ko');
            return a.name.localeCompare(b.name, 'ko');
        });
        
        // 각 그룹 내 기록 날짜순 정렬
        sortedEmps.forEach(group => {
            group.records.sort((a, b) => a.date.localeCompare(b.date));
        });
        
        // 동명이인+같은 부서 체크 → 생년월일 표시
        sortedEmps.forEach(group => {
            const sameNameDept = sortedEmps.filter(g => 
                g.name === group.name && g.dept === group.dept && g.empId !== group.empId
            );
            
            if (sameNameDept.length > 0 && group.birthDate) {
                const birthStr = group.birthDate.substring(2).replace(/-/g, '.');
                group.displayName = `${group.name} (${birthStr})`;
            } else {
                group.displayName = group.name;
            }
        });
        
        if (sortedEmps.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">${year}년 ${month}월 등록된 기록이 없습니다</div>
                </div>
            `;
            return;
        }
        
        // 전체 합계 변수
        let grandTotalMinutes = 0;
        let grandTotal15x = 0;
        let grandTotal10x = 0;
        let grandTotalPay15x = 0;
        let grandTotalPay10x = 0;
        let grandTotalPay = 0;
        
        // 테이블 생성
        let html = `
            <div class="table-container" id="detailReportTable">
                <div style="margin-bottom:15px;font-weight:600;font-size:16px;">
                    📋 ${year}년 ${month}월 시간외근무 상세 보고서
                </div>
                <table class="detail-report-table">
                    <thead>
                        <tr>
                            <th>고유번호</th>
                            <th>발령코드</th>
                            <th>근무일자</th>
                            <th>이름</th>
                            <th>부서</th>
                            <th>출근시간</th>
                            <th>퇴근시간</th>
                            <th>신청시작</th>
                            <th>신청종료</th>
                            <th>인정시간</th>
                            <th>가산</th>
                            <th>미가산</th>
                            <th>통상임금</th>
                            <th>시간단가(가산)</th>
                            <th>금액(가산)</th>
                            <th>시간단가(미가산)</th>
                            <th>금액(미가산)</th>
                            <th>지급액</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sortedEmps.forEach(empData => {
            const { empId, uniqueCode, appointmentCode, name, displayName, dept, salary, records } = empData;
            
            // 직원별 합계
            let empTotalMinutes = 0;
            let empTotal15x = 0;
            let empTotal10x = 0;
            let empRawPay15x = 0;
            let empRawPay10x = 0;
            
            // 디버깅용 로그
            console.group(`📊 ${displayName} (${empId}) 상세`);
            
            // 개별 기록
            records.forEach(record => {
                const overtimeType = OVERTIME_TYPES[record.overtimeType] || {};
                const rate = overtimeType.rate || 1;
                
                // 실제 퇴근 시간과 비교하여 인정 시간 계산
                const actualResult = calculateActualRecognizedMinutes(record, attendanceData, empId, record.date);
                const minutes = actualResult.minutes;
                const hours = minutes / 60;
                const displayHours = Math.floor(hours);
                
                // 디버깅 로그
                console.log(`📅 ${record.date} | 신청: ${record.recognizedMinutes}분 | 실제: ${minutes}분 | 표시: ${displayHours}시간 | 유형: ${record.overtimeType} | rate: ${rate} | 보상: ${record.compensationType}`);
                
                // 근태 데이터에서 출퇴근 시간 가져오기
                const recYear = record.date.substring(0, 4);
                const recMonth = String(parseInt(record.date.substring(5, 7)));
                const attRecord = attendanceData[recYear]?.[recMonth]?.[empId]?.[record.date];
                const checkIn = attRecord?.checkIn || '';
                const checkOut = attRecord?.checkOut || '';
                
                // 1.5배/1.0배 구분
                const is15x = rate >= 1.5;
                
                // 수당인 경우만 금액 계산
                const rawHourly = salary.rawHourlyWage || salary.hourlyWage;
                const ratedHourlyWage = SalaryCalculator.getRatedHourlyWage(rawHourly, rate, year);
                
                if (record.compensationType === 'pay') {
                    empTotalMinutes += displayHours * 60;
                    if (is15x) {
                        empTotal15x += displayHours * 60;
                        empRawPay15x += ratedHourlyWage * displayHours;
                    } else {
                        empTotal10x += displayHours * 60;
                        empRawPay10x += ratedHourlyWage * displayHours;
                    }
                }
                
                // 시간 포맷 (HHMM -> H:MM)
                const formatTime = (t) => {
                    if (!t) return '';
                    const str = String(t).padStart(4, '0');
                    return str.substring(0, 2).replace(/^0/, '') + ':' + str.substring(2);
                };
                
                // 인정시간 조정 여부 표시
                let recognizedTimeDisplay = String(displayHours);
                if (actualResult.adjusted) {
                    recognizedTimeDisplay = `<span style="color:#f59e0b;" title="${actualResult.reason}">${displayHours}</span>`;
                } else if (actualResult.noAttendance) {
                    recognizedTimeDisplay = `<span style="color:#6b7280;" title="근태 미등록">${displayHours}*</span>`;
                }
                
                html += `
                    <tr>
                        <td>${escapeHtml(uniqueCode)}</td>
                        <td>${escapeHtml(appointmentCode)}</td>
                        <td>${record.date}</td>
                        <td>${escapeHtml(displayName)}</td>
                        <td>${escapeHtml(dept)}</td>
                        <td>${checkIn || '-'}</td>
                        <td>${checkOut || '-'}</td>
                        <td>${formatTime(record.actualStart)}</td>
                        <td>${formatTime(record.actualEnd)}</td>
                        <td class="text-right">${recognizedTimeDisplay}</td>
                        <td class="text-right">${is15x ? displayHours : ''}</td>
                        <td class="text-right">${!is15x ? displayHours : ''}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                    </tr>
                `;
            });
            
            // 디버깅 소계 로그
            console.log(`📊 소계: 인정=${empTotalMinutes/60}시간, 가산=${empTotal15x/60}시간, 미가산=${empTotal10x/60}시간`);
            console.groupEnd();
            
            // 직원별 소계 (절사 적용)
            const empPay15x = SalaryCalculator.applyOvertimeRounding(empRawPay15x, year);
            const empPay10x = SalaryCalculator.applyOvertimeRounding(empRawPay10x, year);
            const empTotalPay = empPay15x + empPay10x;
            
            // 전체 합계에 추가
            grandTotalMinutes += empTotalMinutes;
            grandTotal15x += empTotal15x;
            grandTotal10x += empTotal10x;
            grandTotalPay15x += empPay15x;
            grandTotalPay10x += empPay10x;
            grandTotalPay += empTotalPay;
            
            // 소계 행 - 배율 적용된 시급 표시
            const rawHourlyForDisplay = salary.rawHourlyWage || salary.hourlyWage;
            const hourlyWage15xDisplay = SalaryCalculator.getRatedHourlyWage(rawHourlyForDisplay, 1.5, year);
            const hourlyWage10xDisplay = SalaryCalculator.getRatedHourlyWage(rawHourlyForDisplay, 1, year);
            
            html += `
                <tr class="subtotal-row">
                    <td>${escapeHtml(uniqueCode)}</td>
                    <td>${escapeHtml(appointmentCode)}</td>
                    <td><strong>소계</strong></td>
                    <td><strong>${escapeHtml(displayName)}</strong></td>
                    <td>${escapeHtml(dept)}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td class="text-right"><strong>${(empTotalMinutes / 60).toFixed(0)}</strong></td>
                    <td class="text-right"><strong>${empTotal15x > 0 ? (empTotal15x / 60).toFixed(0) : ''}</strong></td>
                    <td class="text-right"><strong>${empTotal10x > 0 ? (empTotal10x / 60).toFixed(0) : ''}</strong></td>
                    <td class="text-right">${formatCurrency(salary.ordinaryWage)}</td>
                    <td class="text-right">${empTotal15x > 0 ? formatCurrency(hourlyWage15xDisplay) : ''}</td>
                    <td class="text-right">${empPay15x > 0 ? formatCurrency(empPay15x) : ''}</td>
                    <td class="text-right">${empTotal10x > 0 ? formatCurrency(hourlyWage10xDisplay) : ''}</td>
                    <td class="text-right">${empPay10x > 0 ? formatCurrency(empPay10x) : ''}</td>
                    <td class="text-right amount"><strong>${formatCurrency(empTotalPay)}</strong></td>
                </tr>
            `;
        });
        
        // 전체 합계 행
        html += `
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td colspan="2"></td>
                            <td><strong>합계</strong></td>
                            <td></td>
                            <td></td>
                            <td colspan="4"></td>
                            <td class="text-right"><strong>${(grandTotalMinutes / 60).toFixed(0)}</strong></td>
                            <td class="text-right"><strong>${grandTotal15x > 0 ? (grandTotal15x / 60).toFixed(0) : ''}</strong></td>
                            <td class="text-right"><strong>${grandTotal10x > 0 ? (grandTotal10x / 60).toFixed(0) : ''}</strong></td>
                            <td></td>
                            <td></td>
                            <td class="text-right"><strong>${grandTotalPay15x > 0 ? formatCurrency(grandTotalPay15x) : ''}</strong></td>
                            <td></td>
                            <td class="text-right"><strong>${grandTotalPay10x > 0 ? formatCurrency(grandTotalPay10x) : ''}</strong></td>
                            <td class="text-right amount-total"><strong>${formatCurrency(grandTotalPay)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error('상세 보고서 생성 오류:', e);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>❌</span>
                <span>보고서 생성 중 오류가 발생했습니다: ${e.message}</span>
            </div>
        `;
    }
}

// ===== 상세 보고서 엑셀 다운로드 =====
async function downloadDetailExcel() {
    const compTypeFilter = document.getElementById('reportCompType').value;
    const year = document.getElementById('reportYear').value;
    const month = document.getElementById('reportMonth').value;
    
    // ExcelJS 로드 확인
    if (typeof ExcelJS === 'undefined') {
        alert('엑셀 라이브러리를 로드하지 못했습니다. 인터넷 연결을 확인해주세요.');
        return;
    }
    
    // 대휴 보고서인 경우
    if (compTypeFilter === 'leave') {
        await downloadLeaveDetailExcel(year, month);
        return;
    }
    
    // 수당 보고서인 경우
    const table = document.getElementById('detailReportTable');
    if (!table) {
        alert('먼저 조회를 실행해주세요.');
        return;
    }
    
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '시간외근무 관리 시스템';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet(`${year}년 ${month}월 상세내역`);
        
        // 제외할 열 인덱스 (고유번호:0, 발령코드:1, 부서:4)
        const excludeColumns = [0, 1, 4];
        
        // 헤더 추출 (제외 열 제외)
        const headers = [];
        table.querySelectorAll('thead th').forEach((th, idx) => {
            if (!excludeColumns.includes(idx)) {
                headers.push(th.textContent.trim());
            }
        });
        
        // 제목 행 추가
        const titleRow = worksheet.addRow([`${year}년 ${month}월 시간외근무 상세 내역`]);
        worksheet.mergeCells(1, 1, 1, headers.length);
        titleRow.getCell(1).font = { bold: true, size: 16 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        
        // 빈 행
        worksheet.addRow([]);
        
        // 헤더 행 추가
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            cell.font = { bold: true, size: 9 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        
        // 데이터 행 추출 (제외 열 제외)
        table.querySelectorAll('tbody tr').forEach(tr => {
            const rowData = [];
            const isSubtotal = tr.classList.contains('subtotal-row');
            const isTotal = tr.classList.contains('total-row');
            
            tr.querySelectorAll('td').forEach((td, idx) => {
                if (excludeColumns.includes(idx)) return;
                
                let value = td.textContent.trim();
                const cleanValue = value.replace(/,/g, '').replace(/h$/, '').replace(/원$/, '');
                
                if (cleanValue !== '' && !isNaN(cleanValue) && cleanValue !== '-') {
                    rowData.push(Number(cleanValue));
                } else {
                    rowData.push(value);
                }
            });
            
            const dataRow = worksheet.addRow(rowData);
            
            dataRow.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.font = { size: 9 };
                
                if (isSubtotal) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE8F4FD' }
                    };
                    cell.font = { bold: true, size: 9 };
                    cell.border.bottom = { style: 'medium', color: { argb: 'FF3B82F6' } };
                }
                
                if (isTotal) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF0FDF4' }
                    };
                    cell.font = { bold: true, size: 10 };
                    cell.border.top = { style: 'medium', color: { argb: 'FF22C55E' } };
                }
                
                if (typeof cell.value === 'number') {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    if (cell.value >= 1000) {
                        cell.numFmt = '#,##0';
                    }
                } else {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });
        });
        
        // 열 너비 설정
        const columnWidths = [11, 10, 9, 9, 10, 10, 9, 8, 8, 11, 12, 11, 12, 11, 11];
        worksheet.columns.forEach((col, idx) => {
            col.width = columnWidths[idx] || 10;
        });
        
        // 파일 다운로드
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `시간외근무_상세내역_${year}년${month}월.xlsx`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
    } catch (e) {
        console.error('엑셀 다운로드 오류:', e);
        alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
}

// ===== 대휴 상세 보고서 엑셀 다운로드 =====
async function downloadLeaveDetailExcel(year, month) {
    const table = document.getElementById('leaveDetailReportTable');
    if (!table) {
        alert('먼저 조회를 실행해주세요.');
        return;
    }
    
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '시간외근무 관리 시스템';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet(`${year}년 ${month}월 대휴내역`);
        
        // 제목 행
        const titleRow = worksheet.addRow([`${year}년 ${month}월 시간외근무 직원 대휴 내역`]);
        worksheet.mergeCells(1, 1, 1, 11);
        titleRow.getCell(1).font = { bold: true, size: 16 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        
        // 빈 행
        worksheet.addRow([]);
        
        // 상단 테이블 (일자별 내역)
        const mainTable = table.querySelector('table');
        if (mainTable) {
            // 헤더
            const headers = [];
            mainTable.querySelectorAll('thead th').forEach(th => {
                headers.push(th.textContent.trim());
            });
            
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE0E0E0' }
                };
                cell.font = { bold: true, size: 9 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            
            // 데이터 행
            mainTable.querySelectorAll('tbody tr').forEach(tr => {
                const rowData = [];
                const bgColor = tr.style.background;
                
                tr.querySelectorAll('td').forEach(td => {
                    let value = td.textContent.trim();
                    const cleanValue = value.replace(/,/g, '');
                    
                    if (cleanValue !== '' && !isNaN(cleanValue) && cleanValue !== '-') {
                        rowData.push(Number(cleanValue));
                    } else {
                        rowData.push(value);
                    }
                });
                
                const dataRow = worksheet.addRow(rowData);
                
                dataRow.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                    cell.font = { size: 9 };
                    
                    if (bgColor && bgColor.includes('E6F3FF')) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE6F3FF' }
                        };
                    }
                    
                    if (typeof cell.value === 'number') {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        if (colNumber === 10 && cell.value % 1 !== 0) {
                            cell.font = { size: 9, color: { argb: 'FFFF0000' }, bold: true };
                        }
                    } else {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    }
                });
            });
        }
        
        // 빈 행 2개
        worksheet.addRow([]);
        worksheet.addRow([]);
        
        // 하단: 직원별 집계 섹션
        const summarySection = table.querySelector('div[style*="background:#f0f0f0"]');
        if (summarySection) {
            const summaryTitle = worksheet.addRow(['📊 직원별 대휴 내역 집계']);
            summaryTitle.getCell(1).font = { bold: true, size: 12 };
            worksheet.addRow([]);
            
            summarySection.querySelectorAll('table').forEach(empTable => {
                empTable.querySelectorAll('tr').forEach(tr => {
                    const rowData = [];
                    const isHeader = tr.style.background && tr.style.background.includes('d9d9d9');
                    
                    tr.querySelectorAll('td').forEach(td => {
                        let value = td.textContent.trim();
                        const cleanValue = value.replace(/,/g, '');
                        
                        if (cleanValue !== '' && !isNaN(cleanValue) && cleanValue !== '-') {
                            rowData.push(Number(cleanValue));
                        } else {
                            rowData.push(value);
                        }
                    });
                    
                    const dataRow = worksheet.addRow(rowData);
                    
                    dataRow.eachCell((cell, colNumber) => {
                        cell.border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            bottom: { style: 'thin' },
                            right: { style: 'thin' }
                        };
                        cell.font = { size: 9 };
                        
                        if (isHeader) {
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: 'FFD9D9D9' }
                            };
                            cell.font = { bold: true, size: 9 };
                        }
                        
                        if (typeof cell.value === 'number') {
                            cell.alignment = { horizontal: 'right', vertical: 'middle' };
                        } else {
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        }
                    });
                });
                
                worksheet.addRow([]);
            });
        }
        
        // 열 너비 설정
        const columnWidths = [12, 10, 10, 10, 14, 14, 10, 12, 12, 10, 10];
        worksheet.columns.forEach((col, idx) => {
            col.width = columnWidths[idx] || 10;
        });
        
        // 파일 다운로드
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `시간외근무_대휴내역_${year}년${month}월.xlsx`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
    } catch (e) {
        console.error('대휴 엑셀 다운로드 오류:', e);
        alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
}

// ===== 상세 보고서 인쇄 =====
function printDetailReport() {
    const compTypeFilter = document.getElementById('reportCompType').value;
    const year = document.getElementById('reportYear').value;
    const month = document.getElementById('reportMonth').value;
    
    // 대휴 보고서인 경우
    if (compTypeFilter === 'leave') {
        const reportTable = document.getElementById('leaveDetailReportTable');
        if (!reportTable) {
            alert('먼저 조회를 실행해주세요.');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>시간외근무 대휴 내역 - ${year}년 ${month}월</title>
                <style>
                    body {
                        font-family: 'Malgun Gothic', sans-serif;
                        font-size: 9px;
                        margin: 15px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 15px;
                    }
                    th, td {
                        border: 1px solid #333;
                        padding: 3px 5px;
                        text-align: center;
                    }
                    th {
                        background: #f0f0f0;
                        font-weight: bold;
                    }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    @media print {
                        body { margin: 10px; }
                        tr[style*="background:#E6F3FF"] { background: #E6F3FF !important; -webkit-print-color-adjust: exact; }
                        tr[style*="background:#d9d9d9"] { background: #d9d9d9 !important; -webkit-print-color-adjust: exact; }
                    }
                    @page {
                        size: landscape;
                        margin: 10mm;
                    }
                </style>
            </head>
            <body>
                ${reportTable.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
        return;
    }
    
    // 수당 보고서인 경우
    const reportTable = document.getElementById('detailReportTable');
    if (!reportTable) {
        alert('먼저 조회를 실행해주세요.');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>시간외근무 상세 보고서 - ${year}년 ${month}월</title>
            <style>
                body {
                    font-family: 'Malgun Gothic', sans-serif;
                    font-size: 9px;
                    margin: 15px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #333;
                    padding: 3px 5px;
                    text-align: center;
                }
                th {
                    background: #f0f0f0;
                    font-weight: bold;
                }
                .text-right { text-align: right; }
                .text-left { text-align: left; }
                .subtotal-row {
                    background: #e8e8e8;
                    font-weight: bold;
                    border-bottom: 2px solid #3b82f6;
                }
                .total-row {
                    background: #d0d0d0;
                    font-weight: bold;
                }
                .amount { color: #1e40af; }
                .amount-total { color: #059669; font-size: 10px; }
                /* 인쇄 시 고유번호, 발령코드 열 숨김 */
                th:nth-child(1), td:nth-child(1),
                th:nth-child(2), td:nth-child(2) {
                    display: none;
                }
                @media print {
                    body { margin: 10px; }
                    .subtotal-row { background: #e8e8e8 !important; border-bottom: 2px solid #3b82f6 !important; -webkit-print-color-adjust: exact; }
                    .total-row { background: #d0d0d0 !important; -webkit-print-color-adjust: exact; }
                }
                @page {
                    size: landscape;
                    margin: 10mm;
                }
            </style>
        </head>
        <body>
            ${reportTable.innerHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
    }, 500);
}
