/**
 * 데이터베이스_시간외.js - 데이터 접근 레이어
 * 
 * 모든 데이터 읽기/쓰기를 중앙에서 관리
 * - 자체 데이터: electronStore (읽기/쓰기)
 * - 인사앱 데이터: hrStore (읽기 전용)
 * - 원본의 localStorage 호출을 모두 이 모듈로 대체
 * 
 * @version 1.0.0
 * @since 2026-02-05
 * 
 * [사용법]
 * // Before (원본 웹앱)
 * const data = JSON.parse(localStorage.getItem('hr_overtime_daily') || '{}');
 * localStorage.setItem('hr_overtime_daily', JSON.stringify(data));
 * 
 * // After (데스크탑 앱)
 * const data = await OvertimeDB.getOvertimeDaily();
 * await OvertimeDB.setOvertimeDaily(data);
 * 
 * [의존성]
 * - window.electronStore (preload.js에서 노출)
 * - window.hrStore (preload.js에서 노출)
 */

// ===== 스토리지 키 상수 =====

/**
 * 자체 데이터 키 (electronStore - 읽기/쓰기)
 */
const OT_KEYS = {
    OVERTIME_DAILY:    'hr_overtime_daily',       // 시간외근무 기록 (일별)
    ATTENDANCE:        'hr_attendance_records',    // 근태 기록
    HOLIDAYS:          'hr_overtime_holidays',     // 공휴일 설정
    OVERTIME_SETTINGS: 'hr_overtime_settings',     // 시간외 유형 설정
    OVERTIME_LIMITS:   'hr_overtime_limits'        // 주/월 제한 설정
};

/**
 * 인사앱 데이터 키 (hrStore - 읽기 전용)
 */
const HR_KEYS = {
    EMPLOYEE_DB:          'hr_system_v25_db',           // 직원 DB
    SALARY_GRADES:        'hr_salary_grades',           // 직급 관리 (연도별)
    SALARY_TABLES:        'hr_salary_tables',           // 급여표 (연도별)
    POSITION_ALLOWANCES:  'hr_position_allowances',     // 직책수당 금액
    SALARY_SETTINGS:      'hr_salary_settings',         // 급여 설정
    ORDINARY_WAGE:        'hr_ordinary_wage_settings',  // 통상임금 설정
    CONCURRENT_POSITIONS: 'hr_concurrent_positions'     // 겸직/직무대리
};

// ===== 자체 데이터 접근 (읽기/쓰기) =====

/**
 * 시간외근무 데이터 관리 객체
 * @namespace OvertimeDB
 */
