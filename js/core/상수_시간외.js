/**
 * 상수_시간외.js - 상수 정의
 * 
 * 시간외근무 유형, 기본 활성화 상태, 고정 공휴일, 변동 공휴일 초기 데이터
 * 
 * @version 1.0.0
 * @since 2026-02-05
 */

// ===== 시간외근무 유형 정의 =====

const OVERTIME_TYPES = {
    extended1x: {
        code: 'extended1x',
        name: '연장근무 (1배)',
        shortName: '연장1배',
        rate: 1.0,
        category: 'morning'
    },
    extended15x: {
        code: 'extended15x',
        name: '연장근무 (1.5배)',
        shortName: '연장1.5배',
        rate: 1.5,
        category: 'morning'
    },
    night: {
        code: 'night',
        name: '야간근무 (+0.5배)',
        shortName: '야간',
        rate: 1.5,
        category: 'night'
    },
    extendedNight: {
        code: 'extendedNight',
        name: '연장+야간 (2.0배)',
        shortName: '연장야간',
        rate: 2.0,
        category: 'night'
    },
    holiday1x: {
        code: 'holiday1x',
        name: '휴일근무 (1배)',
        shortName: '휴일1배',
        rate: 1.0,
        category: 'holiday'
    },
    holiday: {
        code: 'holiday',
        name: '휴일근무 (1.5배)',
        shortName: '휴일1.5배',
        rate: 1.5,
        category: 'holiday'
    },
    holidayNight: {
        code: 'holidayNight',
        name: '휴일+야간 (2.0배)',
        shortName: '휴일야간',
        rate: 2.0,
        category: 'holiday'
    },
    holidayExtended: {
        code: 'holidayExtended',
        name: '휴일연장 (2.0배)',
        shortName: '휴일연장',
        rate: 2.0,
        category: 'holiday'
    },
    holidayExtendedNight: {
        code: 'holidayExtendedNight',
        name: '휴일연장+야간 (2.5배)',
        shortName: '휴일연장야간',
        rate: 2.5,
        category: 'holiday'
    }
};

// 기본 활성화 유형
const DEFAULT_ENABLED_TYPES = {
    extended1x: true,
    extended15x: true,
    night: true,
    extendedNight: true,
    holiday1x: true,
    holiday: true,
    holidayNight: false,
    holidayExtended: false,
    holidayExtendedNight: false
};

// ===== 대한민국 공휴일 =====

// 고정 공휴일 (매년 동일)
const FIXED_HOLIDAYS = [
    { month: 1, day: 1, name: '신정' },
    { month: 3, day: 1, name: '삼일절' },
    { month: 5, day: 5, name: '어린이날' },
    { month: 6, day: 6, name: '현충일' },
    { month: 8, day: 15, name: '광복절' },
    { month: 10, day: 3, name: '개천절' },
    { month: 10, day: 9, name: '한글날' },
    { month: 12, day: 25, name: '성탄절' }
];

// 기본 변동 공휴일 (초기 데이터)
const DEFAULT_VARIABLE_HOLIDAYS = {
    2025: [
        { month: 1, day: 28, name: '설날 연휴' },
        { month: 1, day: 29, name: '설날' },
        { month: 1, day: 30, name: '설날 연휴' },
        { month: 3, day: 3, name: '대체공휴일(삼일절)' },
        { month: 5, day: 5, name: '부처님오신날' },
        { month: 5, day: 6, name: '대체공휴일(어린이날)' },
        { month: 10, day: 5, name: '추석 연휴' },
        { month: 10, day: 6, name: '추석' },
        { month: 10, day: 7, name: '추석 연휴' },
        { month: 10, day: 8, name: '대체공휴일(추석)' }
    ],
    2026: [
        { month: 2, day: 16, name: '설날 연휴' },
        { month: 2, day: 17, name: '설날' },
        { month: 2, day: 18, name: '설날 연휴' },
        { month: 5, day: 24, name: '부처님오신날' },
        { month: 5, day: 25, name: '대체공휴일(부처님오신날)' },
        { month: 6, day: 3, name: '제9회 전국동시지방선거' },
        { month: 9, day: 24, name: '추석 연휴' },
        { month: 9, day: 25, name: '추석' },
        { month: 9, day: 26, name: '추석 연휴' }
    ],
    2027: [
        { month: 2, day: 6, name: '설날 연휴' },
        { month: 2, day: 7, name: '설날' },
        { month: 2, day: 8, name: '설날 연휴' },
        { month: 2, day: 9, name: '대체공휴일(설날)' },
        { month: 5, day: 13, name: '부처님오신날' },
        { month: 9, day: 14, name: '추석 연휴' },
        { month: 9, day: 15, name: '추석' },
        { month: 9, day: 16, name: '추석 연휴' }
    ]
};

console.log('[상수] 상수_시간외.js 로드 완료');
