/**
 * 급여계산_시간외.js - 급여 설정 및 계산 엔진
 * 
 * HRM 시스템의 급여 데이터를 읽기 전용으로 사용하여
 * 통상임금, 시급, 시간외수당을 계산합니다.
 * 
 * 초기화 시 HR 데이터를 메모리 캐시에 로드하고,
 * 이후 동기적으로 접근하여 기존 로직을 최대한 유지합니다.
 * 
 * @version 1.0.0
 * @since 2026-02-05
 * 
 * [의존성] 데이터베이스_시간외.js (HRData)
 */

// ===== 상수 =====
const DEFAULT_WEEKLY_HOURS = 40;
const WEEKS_PER_YEAR = 365 / 7;
const WEEKS_PER_MONTH = WEEKS_PER_YEAR / 12;

// ===== 급여 데이터 캐시 =====
const _salaryCache = {
    grades: {},        // hr_salary_grades 전체
    tables: {},        // hr_salary_tables 전체
    positions: {},     // hr_position_allowances 전체
    settings: {},      // hr_salary_settings 전체
    ordinary: {},      // hr_ordinary_wage_settings 전체
    concurrent: [],    // hr_concurrent_positions 전체
    loaded: false
};

/**
 * 급여 캐시 초기화 (앱 시작 시 1회 호출)
 * HR 앱의 급여 관련 데이터를 모두 로드
 */
async function initSalaryCache() {
    try {
        _salaryCache.grades = await HRData.getSalaryGrades() || {};
        _salaryCache.tables = await HRData.getSalaryTables() || {};
        _salaryCache.positions = await HRData.getPositionAllowances() || {};
        _salaryCache.settings = await HRData.getSalarySettings() || {};
        _salaryCache.ordinary = await HRData.getOrdinaryWageSettings() || {};
        _salaryCache.concurrent = await HRData.getConcurrentPositions() || [];
        _salaryCache.loaded = true;
        console.log('[급여계산] 급여 캐시 초기화 완료');
    } catch (e) {
        console.error('[급여계산] 급여 캐시 초기화 실패:', e);
    }
}

// ===== 급여 설정 관리자 (캐시 기반) =====
const SalarySettings = {
    
    // 직급 데이터 로드
    loadGradesByYear(year) {
        try {
            const allData = _salaryCache.grades;
            if (!allData || Object.keys(allData).length === 0) return { rankGrades: [], salaryGrades: [] };
            
            const yearStr = String(year);
            
            // v1.0 구조 마이그레이션
            if (allData.rankGrades && !allData.years) {
                return {
                    rankGrades: allData.rankGrades || [],
                    salaryGrades: allData.salaryGrades || []
                };
            }
            
            if (allData.years && allData.years[yearStr]) {
                return {
                    rankGrades: allData.years[yearStr].rankGrades || [],
                    salaryGrades: allData.years[yearStr].salaryGrades || []
                };
            }
        } catch (e) {
            console.error('직급 데이터 로드 실패:', e);
        }
        return { rankGrades: [], salaryGrades: [] };
    },
    
    // 급여표 로드
    getSalaryTableByYear(year) {
        try {
            const tables = _salaryCache.tables;
            return tables[String(year)] || { rank: {}, salary: {} };
        } catch (e) {
            console.error('급여표 로드 실패:', e);
            return { rank: {}, salary: {} };
        }
    },
    
    // 직책수당 로드
    getPositionAllowancesByYear(year) {
        try {
            const allowances = _salaryCache.positions;
            return allowances[String(year)] || {};
        } catch (e) {
            console.error('직책수당 로드 실패:', e);
            return {};
        }
    },
    
    // 명절휴가비 설정 로드
    getSettingsByYear(year) {
        try {
            const settings = _salaryCache.settings;
            if (!settings || Object.keys(settings).length === 0) return this._getDefaultSettings();
            return settings[String(year)] || this._getDefaultSettings();
        } catch (e) {
            console.error('급여 설정 로드 실패:', e);
            return this._getDefaultSettings();
        }
    },
    
    _getDefaultSettings() {
        return {
            maxRank: 31,
            holidayBonus: {
                "설": { holidayDate: "", rate: 0.6 },
                "추석": { holidayDate: "", rate: 0.6 }
            }
        };
    },
    
    // 통상임금 설정 로드
    getOrdinarySettingsByYear(year) {
        try {
            const settings = _salaryCache.ordinary;
            if (!settings || Object.keys(settings).length === 0) return this._getDefaultOrdinarySettings();
            return settings[String(year)] || this._getDefaultOrdinarySettings();
        } catch (e) {
            console.error('통상임금 설정 로드 실패:', e);
            return this._getDefaultOrdinarySettings();
        }
    },
    
    _getDefaultOrdinarySettings() {
        return {
            includeHolidayBonus: true,
            includePositionAllowance: true,
            includeActingAllowance: true,
            monthlyHoursRounding: 'round',
            holidayBonusMethod: 'annual',
            hourlyWageRounding: { type: 'decimal', unit: 1, method: 'floor' },
            overtimeRounding: { unit: 10, method: 'round' }
        };
    }
};

