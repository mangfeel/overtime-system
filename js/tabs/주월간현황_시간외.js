/**
 * 주월간현황_시간외.js - 주간현황 + 월간 수당 현황
 * 
 * 주간현황 대시보드: 주간 시간외근무 시간 집계, 초과자 표시
 * 월간 수당 현황: 월간 수당 20시간 초과 감지
 * 
 * @version 1.0.0
 * @since 2026-02-05
 * 
 * [의존성] 상수_시간외.js (OVERTIME_TYPES)
 * [의존성] 데이터베이스_시간외.js (OvertimeDB)
 * [의존성] 유틸_시간외.js (formatMinutesToTime, escapeHtml, calculateActualRecognizedMinutes)
 * [의존성] 설정_시간외.js (getLimitSettings)
 */

// ===== 전역 변수 =====
let currentWeekStart = null;

// ===== 주간현황 초기화 =====

function initWeeklyReport() {
    currentWeekStart = getMonday(new Date());
    updateWeekDisplay();
}

// ===== 주 네비게이션 =====

function goToCurrentWeek() {
    currentWeekStart = getMonday(new Date());
    updateWeekDisplay();
    generateWeeklyReport();
}

function changeWeek(delta) {
    if (!currentWeekStart) {
        currentWeekStart = getMonday(new Date());
    }
    currentWeekStart.setDate(currentWeekStart.getDate() + (delta * 7));
    updateWeekDisplay();
    generateWeeklyReport();
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function updateWeekDisplay() {
    if (!currentWeekStart) {
        currentWeekStart = getMonday(new Date());
    }
    
    const sunday = new Date(currentWeekStart);
    sunday.setDate(sunday.getDate() + 6);
    
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const el = document.getElementById('weeklyDateRange');
    if (el) el.textContent = `${formatDate(currentWeekStart)} ~ ${formatDate(sunday)}`;
}

// ===== 주간 보고서 =====

async function generateWeeklyReport() {
    if (!currentWeekStart) {
        currentWeekStart = getMonday(new Date());
        updateWeekDisplay();
    }
    
    const container = document.getElementById('weeklyReportContainer');
    const showOverOnly = document.getElementById('weeklyShowOverOnly')?.checked || false;
    const limits = await getLimitSettings();
    
    try {
        const dailyData = await OvertimeDB.getOvertimeDaily();
        const attendanceData = await OvertimeDB.getAttendance();
        const empList = employees || [];
        
        // 주간 날짜 배열 (월~일)
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        }
        
        const weekYear = currentWeekStart.getFullYear();
        const weekMonth = currentWeekStart.getMonth() + 1;
        
        // 직원별 주간 데이터 수집
        const weeklyData = [];
        
        empList.forEach(emp => {
            const empId = emp.id;
            const empName = emp.personalInfo?.name || emp.name || '';
            const dept = emp.currentPosition?.dept || '';
            
            const dailyHours = [];
            let weekTotalMinutes = 0;
            let hasRecords = false;
            
            weekDates.forEach(dateStr => {
                const year = dateStr.substring(0, 4);
                const month = String(parseInt(dateStr.substring(5, 7)));
                
                const records = dailyData[year]?.[month]?.[empId]?.records || [];
                const dayRecords = records.filter(r => r.date === dateStr);
                
                let dayMinutes = 0;
                dayRecords.forEach(record => {
                    const actualResult = calculateActualRecognizedMinutes(record, attendanceData, empId, dateStr);
                    dayMinutes += actualResult.minutes;
                });
                
                if (dayRecords.length > 0) hasRecords = true;
                weekTotalMinutes += dayMinutes;
                dailyHours.push({
                    date: dateStr,
                    minutes: dayMinutes,
                    hours: (dayMinutes / 60).toFixed(1)
                });
            });
            
            if (hasRecords) {
                const weekTotalHours = weekTotalMinutes / 60;
                const isOver = weekTotalHours > limits.weeklyLimit;
                
                if (!showOverOnly || isOver) {
                    weeklyData.push({ empId, empName, dept, dailyHours, weekTotalHours: weekTotalHours.toFixed(1), isOver });
                }
            }
        });
        
        // 부서, 이름순 정렬
        weeklyData.sort((a, b) => {
            if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
            return a.empName.localeCompare(b.empName);
        });
        
        // 월간 수당 초과자
        const monthlyOverList = _calculateMonthlyPayOver(empList, dailyData, attendanceData, weekMonth, weekYear, limits.monthlyPayLimit);
        
        if (weeklyData.length === 0 && monthlyOverList.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-text">해당 기간에 시간외근무 기록이 없습니다</div>
                </div>
            `;
            return;
        }
        
        const overCount = weeklyData.filter(d => d.isOver).length;
        const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
        
        let html = '';
        
        // 월간 수당 초과 경고
        if (monthlyOverList.length > 0) {
            html += `
                <div style="margin-bottom:20px;padding:15px;background:#fef2f2;border:2px solid #dc2626;border-radius:8px;">
                    <div style="font-weight:600;color:#dc2626;margin-bottom:10px;">
                        🚨 월간 수당 ${limits.monthlyPayLimit}시간 초과자 (${weekMonth}월)
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:10px;">
            `;
            monthlyOverList.forEach(item => {
                html += `
                    <span style="padding:5px 12px;background:#fee2e2;border-radius:20px;font-size:13px;">
                        ${item.dept} <strong>${item.empName}</strong>: ${item.totalHours}h
                    </span>
                `;
            });
            html += `</div></div>`;
        }
        
        // 주간 초과 요약
        if (overCount > 0) {
            html += `
                <div style="margin-bottom:15px;padding:12px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;">
                    <span style="color:#dc2626;font-weight:600;">⚠️ 주간 ${limits.weeklyLimit}시간 초과: ${overCount}명</span>
                </div>
            `;
        } else if (weeklyData.length > 0) {
            html += `
                <div style="margin-bottom:15px;padding:12px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;">
                    <span style="color:#166534;font-weight:600;">✅ 주간 ${limits.weeklyLimit}시간 초과자 없음</span>
                </div>
            `;
        }
        
        // 주간 테이블
        if (weeklyData.length > 0) {
            html += `
                <div class="table-container" style="overflow-x:auto;">
                    <table style="min-width:800px;">
                        <thead>
                            <tr>
                                <th>부서</th>
                                <th>이름</th>
            `;
            
            weekDates.forEach((date, idx) => {
                const dayNum = date.substring(8);
                html += `<th style="text-align:center;">${dayLabels[idx]}<br><small>${dayNum}일</small></th>`;
            });
            
            html += `
                                <th style="text-align:center;background:#f1f5f9;">합계</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            weeklyData.forEach(row => {
                const rowStyle = row.isOver ? 'background:#fef2f2;' : '';
                html += `<tr style="${rowStyle}">`;
                html += `<td>${escapeHtml(row.dept)}</td>`;
                html += `<td>${escapeHtml(row.empName)}</td>`;
                
                row.dailyHours.forEach(day => {
                    const val = parseFloat(day.hours);
                    const cellStyle = val > 0 ? 'color:#1e40af;font-weight:500;' : 'color:#9ca3af;';
                    html += `<td style="text-align:center;${cellStyle}">${val > 0 ? day.hours : '-'}</td>`;
                });
                
                const totalStyle = row.isOver 
                    ? 'background:#dc2626;color:white;font-weight:700;' 
                    : 'background:#f1f5f9;font-weight:600;';
                html += `<td style="text-align:center;${totalStyle}">${row.weekTotalHours}h ${row.isOver ? '⚠️' : ''}</td>`;
                html += `</tr>`;
            });
            
            html += `</tbody></table></div>`;
        }
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error('주간 현황 조회 오류:', e);
        container.innerHTML = `<div class="alert alert-error">오류가 발생했습니다: ${e.message}</div>`;
    }
}