const OvertimeDB = {
    
    // ----- 시간외근무 기록 -----
    
    /**
     * 시간외근무 일별 기록 조회
     * @returns {Promise<Object>} { 'YYYY-MM-DD': { empId: { ... } } }
     */
    async getOvertimeDaily() {
        return await _storeGet(OT_KEYS.OVERTIME_DAILY, {});
    },
    
    /**
     * 시간외근무 일별 기록 저장
     * @param {Object} data - 전체 시간외근무 데이터
     */
    async setOvertimeDaily(data) {
        await _storeSet(OT_KEYS.OVERTIME_DAILY, data);
    },
    
    // ----- 근태 기록 -----
    
    /**
     * 근태 기록 조회
     * @returns {Promise<Object>} { 'YYYY-MM-DD': { empId: { checkIn, checkOut } } }
     */
    async getAttendance() {
        return await _storeGet(OT_KEYS.ATTENDANCE, {});
    },
    
    /**
     * 근태 기록 저장
     * @param {Object} data - 전체 근태 데이터
     */
    async setAttendance(data) {
        await _storeSet(OT_KEYS.ATTENDANCE, data);
    },
    
    // ----- 공휴일 설정 -----
    
    /**
     * 공휴일 데이터 조회
     * @returns {Promise<Object|null>}
     */
    async getHolidays() {
        return await _storeGet(OT_KEYS.HOLIDAYS, null);
    },
    
    /**
     * 공휴일 데이터 저장
     * @param {Object} data - 공휴일 데이터
     */
    async setHolidays(data) {
        await _storeSet(OT_KEYS.HOLIDAYS, data);
    },
    
    // ----- 시간외 유형 설정 -----
    
    /**
     * 시간외 유형 설정 조회
     * @returns {Promise<Object>} { enabledTypes: [...] }
     */
    async getOvertimeSettings() {
        return await _storeGet(OT_KEYS.OVERTIME_SETTINGS, {});
    },
    
    /**
     * 시간외 유형 설정 저장
     * @param {Object} data - { enabledTypes: [...] }
     */
    async setOvertimeSettings(data) {
        await _storeSet(OT_KEYS.OVERTIME_SETTINGS, data);
    },
    
    // ----- 제한 설정 -----
    
    /**
     * 주/월 제한 설정 조회
     * @returns {Promise<Object|null>}
     */
    async getLimitSettings() {
        return await _storeGet(OT_KEYS.OVERTIME_LIMITS, null);
    },
    
    /**
     * 주/월 제한 설정 저장
     * @param {Object} data - 제한 설정 데이터
     */
    async setLimitSettings(data) {
        await _storeSet(OT_KEYS.OVERTIME_LIMITS, data);
    },
    
    // ----- 전체 데이터 (백업/복원용) -----
    
    // ----- 편의 별칭 (save = set, 모듈간 호출 통일) -----
    
    /** @alias setOvertimeDaily */
    async saveOvertimeDaily(data) { return this.setOvertimeDaily(data); },
    
    /** @alias setAttendance */
    async saveAttendance(data) { return this.setAttendance(data); },
    
    /** @alias getHolidays - 변동 공휴일 */
    async getVariableHolidays() { return await _storeGet(OT_KEYS.HOLIDAYS, {}); },
    
    /** @alias setHolidays - 변동 공휴일 저장 */
    async saveVariableHolidays(data) { return this.setHolidays(data); },
    
    /** @alias setOvertimeSettings */
    async saveOvertimeSettings(data) { return this.setOvertimeSettings(data); },
    
    /** @alias setLimitSettings */
    async saveLimitSettings(data) { return this.setLimitSettings(data); },
    
    // ----- HR 데이터 프록시 (설정탭에서 OvertimeDB로 통일 접근) -----
    
    /** 급여표 조회 (HR → 읽기 전용) */
    async getHRSalaryTables() { return await HRData.getSalaryTables(); },
    
    /** 직책수당 조회 (HR → 읽기 전용) */
    async getHRPositionAllowances() { return await HRData.getPositionAllowances(); },
    
    // ----- 전체 데이터 (백업/복원용) -----
    
    /**
     * 전체 자체 데이터 조회 (백업용)
     * @returns {Promise<Object>} 모든 자체 데이터
     */
    async getAllData() {
        return {
            [OT_KEYS.OVERTIME_DAILY]:    await this.getOvertimeDaily(),
            [OT_KEYS.ATTENDANCE]:        await this.getAttendance(),
            [OT_KEYS.HOLIDAYS]:          await this.getHolidays(),
            [OT_KEYS.OVERTIME_SETTINGS]: await this.getOvertimeSettings(),
            [OT_KEYS.OVERTIME_LIMITS]:   await this.getLimitSettings()
        };
    },
    
    /**
     * 전체 자체 데이터 복원 (복원용)
     * @param {Object} backupData - 복원할 데이터
     */
    async restoreAllData(backupData) {
        if (backupData[OT_KEYS.OVERTIME_DAILY] !== undefined) {
            await this.setOvertimeDaily(backupData[OT_KEYS.OVERTIME_DAILY]);
        }
        if (backupData[OT_KEYS.ATTENDANCE] !== undefined) {
            await this.setAttendance(backupData[OT_KEYS.ATTENDANCE]);
        }
        if (backupData[OT_KEYS.HOLIDAYS] !== undefined) {
            await this.setHolidays(backupData[OT_KEYS.HOLIDAYS]);
        }
        if (backupData[OT_KEYS.OVERTIME_SETTINGS] !== undefined) {
            await this.setOvertimeSettings(backupData[OT_KEYS.OVERTIME_SETTINGS]);
        }
        if (backupData[OT_KEYS.OVERTIME_LIMITS] !== undefined) {
            await this.setLimitSettings(backupData[OT_KEYS.OVERTIME_LIMITS]);
        }
        console.log('[OvertimeDB] 전체 데이터 복원 완료');
    },
    
    /**
     * 전체 자체 데이터 초기화
     */
    async clearAllData() {
        if (typeof window.electronStore !== 'undefined') {
            await window.electronStore.clear();
            console.log('[OvertimeDB] 전체 데이터 초기화 완료');
        }
    }
};

// ===== 인사앱 데이터 접근 (읽기 전용) =====

/**
 * 인사관리 앱 데이터 리더 (읽기 전용)
 * @namespace HRData
 */
