/**
 * 백업복원_시간외.js
 * 데이터 백업 및 복원 모듈
 * - .hrm 암호화 백업 (AES-256-CBC, 네이티브 파일 다이얼로그)
 * - .json 레거시 복원 하위 호환
 * - 백업 통계 수집
 * 
 * 의존성:
 * - OvertimeDB (데이터베이스_시간외.js) - 각종 get/save 메서드
 * - window.electronAPI.saveBackupHrm / loadBackupHrm (preload.js → main.js IPC)
 * - BACKUP_KEYS는 이 모듈 내부에서 정의 (electron-store 키 매핑)
 * 
 * @version 1.1.0
 * @since 2026-02-05
 * 
 * [변경 이력]
 * v1.1.0 (2026-02-05) - .hrm 암호화 백업 형식 도입
 *   - 백업: JSON → AES-256-CBC 암호화 → .hrm 파일 (네이티브 저장 다이얼로그)
 *   - 복원: .hrm 암호화 파일 + .json 레거시 파일 모두 지원
 *   - 브라우저 Blob/FileReader → Electron IPC 기반으로 전환
 * 
 * v1.0.0 (2026-02-05) - 초기 릴리즈
 *   - JSON 평문 백업/복원
 */

// ===== 백업 대상 키 목록 =====
// electron-store에서의 키와 설명 매핑
const BACKUP_KEYS = [
    { key: 'overtime_daily', name: '시간외근무 기록', required: true, getter: 'getOvertimeDaily', saver: 'saveOvertimeDaily' },
    { key: 'attendance', name: '근태 기록', required: true, getter: 'getAttendance', saver: 'saveAttendance' },
    { key: 'variable_holidays', name: '공휴일 설정', required: true, getter: 'getVariableHolidays', saver: 'saveVariableHolidays' },
    { key: 'overtime_settings', name: '시간외 유형 설정', required: true, getter: 'getOvertimeSettings', saver: 'saveOvertimeSettings' },
    { key: 'limit_settings', name: '제한 설정 (주/월)', required: true, getter: 'getLimitSettings', saver: 'saveLimitSettings' }
];

/**
 * 모든 데이터 백업 (.hrm 암호화)
 */
async function backupAllData() {
    try {
        const backupData = {
            version: '1.1',
            format: 'hrm',
            exportDate: new Date().toISOString(),
            exportSystem: '시간외근무관리시스템 (데스크탑)',
            data: {}
        };
        
        // 각 키별 데이터 수집
        let hasData = false;
        for (const item of BACKUP_KEYS) {
            try {
                const data = await OvertimeDB[item.getter]();
                if (data && Object.keys(data).length > 0) {
                    backupData.data[item.key] = data;
                    hasData = true;
                }
            } catch (e) {
                console.warn(`${item.name} 로드 실패:`, e);
            }
        }
        
        if (!hasData) {
            alert('백업할 데이터가 없습니다.');
            return;
        }
        
        // 백업 통계 수집
        const stats = collectBackupStats(backupData.data);
        backupData.stats = stats;
        
        // .hrm 암호화 백업 저장 (네이티브 다이얼로그)
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const filename = `시간외근무_백업_${today}.hrm`;
        const jsonStr = JSON.stringify(backupData);
        
        const result = await window.electronAPI.saveBackupHrm(jsonStr, filename);
        
        if (!result.success) {
            if (result.canceled) {
                // 사용자가 취소한 경우 - 별도 메시지 없음
                return;
            }
            alert('❌ 백업 실패: ' + (result.error || '알 수 없는 오류'));
            return;
        }
        
        // 백업 완료 메시지
        const savedName = result.filePath ? result.filePath.split('\\').pop().split('/').pop() : filename;
        let message = `✅ 백업 완료!\n\n📁 파일명: ${savedName}\n🔒 형식: 암호화 (.hrm)\n\n📊 백업 내용:`;
        if (stats.overtimeRecords > 0) message += `\n- 시간외근무: ${stats.overtimeRecords}건`;
        if (stats.attendanceRecords > 0) message += `\n- 근태기록: ${stats.attendanceRecords}건`;
        if (stats.holidays > 0) message += `\n- 공휴일: ${stats.holidays}개`;
        if (stats.hasLimits) message += `\n- 제한설정: 포함`;
        
        alert(message);
        
    } catch (e) {
        console.error('백업 오류:', e);
        alert('백업 중 오류가 발생했습니다: ' + e.message);
    }
}

/**
 * 백업 통계 수집
 */