// ===== 급여 계산기 =====
const SalaryCalculator = {
    
    // 발령 조회
    getAssignmentAtDate(emp, targetDate) {
        if (!emp || !targetDate) return null;
        
        const retirementDate = emp.employment?.retirementDate;
        if (retirementDate && retirementDate < targetDate) return null;
        
        const assignments = emp.assignments || [];
        if (assignments.length === 0) return null;
        
        const sorted = [...assignments].sort((a, b) => {
            const dateA = a.startDate || a.date || '';
            const dateB = b.startDate || b.date || '';
            return dateB.localeCompare(dateA);
        });
        
        for (const assign of sorted) {
            const startDate = assign.startDate || assign.date;
            if (startDate && startDate <= targetDate) {
                return assign;
            }
        }
        
        return null;
    },
    
    // 기본급 조회
    getBaseSalary(year, grade, rank, isRankBased = true) {
        const yearTable = SalarySettings.getSalaryTableByYear(year);
        
        if (isRankBased) {
            const gradeData = yearTable.rank?.[grade];
            if (!gradeData) return 0;
            return gradeData[String(rank)] || 0;
        } else {
            const gradeData = yearTable.salary?.[grade];
            if (!gradeData) return 0;
            return gradeData.baseSalary || 0;
        }
    },
    
    // 직책수당 조회
    getPositionAllowance(year, position) {
        if (!position) return 0;
        const allowances = SalarySettings.getPositionAllowancesByYear(year);
        return allowances[position] || 0;
    },
    
    // 직무대리 정보 조회
    getActingPositionForMonth(empId, year, month) {
        try {
            const concurrents = _salaryCache.concurrent;
            if (!concurrents || concurrents.length === 0) return null;
            
            const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
            
            for (const cp of concurrents) {
                if (cp.type !== 'acting') continue;
                if (cp.employeeId !== empId) continue;
                
                const cpStart = cp.startDate || '';
                const cpEnd = cp.endDate || '9999-12-31';
                
                if (cpStart <= monthEnd && cpEnd >= monthStart) {
                    return cp;
                }
            }
            
            return null;
        } catch (error) {
            console.error('getActingPositionForMonth 오류:', error);
            return null;
        }
    },
    
    // 직무대리 직책수당 계산
    getActingPositionAllowance(empId, year, month) {
        try {
            const acting = this.getActingPositionForMonth(empId, year, month);
            if (!acting) return 0;
            
            const actingPosition = acting.targetPosition || '';
            return this.getPositionAllowance(year, actingPosition);
        } catch (error) {
            console.error('getActingPositionAllowance 오류:', error);
            return 0;
        }
    },
    
    // 직책수당 (중도입사자 월할)
    getPositionAllowanceProrated(year, position, entryDate) {
        if (!position || !entryDate) return 0;
        
        const baseAllowance = this.getPositionAllowance(year, position);
        if (baseAllowance === 0) return 0;
        
        const entryYear = parseInt(entryDate.substring(0, 4), 10);
        const targetYear = parseInt(year, 10);
        
        if (targetYear < entryYear) return 0;
        if (targetYear > entryYear) return baseAllowance;
        
        const entryMonth = parseInt(entryDate.substring(5, 7), 10);
        const workingMonths = 12 - entryMonth + 1;
        return Math.round(baseAllowance * workingMonths / 12);
    },
    
    // 호봉 계산
    calculateRank(startRank, firstUpgradeDate, targetDate) {
        if (!firstUpgradeDate || !targetDate) return startRank;
        
        const base = this._parseDate(targetDate);
        const firstUpgrade = this._parseDate(firstUpgradeDate);
        
        const baseObj = new Date(base.year, base.month - 1, base.day);
        const firstUpgradeObj = new Date(firstUpgrade.year, firstUpgrade.month - 1, firstUpgrade.day);
        
        if (baseObj < firstUpgradeObj) {
            return startRank;
        }
        
        let yearDiff = base.year - firstUpgrade.year;
        if (base.month < firstUpgrade.month || 
            (base.month === firstUpgrade.month && base.day < firstUpgrade.day)) {
            yearDiff--;
        }
        
        return startRank + 1 + yearDiff;
    },
    
    _parseDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return { year, month, day };
    },
    
    getRankAtDate(emp, targetDate) {
        if (!emp) return 1;
        
        if (emp.rank) {
            const startRank = emp.rank.startRank || 1;
            const firstUpgradeDate = emp.rank.firstUpgradeDate;
            
            if (firstUpgradeDate) {
                return this.calculateRank(startRank, firstUpgradeDate, targetDate);
            }
            return startRank;
        }
        
        const assignment = this.getAssignmentAtDate(emp, targetDate);
        if (assignment) {
            return assignment.rank || assignment.currentRank || 1;
        }
        
        return 1;
    },
    
    // 호봉제 여부
    isRankBasedGrade(year, grade) {
        const gradesData = SalarySettings.loadGradesByYear(year);
        if (gradesData.rankGrades?.find(g => g.name === grade)) return true;
        if (gradesData.salaryGrades?.find(g => g.name === grade)) return false;
        return true;
    },
    
    // 명절휴가비 유형
    getHolidayBonusType(year, grade) {
        const gradesData = SalarySettings.loadGradesByYear(year);
        const salaryGrade = gradesData.salaryGrades?.find(g => g.name === grade);
        if (salaryGrade) return salaryGrade.holidayBonusType || 'percent';
        return 'percent';
    },
    
    // 통상임금 산입용 명절휴가비 (월 환산)
    getHolidayBonusForOrdinary(emp, year, grade, isRankBased, holidayBonusType, currentBaseSalary) {
        const yearSettings = SalarySettings.getSettingsByYear(year);
        const holidayBonus = yearSettings.holidayBonus || {};
        const ordinarySettings = SalarySettings.getOrdinarySettingsByYear(year);
        const holidayBonusMethod = ordinarySettings.holidayBonusMethod || 'annual';
        
        let annualHolidayBonus = 0;
        
        const seolRate = holidayBonus['설']?.rate || 0.6;
        const chuseokRate = holidayBonus['추석']?.rate || 0.6;
        
        if (isRankBased && emp) {
            if (holidayBonusMethod === 'monthly' && currentBaseSalary > 0) {
                annualHolidayBonus = currentBaseSalary * (seolRate + chuseokRate);
            } else {
                const seolDate = holidayBonus['설']?.holidayDate || `${year}-02-01`;
                const chuseokDate = holidayBonus['추석']?.holidayDate || `${year}-09-15`;
                
                const seolRank = this.getRankAtDate(emp, seolDate);
                const seolBaseSalary = this.getBaseSalary(year, grade, seolRank, true);
                const seolBonus = seolBaseSalary * seolRate;
                
                const chuseokRank = this.getRankAtDate(emp, chuseokDate);
                const chuseokBaseSalary = this.getBaseSalary(year, grade, chuseokRank, true);
                const chuseokBonus = chuseokBaseSalary * chuseokRate;
                
                annualHolidayBonus = seolBonus + chuseokBonus;
            }
        } else if (!isRankBased) {
            if (holidayBonusType === 'fixed') {
                const yearTable = SalarySettings.getSalaryTableByYear(year);
                const gradeData = yearTable.salary?.[grade] || {};
                annualHolidayBonus = (gradeData.seolBonus || 0) + (gradeData.chuseokBonus || 0);
            } else {
                const baseSalary = currentBaseSalary > 0 ? currentBaseSalary : this.getBaseSalary(year, grade, 1, false);
                annualHolidayBonus = baseSalary * (seolRate + chuseokRate);
            }
        } else {
            const baseSalary = currentBaseSalary > 0 ? currentBaseSalary : this.getBaseSalary(year, grade, 1, isRankBased);
            annualHolidayBonus = baseSalary * (seolRate + chuseokRate);
        }
        
        return Math.round(annualHolidayBonus / 12);
    },
    
    // 통상임금 계산
    calculateOrdinaryWage(params) {
        const { emp, year, month, grade, rank, position, entryDate, isRankBased = true, holidayBonusType = 'percent' } = params;
        
        const settings = SalarySettings.getOrdinarySettingsByYear(year);
        
        const baseSalary = this.getBaseSalary(year, grade, rank, isRankBased);
        
        let monthlyHolidayBonus = 0;
        if (settings.includeHolidayBonus) {
            monthlyHolidayBonus = this.getHolidayBonusForOrdinary(emp, year, grade, isRankBased, holidayBonusType, baseSalary);
        }
        
        let positionAllowance = 0;
        if (settings.includePositionAllowance && position) {
            positionAllowance = this.getPositionAllowanceProrated(year, position, entryDate);
        }
        
        let actingAllowance = 0;
        if (settings.includeActingAllowance && emp && emp.id && month) {
            actingAllowance = this.getActingPositionAllowance(emp.id, parseInt(year), parseInt(month));
        }
        
        const ordinaryWage = baseSalary + monthlyHolidayBonus + positionAllowance + actingAllowance;
        
        return { baseSalary, monthlyHolidayBonus, positionAllowance, actingAllowance, ordinaryWage, settings };
    },
    
    // 소수점 처리
    applyRounding(value, method) {
        switch (method) {
            case 'ceil': return Math.ceil(value);
            case 'floor': return Math.floor(value);
            case 'round':
            default: return Math.round(value);
        }
    },
    
    // 월소정근로시간
    getMonthlyWorkingHours(weeklyHours = DEFAULT_WEEKLY_HOURS, year = null) {
        const hours = parseInt(weeklyHours) || DEFAULT_WEEKLY_HOURS;
        const targetYear = year || new Date().getFullYear();
        
        const ordinarySettings = SalarySettings.getOrdinarySettingsByYear(targetYear);
        const roundingMethod = ordinarySettings.monthlyHoursRounding || 'round';
        
        let monthlyHours;
        if (hours < 15) {
            monthlyHours = hours * WEEKS_PER_MONTH;
        } else {
            const weeklyRestHours = (hours / 40) * 8;
            monthlyHours = (hours + weeklyRestHours) * WEEKS_PER_MONTH;
        }
        
        return this.applyRounding(monthlyHours, roundingMethod);
    },
    
    // 시급 절사
    applyHourlyWageRounding(hourlyWage, roundingSettings) {
        if (!roundingSettings || roundingSettings.type === 'decimal') {
            return hourlyWage;
        }
        
        const { unit, method } = roundingSettings;
        const unitValue = unit || 1;
        
        switch (method) {
            case 'ceil': return Math.ceil(hourlyWage / unitValue) * unitValue;
            case 'round': return Math.round(hourlyWage / unitValue) * unitValue;
            case 'floor':
            default: return Math.floor(hourlyWage / unitValue) * unitValue;
        }
    },
    
    // 시급 계산
    getHourlyWage(ordinaryWage, monthlyWorkingHours, year = null) {
        if (!monthlyWorkingHours || monthlyWorkingHours <= 0) return 0;
        
        const rawHourlyWage = ordinaryWage / monthlyWorkingHours;
        
        const targetYear = year || new Date().getFullYear();
        const ordinarySettings = SalarySettings.getOrdinarySettingsByYear(targetYear);
        const roundingSettings = ordinarySettings.hourlyWageRounding || { type: 'decimal' };
        
        return this.applyHourlyWageRounding(rawHourlyWage, roundingSettings);
    },
    
    // 원시급 (절사 전)
    getRawHourlyWage(ordinaryWage, monthlyWorkingHours) {
        if (!monthlyWorkingHours || monthlyWorkingHours <= 0) return 0;
        return ordinaryWage / monthlyWorkingHours;
    },
    
    // 배율 적용 시급
    getRatedHourlyWage(rawHourlyWage, rate, year = null) {
        try {
            if (!rawHourlyWage || rate <= 0) return 0;
            
            const targetYear = year || new Date().getFullYear();
            const ordinarySettings = SalarySettings.getOrdinarySettingsByYear(targetYear);
            const roundingSettings = ordinarySettings.hourlyWageRounding || { type: 'decimal' };
            
            if (!roundingSettings || roundingSettings.type === 'decimal') {
                return rawHourlyWage * rate;
            }
            
            const applyTiming = roundingSettings.applyTiming || 'after';
            
            if (applyTiming === 'before') {
                const roundedHourly = this.applyHourlyWageRounding(rawHourlyWage, roundingSettings);
                return roundedHourly * rate;
            } else {
                const ratedValue = rawHourlyWage * rate;
                return this.applyHourlyWageRounding(ratedValue, roundingSettings);
            }
        } catch (error) {
            console.error('getRatedHourlyWage 오류:', error);
            return rawHourlyWage * rate;
        }
    },
    
    // 시간외수당 절사
    applyOvertimeRounding(amount, year = null) {
        const correctedAmount = Math.round(amount * 100) / 100;
        
        const targetYear = year || new Date().getFullYear();
        const ordinarySettings = SalarySettings.getOrdinarySettingsByYear(targetYear);
        const rounding = ordinarySettings.overtimeRounding || { unit: 10, method: 'round' };
        
        const { unit, method } = rounding;
        const unitValue = unit || 10;
        
        switch (method) {
            case 'ceil': return Math.ceil(correctedAmount / unitValue) * unitValue;
            case 'floor': return Math.floor(correctedAmount / unitValue) * unitValue;
            case 'round':
            default: return Math.round(correctedAmount / unitValue) * unitValue;
        }
    }
};