const HRData = {
    
    // ----- 직원 데이터 -----
    
    /**
     * 전체 직원 DB 조회
     * @returns {Promise<Object>} { employees: [...], settings: { ... } }
     */
    async getEmployeeDB() {
        return await _hrGet(HR_KEYS.EMPLOYEE_DB, { employees: [], settings: {} });
    },
    
    /**
     * 전체 직원 목록 조회
     * @returns {Promise<Array>} 직원 배열
     */
    async getAllEmployees() {
        const db = await this.getEmployeeDB();
        return db.employees || [];
    },
    
    /**
     * 재직자만 조회 (퇴사자 제외)
     * @returns {Promise<Array>} 재직 직원 배열
     */
    async getActiveEmployees() {
        const all = await this.getAllEmployees();
        return all.filter(emp => {
            const status = emp.employment?.status;
            return status !== '퇴사' && status !== '퇴직';
        });
    },
    
    /**
     * 조직명 조회
     * @returns {Promise<string>}
     */
    async getOrgName() {
        const db = await this.getEmployeeDB();
        return db.settings?.organizationName || '조직명';
    },
    
    // ----- 급여 데이터 -----
    
    /**
     * 직급 관리 (연도별) 조회
     * @returns {Promise<Object>}
     */
    async getSalaryGrades() {
        return await _hrGet(HR_KEYS.SALARY_GRADES, {});
    },
    
    /**
     * 급여표 (연도별) 조회
     * @returns {Promise<Object>}
     */
    async getSalaryTables() {
        return await _hrGet(HR_KEYS.SALARY_TABLES, {});
    },
    
    /**
     * 직책수당 금액 조회
     * @returns {Promise<Object>}
     */
    async getPositionAllowances() {
        return await _hrGet(HR_KEYS.POSITION_ALLOWANCES, {});
    },
    
    /**
     * 급여 설정 조회
     * @returns {Promise<Object>}
     */
    async getSalarySettings() {
        return await _hrGet(HR_KEYS.SALARY_SETTINGS, {});
    },
    
    /**
     * 통상임금 설정 조회
     * @returns {Promise<Object>}
     */
    async getOrdinaryWageSettings() {
        return await _hrGet(HR_KEYS.ORDINARY_WAGE, {});
    },
    
    // ----- 겸직 데이터 -----
    
    /**
     * 겸직/직무대리 목록 조회
     * @returns {Promise<Array>}
     */
    async getConcurrentPositions() {
        return await _hrGet(HR_KEYS.CONCURRENT_POSITIONS, []);
    },
    
    // ----- 연결 상태 -----
    
    /**
     * 인사앱 데이터 접근 가능 여부
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            if (typeof window.hrStore === 'undefined') return false;
            const result = await window.hrStore.get(HR_KEYS.EMPLOYEE_DB);
            return result.success && result.data != null;
        } catch {
            return false;
        }
    }
};

// ===== 내부 헬퍼 함수 =====

/**
 * electronStore에서 데이터 읽기
 * @private
 * @param {string} key - 데이터 키
 * @param {*} defaultValue - 기본값
 * @returns {Promise<*>} 데이터 또는 기본값
 */
async function _storeGet(key, defaultValue) {
    try {
        if (typeof window.electronStore === 'undefined') {
            console.warn('[DB] electronStore 사용 불가, 기본값 반환:', key);
            return defaultValue;
        }
        
        const result = await window.electronStore.get(key);
        
        if (result.success && result.data != null) {
            return result.data;
        }
        return defaultValue;
        
    } catch (error) {
        console.error('[DB] store-get 오류:', key, error);
        return defaultValue;
    }
}

/**
 * electronStore에 데이터 쓰기
 * @private
 * @param {string} key - 데이터 키
 * @param {*} value - 저장할 값
 */
async function _storeSet(key, value) {
    try {
        if (typeof window.electronStore === 'undefined') {
            console.warn('[DB] electronStore 사용 불가, 저장 건너뜀:', key);
            return;
        }
        
        const result = await window.electronStore.set(key, value);
        
        if (!result.success) {
            console.error('[DB] store-set 실패:', key, result.error);
        }
        
    } catch (error) {
        console.error('[DB] store-set 오류:', key, error);
    }
}

/**
 * hrStore에서 인사앱 데이터 읽기 (읽기 전용)
 * @private
 * @param {string} key - 데이터 키
 * @param {*} defaultValue - 기본값
 * @returns {Promise<*>} 데이터 또는 기본값
 */
async function _hrGet(key, defaultValue) {
    try {
        if (typeof window.hrStore === 'undefined') {
            console.warn('[DB] hrStore 사용 불가, 기본값 반환:', key);
            return defaultValue;
        }
        
        const result = await window.hrStore.get(key);
        
        if (result.success && result.data != null) {
            return result.data;
        }
        return defaultValue;
        
    } catch (error) {
        console.error('[DB] hr-get 오류:', key, error);
        return defaultValue;
    }
}

// ===== 전역 노출 =====

console.log('[DB] 데이터베이스_시간외.js 로드 완료');
console.log('[DB] OvertimeDB: 자체 데이터 (읽기/쓰기)');
console.log('[DB] HRData: 인사앱 데이터 (읽기 전용)');