// ===== 주간현황 검색 필터 =====

function filterWeeklyTable() {
    const searchInput = document.getElementById('weeklySearchInput');
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const table = document.querySelector('#weeklyReportContainer table');
    
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    let visibleCount = 0;
    let totalCount = rows.length;
    
    rows.forEach(row => {
        const dept = row.cells[0]?.textContent.toLowerCase() || '';
        const name = row.cells[1]?.textContent.toLowerCase() || '';
        
        if (searchTerm === '' || dept.includes(searchTerm) || name.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('weeklySearchCount');
    if (countEl) {
        countEl.textContent = searchTerm ? `(${visibleCount}/${totalCount}명 표시)` : '';
    }
}

// ===== 월간 수당 초과 계산 (내부) =====

function _calculateMonthlyPayOver(empList, dailyData, attendanceData, month, year, limit) {
    const overList = [];
    
    empList.forEach(emp => {
        const empId = emp.id;
        const empName = emp.personalInfo?.name || emp.name || '';
        const dept = emp.currentPosition?.dept || '';
        
        const monthData = dailyData[String(year)]?.[String(month)]?.[empId];
        if (!monthData || !monthData.records) return;
        
        let totalPayMinutes = 0;
        monthData.records.forEach(record => {
            if (record.compensationType === 'pay') {
                const actualResult = calculateActualRecognizedMinutes(record, attendanceData, empId, record.date);
                totalPayMinutes += actualResult.minutes;
            }
        });
        
        const totalPayHours = totalPayMinutes / 60;
        if (totalPayHours > limit) {
            overList.push({ empId, empName, dept, totalHours: totalPayHours.toFixed(1) });
        }
    });
    
    overList.sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
    return overList;
}

// ===== 월간 수당 20시간 초과 보고서 =====

async function generateMonthlyPayOverReport() {
    const container = document.getElementById('monthlyPayOverContainer');
    const year = parseInt(document.getElementById('monthlyPayOverYear').value);
    const month = parseInt(document.getElementById('monthlyPayOverMonth').value);
    const showOverOnly = document.getElementById('monthlyPayOverOnly')?.checked || false;
    
    try {
        const empList = employees || [];
        const dailyData = await OvertimeDB.getOvertimeDaily();
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = dailyData[String(year)]?.[String(month)] || {};
        
        const monthlyData = {};
        
        Object.keys(monthData).forEach(empId => {
            const records = monthData[empId].records || [];
            const emp = empList.find(e => e.id === empId);
            if (!emp) return;
            
            records.forEach(record => {
                if (record.compensationType !== 'pay') return;
                
                if (!monthlyData[empId]) {
                    monthlyData[empId] = {
                        empId,
                        name: emp.personalInfo?.name || emp.name || '',
                        dept: emp.currentPosition?.dept || '',
                        payMinutes: 0,
                        recordCount: 0
                    };
                }
                
                const actualResult = calculateActualRecognizedMinutes(record, attendanceData, empId, record.date);
                monthlyData[empId].payMinutes += actualResult.minutes;
                monthlyData[empId].recordCount++;
            });
        });
        
        let reportData = Object.values(monthlyData);
        reportData.sort((a, b) => b.payMinutes - a.payMinutes);
        
        if (showOverOnly) {
            reportData = reportData.filter(row => row.payMinutes > 1200);
        }
        
        const overCount = Object.values(monthlyData).filter(row => row.payMinutes > 1200).length;
        
        if (reportData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${showOverOnly ? '✅' : '💰'}</div>
                    <div class="empty-state-text">${showOverOnly ? '월 20시간 초과자가 없습니다' : '해당 월에 수당 기록이 없습니다'}</div>
                </div>
            `;
            return;
        }
        
        let html = `
            <div style="margin-bottom:15px;padding:12px;background:${overCount > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:8px;border:1px solid ${overCount > 0 ? '#fecaca' : '#bbf7d0'};">
                <span style="font-size:14px;color:${overCount > 0 ? '#dc2626' : '#16a34a'};">
                    ${overCount > 0 ? `⚠️ 월 20시간(수당) 초과: <strong>${overCount}명</strong>` : '✅ 월 20시간 초과자 없음'}
                </span>
                <span style="margin-left:20px;color:#6b7280;">총 ${reportData.length}명 조회</span>
            </div>
            
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>부서</th>
                            <th>이름</th>
                            <th>수당 시간</th>
                            <th>건수</th>
                            <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        reportData.forEach(row => {
            const payHours = row.payMinutes / 60;
            const isOver = row.payMinutes > 1200;
            const rowStyle = isOver ? 'background:#fef2f2;' : '';
            
            html += `<tr style="${rowStyle}">`;
            html += `<td>${escapeHtml(row.dept)}</td>`;
            html += `<td>${escapeHtml(row.name)}</td>`;
            html += `<td class="text-right" style="font-weight:600;${isOver ? 'color:#dc2626;' : ''}">${payHours.toFixed(1)}h</td>`;
            html += `<td class="text-center">${row.recordCount}건</td>`;
            
            if (isOver) {
                const overHours = (row.payMinutes - 1200) / 60;
                html += `<td class="text-center"><span style="background:#fecaca;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:12px;">⚠️ +${overHours.toFixed(1)}h 초과</span></td>`;
            } else {
                const remaining = (1200 - row.payMinutes) / 60;
                html += `<td class="text-center"><span style="color:#6b7280;font-size:12px;">잔여 ${remaining.toFixed(1)}h</span></td>`;
            }
            
            html += `</tr>`;
        });
        
        html += `</tbody></table></div>`;
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error('월간 수당 초과 보고서 생성 오류:', e);
        container.innerHTML = `<div class="alert alert-error">오류: ${e.message}</div>`;
    }
}

// ===== 월간 수당 현황 검색 필터 =====

function filterMonthlyPayTable() {
    const searchInput = document.getElementById('monthlyPaySearchInput');
    const searchTerm = (searchInput?.value || '').toLowerCase().trim();
    const table = document.querySelector('#monthlyPayOverContainer table');
    
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    let visibleCount = 0;
    let totalCount = rows.length;
    
    rows.forEach(row => {
        const dept = row.cells[0]?.textContent.toLowerCase() || '';
        const name = row.cells[1]?.textContent.toLowerCase() || '';
        
        if (searchTerm === '' || dept.includes(searchTerm) || name.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('monthlyPaySearchCount');
    if (countEl) {
        countEl.textContent = searchTerm ? `(${visibleCount}/${totalCount}명 표시)` : '';
    }
}

console.log('[주월간현황] 주월간현황_시간외.js 로드 완료');