// ===== 직원 급여 정보 계산 =====

/**
 * 직원 급여 계산 (동기 - 캐시 사용)
 * @param {string} empId - 직원 ID
 * @param {number} year - 연도
 * @param {number} month - 월
 * @param {string|null} specificDate - 특정 날짜 (없으면 월말)
 * @returns {Object} 급여 정보
 */
function calculateEmployeeSalary(empId, year, month, specificDate = null) {
    try {
        // 전역 employees 배열 사용 (초기화에서 로드)
        const emp = (employees || []).find(e => e.id === empId);
        
        if (!emp) {
            return { baseSalary: 0, ordinaryWage: 0, hourlyWage: 0, monthlyWorkingHours: 209 };
        }
        
        let targetDate;
        if (specificDate) {
            targetDate = specificDate;
        } else {
            const lastDay = new Date(year, month, 0).getDate();
            targetDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        }
        
        const assignment = SalaryCalculator.getAssignmentAtDate(emp, targetDate);
        if (!assignment) {
            return { baseSalary: 0, ordinaryWage: 0, hourlyWage: 0, monthlyWorkingHours: 209 };
        }
        
        const grade = assignment.grade || '';
        const position = assignment.position || '';
        const weeklyHours = assignment.workingHours || emp.employment?.weeklyWorkingHours || DEFAULT_WEEKLY_HOURS;
        const entryDate = emp.employment?.entryDate || `${year}-01-01`;
        
        let isRankBased = true;
        if (assignment.hasOwnProperty('isRankBased')) {
            isRankBased = assignment.isRankBased;
        } else if (assignment.paymentMethod) {
            isRankBased = assignment.paymentMethod === 'rank' || assignment.paymentMethod === '호봉제';
        } else {
            isRankBased = SalaryCalculator.isRankBasedGrade(year, grade);
        }
        
        const rank = SalaryCalculator.getRankAtDate(emp, targetDate);
        const holidayBonusType = SalaryCalculator.getHolidayBonusType(year, grade);
        
        const ordinaryResult = SalaryCalculator.calculateOrdinaryWage({
            emp, year, month, grade, rank, position, entryDate, isRankBased, holidayBonusType
        });
        
        const monthlyWorkingHours = SalaryCalculator.getMonthlyWorkingHours(weeklyHours, year);
        const hourlyWage = SalaryCalculator.getHourlyWage(ordinaryResult.ordinaryWage, monthlyWorkingHours, year);
        const rawHourlyWage = SalaryCalculator.getRawHourlyWage(ordinaryResult.ordinaryWage, monthlyWorkingHours);
        
        return {
            baseSalary: ordinaryResult.baseSalary,
            ordinaryWage: ordinaryResult.ordinaryWage,
            hourlyWage: hourlyWage,
            rawHourlyWage: rawHourlyWage,
            positionAllowance: ordinaryResult.positionAllowance,
            actingAllowance: ordinaryResult.actingAllowance,
            monthlyHolidayBonus: ordinaryResult.monthlyHolidayBonus,
            monthlyWorkingHours: monthlyWorkingHours,
            grade, rank, position, isRankBased
        };
        
    } catch (e) {
        console.error('급여 계산 오류:', e);
        return { baseSalary: 0, ordinaryWage: 0, hourlyWage: 0, monthlyWorkingHours: 209 };
    }
}

