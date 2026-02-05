/**
 * 월간집계_시간외.js
 * 월간 집계 보고서 (월별 시간외근무 현황)
 * - generateMonthlyReport(): 월간 집계 테이블 생성
 * - downloadExcel(): 월간 집계 엑셀 다운로드
 * - printReport(): 월간 집계 인쇄
 * 
 * 의존: 상수_시간외.js, 데이터베이스_시간외.js, 유틸_시간외.js,
 *       설정_시간외.js, 급여계산_시간외.js, 탭관리_시간외.js
 * 전역: employees (초기화_시간외.js)
 */

// ===== 월별 집계 보고서 =====
async function generateMonthlyReport() {
    const year = parseInt(document.getElementById('monthlyYear').value);
    const month = parseInt(document.getElementById('monthlyMonth').value);
    const selectedDepts = getSelectedMonthlyDepts();
    
    const container = document.getElementById('monthlyReportContainer');
    
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
    
    // 로딩 표시
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⏳</div>
            <div class="empty-state-text">보고서를 생성 중입니다...</div>
        </div>
    `;
    
    try {
        // 데이터 로드 (async)
        const dailyData = await OvertimeDB.getOvertimeDaily();
        const attendanceData = await OvertimeDB.getAttendance();
        const monthData = dailyData[String(year)]?.[String(month)] || {};
        
        // 직원+부서별 데이터 수집 (같은 직원이라도 부서가 다르면 별도 그룹)
        const reportData = [];
        const groupedData = {};
        
        Object.keys(monthData).forEach(empId => {
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            
            const records = monthData[empId].records || [];
            if (records.length === 0) return;
            
            // 각 기록을 날짜 기준 부서별로 그룹핑
            records.forEach(record => {
                // 수당만 집계 (대휴는 별도 보고서)
                if (record.compensationType !== 'pay') return;
                
                // 해당 날짜 기준 발령 정보 조회
                const assignment = SalaryCalculator.getAssignmentAtDate(emp, record.date);
                const dept = assignment?.department || assignment?.dept || emp.currentPosition?.dept || '';
                
                // 부서 필터 적용 (선택된 부서 목록에 포함되어야 함)
                if (!selectedDepts.includes(dept)) return;
                
                // 직원+부서 키 생성
                const groupKey = `${empId}_${dept}`;
                
                if (!groupedData[groupKey]) {
                    // 해당 발령 기준 급여 계산
                    const salary = calculateEmployeeSalary(empId, year, month, record.date);
                    
                    groupedData[groupKey] = {
                        empId,
                        name: emp.personalInfo?.name || emp.name || '',
                        birthDate: emp.personalInfo?.birthDate || '',
                        dept,
                        salary,
                        records: [],
                        // 가산 (rate >= 1.5)
                        minutes15x: 0,
                        rawPay15x: 0,
                        // 미가산 (rate < 1.5)
                        minutes10x: 0,
                        rawPay10x: 0,
                        adjustedCount: 0,
                        noAttendanceCount: 0
                    };
                }
                
                groupedData[groupKey].records.push(record);
            });
        });
        
        // 각 그룹별 집계 계산
        Object.values(groupedData).forEach(group => {
            group.records.forEach(record => {
                const type = OVERTIME_TYPES[record.overtimeType] || {};
                const rate = type.rate || 1;
                const is15x = rate >= 1.5;
                
                // 실제 퇴근 시간과 비교하여 인정 시간 계산
                const actualResult = calculateActualRecognizedMinutes(record, attendanceData, group.empId, record.date);
                const minutes = actualResult.minutes;
                
                if (actualResult.adjusted) group.adjustedCount++;
                if (actualResult.noAttendance) group.noAttendanceCount++;
                
                // 가산/미가산 분리 집계 - 배율 적용된 시급 사용
                const rawHourly = group.salary.rawHourlyWage || group.salary.hourlyWage;
                const ratedHourlyWage = SalaryCalculator.getRatedHourlyWage(rawHourly, rate, year);
                
                if (is15x) {
                    group.minutes15x += minutes;
                    group.rawPay15x += ratedHourlyWage * (minutes / 60);
                } else {
                    group.minutes10x += minutes;
                    group.rawPay10x += ratedHourlyWage * (minutes / 60);
                }
            });
            
            // 총합에 절사 적용
            const pay15x = SalaryCalculator.applyOvertimeRounding(group.rawPay15x, year);
            const pay10x = SalaryCalculator.applyOvertimeRounding(group.rawPay10x, year);
            const totalPay = pay15x + pay10x;
            
            // 배율 적용된 시급 (표시용)
            const rawHourly = group.salary.rawHourlyWage || group.salary.hourlyWage;
            const hourlyWage15x = SalaryCalculator.getRatedHourlyWage(rawHourly, 1.5, year);
            const hourlyWage10x = SalaryCalculator.getRatedHourlyWage(rawHourly, 1, year);
            
            reportData.push({
                empId: group.empId,
                name: group.name,
                birthDate: group.birthDate,
                dept: group.dept,
                baseSalary: group.salary.baseSalary,
                ordinaryWage: group.salary.ordinaryWage,
                hourlyWage: group.salary.hourlyWage,
                hourlyWage15x: hourlyWage15x,
                hourlyWage10x: hourlyWage10x,
                hours15x: (group.minutes15x / 60).toFixed(1),
                hours10x: (group.minutes10x / 60).toFixed(1),
                pay15x: pay15x,
                pay10x: pay10x,
                totalPay: totalPay,
                adjustedCount: group.adjustedCount,
                noAttendanceCount: group.noAttendanceCount
            });
        });
        
        // 정렬
        reportData.sort((a, b) => {
            if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
            return a.name.localeCompare(b.name);
        });
        
        // 동명이인+같은 부서 체크 → 생년월일 표시
        reportData.forEach(row => {
            const sameNameDept = reportData.filter(r => 
                r.name === row.name && r.dept === row.dept && r.empId !== row.empId
            );
            
            if (sameNameDept.length > 0 && row.birthDate) {
                const birthStr = row.birthDate.substring(2).replace(/-/g, '.');
                row.displayName = `${row.name} (${birthStr})`;
            } else {
                row.displayName = row.name;
            }
        });
        
        if (reportData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-text">${year}년 ${month}월 등록된 기록이 없습니다</div>
                </div>
            `;
            return;
        }
        
        // 테이블 생성
        let html = `
            <div class="table-container" style="overflow-x:auto;">
                <table id="monthlyReportTable" style="min-width:1100px;">
                    <thead>
                        <tr>
                            <th>부서</th>
                            <th>이름</th>
                            <th>기본급</th>
                            <th>통상임금</th>
                            <th>시급(가산)</th>
                            <th>시급(미가산)</th>
                            <th>근무시간(가산)</th>
                            <th>근무시간(미가산)</th>
                            <th>시간외수당(가산)</th>
                            <th>시간외수당(미가산)</th>
                            <th>지급액</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        let grandTotal15x = 0;
        let grandTotal10x = 0;
        let grandTotalPay = 0;
        let grandHours15x = 0;
        let grandHours10x = 0;
        let totalAdjusted = 0;
        let totalNoAttendance = 0;
        
        reportData.forEach(row => {
            grandTotal15x += row.pay15x;
            grandTotal10x += row.pay10x;
            grandTotalPay += row.totalPay;
            grandHours15x += parseFloat(row.hours15x) || 0;
            grandHours10x += parseFloat(row.hours10x) || 0;
            totalAdjusted += row.adjustedCount || 0;
            totalNoAttendance += row.noAttendanceCount || 0;
            
            html += `
                <tr>
                    <td>${escapeHtml(row.dept)}</td>
                    <td>${escapeHtml(row.displayName)}</td>
                    <td class="text-right">${formatCurrency(row.baseSalary)}</td>
                    <td class="text-right">${formatCurrency(row.ordinaryWage)}</td>
                    <td class="text-right">${formatCurrency(row.hourlyWage15x)}</td>
                    <td class="text-right">${formatCurrency(row.hourlyWage10x)}</td>
                    <td class="text-right">${row.hours15x}h</td>
                    <td class="text-right">${row.hours10x}h</td>
                    <td class="text-right">${formatCurrency(row.pay15x)}</td>
                    <td class="text-right">${formatCurrency(row.pay10x)}</td>
                    <td class="text-right amount"><strong>${formatCurrency(row.totalPay)}</strong></td>
                </tr>
            `;
        });
        
        // 하단 요약 정보
        let summaryHtml = '';
        if (totalAdjusted > 0 || totalNoAttendance > 0) {
            summaryHtml = `<div style="margin-top:10px;font-size:12px;color:#6b7280;">`;
            if (totalAdjusted > 0) {
                summaryHtml += `⚠️ 퇴근시간 기준 조정: ${totalAdjusted}건 `;
            }
            if (totalNoAttendance > 0) {
                summaryHtml += `📋 근태 미등록: ${totalNoAttendance}건`;
            }
            summaryHtml += `</div>`;
        }
        
        html += `
                    </tbody>
                    <tfoot>
                        <tr style="background:#f1f5f9;font-weight:600;">
                            <td colspan="4" class="text-right">합계</td>
                            <td></td>
                            <td></td>
                            <td class="text-right">${grandHours15x.toFixed(1)}h</td>
                            <td class="text-right">${grandHours10x.toFixed(1)}h</td>
                            <td class="text-right">${formatCurrency(grandTotal15x)}</td>
                            <td class="text-right">${formatCurrency(grandTotal10x)}</td>
                            <td class="text-right amount-total"><strong>${formatCurrency(grandTotalPay)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            ${summaryHtml}
        `;
        
        container.innerHTML = html;
        
    } catch (e) {
        console.error('보고서 생성 오류:', e);
        container.innerHTML = `
            <div class="alert alert-error">
                <span>❌</span>
                <span>보고서 생성 중 오류가 발생했습니다.</span>
            </div>
        `;
    }
}

// ===== 월간 집계 엑셀 다운로드 (ExcelJS 사용) =====
async function downloadExcel() {
    const table = document.getElementById('monthlyReportTable');
    if (!table) {
        alert('먼저 조회를 실행해주세요.');
        return;
    }
    
    // ExcelJS 로드 확인
    if (typeof ExcelJS === 'undefined') {
        alert('엑셀 라이브러리를 로드하지 못했습니다. 인터넷 연결을 확인해주세요.');
        return;
    }
    
    const year = document.getElementById('monthlyYear').value;
    const month = document.getElementById('monthlyMonth').value;
    
    try {
        // 워크북 생성
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '시간외근무 관리 시스템';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet(`${year}년 ${month}월 시간외근무`);
        
        // 헤더 추출
        const headers = [];
        table.querySelectorAll('thead th').forEach(th => {
            headers.push(th.textContent.trim());
        });
        
        // ===== 제목 행 추가 =====
        const titleRow = worksheet.addRow([`${year}년 ${month}월 시간외근무 집계`]);
        worksheet.mergeCells(1, 1, 1, headers.length);
        titleRow.getCell(1).font = { bold: true, size: 16 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        
        // 빈 행
        worksheet.addRow([]);
        
        // ===== 헤더 행 추가 =====
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            cell.font = { bold: true, size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        
        // 데이터 행 추출 및 추가
        table.querySelectorAll('tbody tr').forEach(tr => {
            const rowData = [];
            const cells = tr.querySelectorAll('td');
            
            cells.forEach((td, idx) => {
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
                cell.font = { size: 10 };
                
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
        
        // ===== 합계 행 추가 (tfoot) =====
        const tfootRow = table.querySelector('tfoot tr');
        if (tfootRow) {
            const tfootCells = tfootRow.querySelectorAll('td');
            const values = [];
            tfootCells.forEach(td => {
                const text = td.textContent.trim();
                if (text.endsWith('h')) {
                    values.push(parseFloat(text.replace('h', '')) || 0);
                } else if (text.includes('원')) {
                    values.push(parseFloat(text.replace(/,/g, '').replace('원', '')) || 0);
                }
            });
            
            const footerData = ['', '', '', '합계', '', '', values[0] || 0, values[1] || 0, values[2] || 0, values[3] || 0, values[4] || 0];
            const footerRow = worksheet.addRow(footerData);
            
            footerRow.eachCell((cell, colNumber) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF1F5F9' }
                };
                cell.font = { bold: true, size: 10 };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'medium' },
                    right: { style: 'thin' }
                };
                
                if (typeof cell.value === 'number') {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    if (cell.value >= 1000) {
                        cell.numFmt = '#,##0';
                    }
                } else {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                }
            });
        }
        
        // 열 너비 설정
        const columnWidths = [14, 10, 12, 12, 11, 11, 12, 12, 13, 13, 12];
        worksheet.columns.forEach((col, idx) => {
            col.width = columnWidths[idx] || 10;
        });
        
        // 행 높이 설정
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 2) {
                row.height = 20;
            }
        });
        
        // 파일 다운로드
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `시간외근무_${year}년${month}월.xlsx`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
        
    } catch (e) {
        console.error('엑셀 다운로드 오류:', e);
        alert('엑셀 파일 생성 중 오류가 발생했습니다.');
    }
}

// ===== 월간 집계 인쇄 =====
function printReport() {
    const table = document.getElementById('monthlyReportTable');
    if (!table) {
        alert('먼저 조회를 실행해주세요.');
        return;
    }
    
    const year = document.getElementById('monthlyYear').value;
    const month = document.getElementById('monthlyMonth').value;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>시간외근무 현황 - ${year}년 ${month}월</title>
            <style>
                body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; }
                h1 { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th, td { border: 1px solid #333; padding: 8px; }
                th { background: #f0f0f0; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                tfoot { font-weight: bold; background: #f5f5f5; }
            </style>
        </head>
        <body>
            <h1>시간외근무 현황 (${year}년 ${month}월)</h1>
            ${table.outerHTML}
            <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
