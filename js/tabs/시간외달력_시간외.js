/**
 * 시간외달력_시간외.js
 * 시간외근무 달력 (캘린더) 모듈
 * - 월간 달력 표시, 날짜별 시간외근무 현황
 * - 달력 클릭으로 일별입력 날짜 연동
 */

// ===== 시간외근무 달력 초기화 =====
function initOvertimeCalendar() {
    const yearSelect = document.getElementById('overtimeCalendarYear');
    const monthSelect = document.getElementById('overtimeCalendarMonth');
    
    // 연도 옵션 생성
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '년';
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    
    // 현재 월 선택
    monthSelect.value = new Date().getMonth() + 1;
    
    // 달력 로드
    loadOvertimeCalendar();
}

/**
 * 시간외근무 달력 월 변경
 */
function changeOvertimeCalendarMonth(delta) {
    const yearSelect = document.getElementById('overtimeCalendarYear');
    const monthSelect = document.getElementById('overtimeCalendarMonth');
    
    let year = parseInt(yearSelect.value);
    let month = parseInt(monthSelect.value) + delta;
    
    if (month < 1) {
        month = 12;
        year--;
    } else if (month > 12) {
        month = 1;
        year++;
    }
    
    yearSelect.value = year;
    monthSelect.value = month;
    
    loadOvertimeCalendar();
}

/**
 * 시간외근무 달력 로드
 */