/**
 * 급여 정보 표시 (일별 탭용)
 */
function displayEmployeeSalaryInfo(empId, year, month) {
    const salary = calculateEmployeeSalary(empId, year, month);
    
    const el = (id) => document.getElementById(id);
    if (el('infoBaseSalary')) el('infoBaseSalary').textContent = formatCurrency(salary.baseSalary);
    if (el('infoOrdinaryWage')) el('infoOrdinaryWage').textContent = formatCurrency(salary.ordinaryWage);
    if (el('infoHourlyWage')) el('infoHourlyWage').textContent = formatCurrency(Math.floor(salary.hourlyWage));
    if (el('infoHourlyWage15')) el('infoHourlyWage15').textContent = formatCurrency(Math.floor(salary.hourlyWage * 1.5));
}

// ===== 일별 기록 CRUD =====

/**
 * 직원 일별 시간외 기록 조회
 */
async function getEmployeeDailyRecords(empId, year, month) {
    try {
        const data = await OvertimeDB.getOvertimeDaily();
        return data[String(year)]?.[String(month)]?.[empId]?.records || [];
    } catch (e) {
        return [];
    }
}

/**
 * 직원 일별 시간외 기록 저장
 */
async function saveEmployeeDailyRecords(empId, year, month, records) {
    try {
        const data = await OvertimeDB.getOvertimeDaily();
        
        if (!data[String(year)]) data[String(year)] = {};
        if (!data[String(year)][String(month)]) data[String(year)][String(month)] = {};
        
        if (records.length > 0) {
            data[String(year)][String(month)][empId] = { records };
        } else {
            delete data[String(year)][String(month)][empId];
        }
        
        await OvertimeDB.setOvertimeDaily(data);
    } catch (e) {
        console.error('기록 저장 실패:', e);
        throw e;
    }
}

console.log('[급여계산] 급여계산_시간외.js 로드 완료');