function collectBackupStats(data) {
    const stats = {
        overtimeRecords: 0,
        attendanceRecords: 0,
        holidays: 0,
        hasLimits: false
    };
    
    // 시간외근무 기록 수
    if (data['overtime_daily']) {
        Object.values(data['overtime_daily']).forEach(yearData => {
            Object.values(yearData).forEach(monthData => {
                Object.values(monthData).forEach(empData => {
                    stats.overtimeRecords += (empData.records || []).length;
                });
            });
        });
    }
    
    // 근태 기록 수
    if (data['attendance']) {
        Object.values(data['attendance']).forEach(yearData => {
            Object.values(yearData).forEach(monthData => {
                Object.values(monthData).forEach(empData => {
                    stats.attendanceRecords += Object.keys(empData).length;
                });
            });
        });
    }
    
    // 공휴일 수
    if (data['variable_holidays']) {
        Object.values(data['variable_holidays']).forEach(yearHolidays => {
            stats.holidays += yearHolidays.length;
        });
    }
    
    // 제한 설정 여부
    if (data['limit_settings']) {
        stats.hasLimits = true;
    }
    
    return stats;
}

/**
 * 파일에서 데이터 복원 (.hrm 암호화 또는 .json 레거시)
 * 
 * v1.1.0: Electron IPC 기반 네이티브 파일 다이얼로그 사용
 * - .hrm 파일: AES-256-CBC 복호화 후 복원
 * - .json 파일: 평문 그대로 복원 (하위 호환)
 */
async function restoreFromFile() {
    try {
        // 네이티브 파일 열기 다이얼로그 (main.js에서 복호화까지 처리)
        const result = await window.electronAPI.loadBackupHrm();
        
        if (!result.success) {
            if (result.canceled) {
                // 사용자가 취소한 경우 - 별도 메시지 없음
                return;
            }
            alert('❌ 파일 읽기 실패: ' + (result.error || '알 수 없는 오류'));
            return;
        }
        
        const backupData = result.data;
        
        // 백업 파일 유효성 검사
        if (!backupData.version || !backupData.data) {
            alert('❌ 유효하지 않은 백업 파일입니다.');
            return;
        }
        
        // 복원할 데이터 통계
        const stats = backupData.stats || collectBackupStats(backupData.data);
        
        // 파일 형식 표시
        const formatLabel = result.fileType === 'hrm' ? '🔒 암호화 (.hrm)' : '📄 평문 (.json)';
        const fileName = result.filePath ? result.filePath.split('\\').pop().split('/').pop() : '백업 파일';
        
        // 복원 확인
        let confirmMsg = `⚠️ 데이터 복원\n\n`;
        confirmMsg += `📁 파일: ${fileName}\n`;
        confirmMsg += `${formatLabel}\n`;
        confirmMsg += `📅 백업 일시: ${new Date(backupData.exportDate).toLocaleString()}\n\n`;
        confirmMsg += `📊 복원될 데이터:\n`;
        if (stats.overtimeRecords > 0) confirmMsg += `- 시간외근무: ${stats.overtimeRecords}건\n`;
        if (stats.attendanceRecords > 0) confirmMsg += `- 근태기록: ${stats.attendanceRecords}건\n`;
        if (stats.holidays > 0) confirmMsg += `- 공휴일: ${stats.holidays}개\n`;
        if (stats.hasLimits) confirmMsg += `- 제한설정: 포함\n`;
        confirmMsg += `\n⚠️ 기존 데이터가 모두 덮어씌워집니다.\n계속하시겠습니까?`;
        
        if (!confirm(confirmMsg)) {
            return;
        }
        
        // 데이터 복원
        let restoredCount = 0;
        
        // 기존 localStorage 키 → electron-store 키 매핑 (하위 호환)
        const legacyKeyMap = {
            'hr_overtime_daily': 'overtime_daily',
            'hr_attendance_records': 'attendance',
            'hr_overtime_holidays': 'variable_holidays',
            'hr_overtime_settings': 'overtime_settings',
            'hr_overtime_limits': 'limit_settings'
        };
        
        for (const item of BACKUP_KEYS) {
            // 새 키 또는 레거시 키에서 데이터 찾기
            let restoreData = backupData.data[item.key];
            
            // 레거시 키로도 시도
            if (!restoreData) {
                const legacyKey = Object.keys(legacyKeyMap).find(k => legacyKeyMap[k] === item.key);
                if (legacyKey) {
                    restoreData = backupData.data[legacyKey];
                }
            }
            
            if (restoreData) {
                try {
                    await OvertimeDB[item.saver](restoreData);
                    restoredCount++;
                    console.log(`복원 완료: ${item.name}`);
                } catch (err) {
                    console.warn(`${item.name} 복원 실패:`, err);
                }
            }
        }
        
        // 완료 메시지
        alert(`✅ 복원 완료!\n\n${restoredCount}개 항목이 복원되었습니다.\n\n페이지를 새로고침합니다.`);
        
        // 페이지 새로고침
        location.reload();
        
    } catch (err) {
        console.error('복원 오류:', err);
        alert('❌ 복원 실패: ' + err.message);
    }
}