async function loadOvertimeCalendar() {
    const container = document.getElementById('overtimeCalendarContainer');
    const year = parseInt(document.getElementById('overtimeCalendarYear').value);
    const month = parseInt(document.getElementById('overtimeCalendarMonth').value);
    
    // 해당 월의 시간외근무 데이터 가져오기
    const overtimeData = await OvertimeDB.getOvertimeDaily();
    const monthData = overtimeData[String(year)]?.[String(month)] || {};
    
    // 전체 직원 데이터 (전역 employees 사용)
    const empNameMap = {};
    (window.employees || []).forEach(e => {
        empNameMap[e.id] = e.personalInfo?.name || e.name || '?';
    });
    
    // 해당 월의 날짜 정보
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    // 오늘 날짜
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    
    // 현재 선택된 날짜
    const selectedDate = document.getElementById('bulkInputDate').value;
    
    // 날짜별 시간외근무 상세 집계
    const dailyStats = {};
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dailyStats[dateStr] = {
            totalRecords: 0,
            uniqueEmployees: new Set(),
            morning: { count: 0, names: [] },
            night: { count: 0, names: [] },
            holiday: { count: 0, names: [] },
            pay15: { count: 0, names: [] },
            pay10: { count: 0, names: [] },
            leave15: { count: 0, names: [] },
            leave10: { count: 0, names: [] }
        };
    }
    
    // 시간외근무 데이터에서 상세 집계
    Object.keys(monthData).forEach(empId => {
        const empRecords = monthData[empId]?.records || [];
        const empName = empNameMap[empId] || '?';
        
        empRecords.forEach(record => {
            if (!dailyStats[record.date]) return;
            
            const stats = dailyStats[record.date];
            stats.totalRecords++;
            stats.uniqueEmployees.add(empId);
            
            // 구분별 (조근/야근/휴일)
            if (record.dayType === 'morning') {
                stats.morning.count++;
                if (!stats.morning.names.includes(empName)) stats.morning.names.push(empName);
            } else if (record.dayType === 'night') {
                stats.night.count++;
                if (!stats.night.names.includes(empName)) stats.night.names.push(empName);
            } else if (record.dayType === 'holiday') {
                stats.holiday.count++;
                if (!stats.holiday.names.includes(empName)) stats.holiday.names.push(empName);
            }
            
            // 유형별 (1.5배/1.0배) + 보상방식 (수당/대휴)
            const typeInfo = OVERTIME_TYPES[record.overtimeType] || {};
            const rate = typeInfo.rate || 1;
            const is15x = rate >= 1.5;
            const isPay = record.compensationType === 'pay';
            
            if (isPay && is15x) {
                stats.pay15.count++;
                if (!stats.pay15.names.includes(empName)) stats.pay15.names.push(empName);
            } else if (isPay && !is15x) {
                stats.pay10.count++;
                if (!stats.pay10.names.includes(empName)) stats.pay10.names.push(empName);
            } else if (!isPay && is15x) {
                stats.leave15.count++;
                if (!stats.leave15.names.includes(empName)) stats.leave15.names.push(empName);
            } else {
                stats.leave10.count++;
                if (!stats.leave10.names.includes(empName)) stats.leave10.names.push(empName);
            }
        });
    });
    
    // HTML 생성
    let html = `
        <div class="overtime-calendar">
            <div class="calendar-header sun">일</div>
            <div class="calendar-header">월</div>
            <div class="calendar-header">화</div>
            <div class="calendar-header">수</div>
            <div class="calendar-header">목</div>
            <div class="calendar-header">금</div>
            <div class="calendar-header sat">토</div>
    `;
    
    // 빈 셀 (이전 월)
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-cell empty"></div>';
    }
    
    // 날짜 셀
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = (startDayOfWeek + d - 1) % 7;
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;
        
        // 공휴일 체크
        const holiday = checkHoliday(dateStr);
        const isHoliday = holiday && holiday.isHoliday && holiday.name !== '토요일' && holiday.name !== '일요일';
        
        // 등록 현황
        const stats = dailyStats[dateStr];
        const totalRecords = stats.totalRecords;
        const uniqueCount = stats.uniqueEmployees.size;
        
        // 셀 클래스 결정
        let cellClass = 'calendar-cell';
        if (isToday) cellClass += ' today';
        if (isSelected) cellClass += ' selected';
        
        if (isSunday || isSaturday || isHoliday) {
            if (totalRecords > 0) cellClass += ' has-partial';
        } else {
            if (totalRecords > 0) cellClass += ' has-full';
            else cellClass += ' has-none';
        }
        
        // 날짜 클래스
        let dateClass = 'calendar-date';
        if (isSunday || isHoliday) dateClass += ' sun';
        else if (isSaturday) dateClass += ' sat';
        
        // 툴팁 생성
        let tooltipLines = [`📅 ${dateStr}`];
        if (totalRecords > 0) {
            tooltipLines.push(`━━━━━━━━━━━━━━`);
            tooltipLines.push(`📊 총 ${totalRecords}건 (${uniqueCount}명)`);
            tooltipLines.push('');
            
            if (stats.morning.count > 0) {
                tooltipLines.push(`🌅 조근: ${stats.morning.count}건`);
                tooltipLines.push(`   └ ${stats.morning.names.join(', ')}`);
            }
            if (stats.night.count > 0) {
                tooltipLines.push(`🌙 야근: ${stats.night.count}건`);
                tooltipLines.push(`   └ ${stats.night.names.join(', ')}`);
            }
            if (stats.holiday.count > 0) {
                tooltipLines.push(`📅 휴일: ${stats.holiday.count}건`);
                tooltipLines.push(`   └ ${stats.holiday.names.join(', ')}`);
            }
            
            tooltipLines.push('');
            
            if (stats.pay15.count > 0) {
                tooltipLines.push(`💰 수당1.5배: ${stats.pay15.count}건`);
                tooltipLines.push(`   └ ${stats.pay15.names.join(', ')}`);
            }
            if (stats.pay10.count > 0) {
                tooltipLines.push(`💵 수당1.0배: ${stats.pay10.count}건`);
                tooltipLines.push(`   └ ${stats.pay10.names.join(', ')}`);
            }
            if (stats.leave15.count > 0) {
                tooltipLines.push(`🏖️ 대휴1.5배: ${stats.leave15.count}건`);
                tooltipLines.push(`   └ ${stats.leave15.names.join(', ')}`);
            }
            if (stats.leave10.count > 0) {
                tooltipLines.push(`🌴 대휴1.0배: ${stats.leave10.count}건`);
                tooltipLines.push(`   └ ${stats.leave10.names.join(', ')}`);
            }
        } else {
            tooltipLines.push('등록된 시간외근무 없음');
        }
        const tooltipText = tooltipLines.join('\n');
        
        // 통계 표시 (셀 내부)
        let statsHtml = '';
        if (totalRecords > 0) {
            const countDisplay = totalRecords === uniqueCount 
                ? `${totalRecords}명` 
                : `${totalRecords}건(${uniqueCount}명)`;
            
            let detailParts = [];
            if (stats.morning.count > 0) detailParts.push(`조${stats.morning.count}`);
            if (stats.night.count > 0) detailParts.push(`야${stats.night.count}`);
            if (stats.holiday.count > 0) detailParts.push(`휴${stats.holiday.count}`);
            const detailStr = detailParts.length > 0 ? detailParts.join('/') : '';
            
            statsHtml = `
                <div class="ot-stats">
                    <div class="ot-count">${countDisplay}</div>
                    ${detailStr ? `<div class="ot-detail">${detailStr}</div>` : ''}
                </div>
            `;
        } else if (!isSunday && !isSaturday && !isHoliday) {
            statsHtml = `<div class="ot-stats" style="color:#9ca3af;">-</div>`;
        }
        
        // 공휴일명 표시
        let holidayHtml = '';
        if (isHoliday) {
            holidayHtml = `<div style="font-size:9px;color:#ef4444;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${holiday.name}</div>`;
        }
        
        html += `
            <div class="${cellClass}" onclick="selectOvertimeCalendarDate('${dateStr}')" 
                 onmouseenter="showOvertimeTooltip(event, \`${tooltipText.replace(/`/g, "'")}\`)"
                 onmouseleave="hideOvertimeTooltip()">
                <div class="${dateClass}">${d}</div>
                ${holidayHtml}
                ${statsHtml}
            </div>
        `;
    }
    
    // 빈 셀 (다음 월)
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-cell empty"></div>';
    }
    
    html += '</div>';
    
    container.innerHTML = html;
}

/**
 * 시간외근무 달력 툴팁 표시
 */
function showOvertimeTooltip(event, text) {
    let tooltip = document.getElementById('overtimeTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'overtimeTooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: #1f2937;
            color: white;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 12px;
            white-space: pre-line;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            pointer-events: none;
            line-height: 1.5;
        `;
        document.body.appendChild(tooltip);
    }
    
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    
    // 위치 조정
    const rect = event.target.getBoundingClientRect();
    let left = rect.right + 10;
    let top = rect.top;
    
    if (left + 300 > window.innerWidth) {
        left = rect.left - 310;
    }
    
    if (top + tooltip.offsetHeight > window.innerHeight) {
        top = window.innerHeight - tooltip.offsetHeight - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

/**
 * 시간외근무 달력 툴팁 숨김
 */
function hideOvertimeTooltip() {
    const tooltip = document.getElementById('overtimeTooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * 달력에서 날짜 선택
 */
function selectOvertimeCalendarDate(dateStr) {
    document.getElementById('bulkInputDate').value = dateStr;
    onBulkDateChange();
    loadOvertimeCalendar();  // 선택 상태 업데이트
}
