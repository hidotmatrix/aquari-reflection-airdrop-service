/**
 * Comprehensive Cycle Mode Tests
 * Tests all weekId/cycleId handling across the codebase
 */

import {
  getCycleMode,
  getCurrentWeekId,
  getPreviousWeekId,
  getNextWeekId,
  isValidWeekId,
  isDailyCycleId,
  is6HourCycleId,
  isTestCycleId,
  getWeekId,
  getDayId,
  get6HourId,
  get6HourPeriod,
  parseDayId,
  parse6HourId,
  parseWeekId,
  getDayOfYear,
} from '../src/utils/week';

// ═══════════════════════════════════════════════════════════
// Test Utilities
// ═══════════════════════════════════════════════════════════

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function test(name: string, condition: boolean, details?: string): void {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    const msg = `${name}${details ? ': ' + details : ''}`;
    failures.push(msg);
    console.log(`  ❌ ${name}${details ? ' - ' + details : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

// ═══════════════════════════════════════════════════════════
// 1. CORE WEEK UTILITIES (src/utils/week.ts)
// ═══════════════════════════════════════════════════════════

section('1. CYCLE MODE DETECTION');

// Test getCycleMode
delete process.env.CYCLE_MODE;
test('getCycleMode() defaults to weekly', getCycleMode() === 'weekly');

process.env.CYCLE_MODE = 'daily';
test('getCycleMode() returns daily when set', getCycleMode() === 'daily');

process.env.CYCLE_MODE = '6hour';
test('getCycleMode() returns 6hour when set', getCycleMode() === '6hour');

process.env.CYCLE_MODE = 'invalid';
test('getCycleMode() defaults to weekly for invalid', getCycleMode() === 'weekly');

// ═══════════════════════════════════════════════════════════
section('2. WEEKLY MODE');

delete process.env.CYCLE_MODE;
const weeklyId = getCurrentWeekId();
test('Weekly format: YYYY-WXX', /^\d{4}-W\d{2}$/.test(weeklyId), weeklyId);
test('Weekly is valid', isValidWeekId(weeklyId));
test('Weekly is NOT daily type', !isDailyCycleId(weeklyId));
test('Weekly is NOT 6hour type', !is6HourCycleId(weeklyId));
test('Weekly is NOT test type', !isTestCycleId(weeklyId));

const weeklyPrev = getPreviousWeekId(weeklyId);
const weeklyNext = getNextWeekId(weeklyId);
test('Weekly prev is valid', isValidWeekId(weeklyPrev));
test('Weekly next is valid', isValidWeekId(weeklyNext));
test('Weekly prev != current', weeklyPrev !== weeklyId);
test('Weekly next != current', weeklyNext !== weeklyId);

// Parse weekly
const parsedWeekly = parseWeekId(weeklyId);
test('parseWeekId returns year', parsedWeekly.year > 2020 && parsedWeekly.year < 2100);
test('parseWeekId returns week 1-53', parsedWeekly.week >= 1 && parsedWeekly.week <= 53);

// ═══════════════════════════════════════════════════════════
section('3. DAILY MODE');

process.env.CYCLE_MODE = 'daily';
const dailyId = getCurrentWeekId();
test('Daily format: YYYY-DXXX', /^\d{4}-D\d{3}$/.test(dailyId), dailyId);
test('Daily is valid', isValidWeekId(dailyId));
test('Daily IS daily type', isDailyCycleId(dailyId));
test('Daily is NOT 6hour type', !is6HourCycleId(dailyId));
test('Daily is NOT test type', !isTestCycleId(dailyId));

const dailyPrev = getPreviousWeekId(dailyId);
const dailyNext = getNextWeekId(dailyId);
test('Daily prev is valid', isValidWeekId(dailyPrev));
test('Daily next is valid', isValidWeekId(dailyNext));
test('Daily prev != current', dailyPrev !== dailyId);
test('Daily next != current', dailyNext !== dailyId);

// Parse daily
const parsedDaily = parseDayId(dailyId);
test('parseDayId returns year', parsedDaily.year > 2020 && parsedDaily.year < 2100);
test('parseDayId returns day 1-366', parsedDaily.day >= 1 && parsedDaily.day <= 366);

// ═══════════════════════════════════════════════════════════
section('4. 6-HOUR MODE');

process.env.CYCLE_MODE = '6hour';
const hourId = getCurrentWeekId();
test('6hour format: YYYY-DXXX-PX', /^\d{4}-D\d{3}-P\d$/.test(hourId), hourId);
test('6hour is valid', isValidWeekId(hourId));
test('6hour is NOT daily type', !isDailyCycleId(hourId));
test('6hour IS 6hour type', is6HourCycleId(hourId));
test('6hour is NOT test type', !isTestCycleId(hourId));

const hourPrev = getPreviousWeekId(hourId);
const hourNext = getNextWeekId(hourId);
test('6hour prev is valid', isValidWeekId(hourPrev));
test('6hour next is valid', isValidWeekId(hourNext));
test('6hour prev != current', hourPrev !== hourId);
test('6hour next != current', hourNext !== hourId);

// Parse 6hour
const parsed6hour = parse6HourId(hourId);
test('parse6HourId returns year', parsed6hour.year > 2020 && parsed6hour.year < 2100);
test('parse6HourId returns day 1-366', parsed6hour.day >= 1 && parsed6hour.day <= 366);
test('parse6HourId returns period 0-3', parsed6hour.period >= 0 && parsed6hour.period <= 3);

// ═══════════════════════════════════════════════════════════
section('5. 6-HOUR PERIOD TRANSITIONS');

// Period within same day
test('P0 -> P1 same day', getPreviousWeekId('2026-D028-P1') === '2026-D028-P0');
test('P1 -> P2 same day', getPreviousWeekId('2026-D028-P2') === '2026-D028-P1');
test('P2 -> P3 same day', getPreviousWeekId('2026-D028-P3') === '2026-D028-P2');

// Period crossing day boundary
test('P0 prev is P3 of prev day', getPreviousWeekId('2026-D028-P0') === '2026-D027-P3');
test('P3 next is P0 of next day', getNextWeekId('2026-D028-P3') === '2026-D029-P0');

// Forward transitions
test('P0 -> P1 forward', getNextWeekId('2026-D028-P0') === '2026-D028-P1');
test('P1 -> P2 forward', getNextWeekId('2026-D028-P1') === '2026-D028-P2');
test('P2 -> P3 forward', getNextWeekId('2026-D028-P2') === '2026-D028-P3');

// ═══════════════════════════════════════════════════════════
section('6. DAILY TRANSITIONS');

process.env.CYCLE_MODE = 'daily';
test('Day transition backward', getPreviousWeekId('2026-D028') === '2026-D027');
test('Day transition forward', getNextWeekId('2026-D028') === '2026-D029');

// Year boundary (day 1)
test('Day 1 prev is day 365/366 of prev year', getPreviousWeekId('2026-D001').includes('2025-D'));

// ═══════════════════════════════════════════════════════════
section('7. WEEKLY TRANSITIONS');

delete process.env.CYCLE_MODE;
test('Week transition backward', getPreviousWeekId('2026-W05') === '2026-W04');
test('Week transition forward', getNextWeekId('2026-W05') === '2026-W06');
test('Week 1 prev is week 52 of prev year', getPreviousWeekId('2026-W01') === '2025-W52');

// ═══════════════════════════════════════════════════════════
section('8. TEST/FORK MODE IDs');

test('TEST-001 is valid', isValidWeekId('TEST-001'));
test('TEST-001 is test type', isTestCycleId('TEST-001'));
test('TEST-999 is valid', isValidWeekId('TEST-999'));
test('TEST-ABC is NOT valid', !isValidWeekId('TEST-ABC'));
test('INVALID is NOT valid', !isValidWeekId('INVALID'));

// ═══════════════════════════════════════════════════════════
section('9. VALIDATION EDGE CASES');

// Valid formats
test('2026-W01 valid', isValidWeekId('2026-W01'));
test('2026-W53 valid', isValidWeekId('2026-W53'));
test('2026-D001 valid', isValidWeekId('2026-D001'));
test('2026-D366 valid', isValidWeekId('2026-D366'));
test('2026-D028-P0 valid', isValidWeekId('2026-D028-P0'));
test('2026-D028-P3 valid', isValidWeekId('2026-D028-P3'));

// Invalid formats
test('2026-W00 invalid (week 0)', !isValidWeekId('2026-W00'));
test('2026-W54 invalid (week 54)', !isValidWeekId('2026-W54'));
test('2026-D000 invalid (day 0)', !isValidWeekId('2026-D000'));
test('2026-D367 invalid (day 367)', !isValidWeekId('2026-D367'));
test('2026-D028-P4 invalid (period 4)', !isValidWeekId('2026-D028-P4'));
test('random string invalid', !isValidWeekId('random'));
test('empty string invalid', !isValidWeekId(''));

// ═══════════════════════════════════════════════════════════
section('10. HELPER FUNCTIONS');

// getDayOfYear
const jan1 = new Date('2026-01-01');
const dec31 = new Date('2026-12-31');
test('getDayOfYear Jan 1 = 1', getDayOfYear(jan1) === 1);
test('getDayOfYear Dec 31 = 365', getDayOfYear(dec31) === 365);

// get6HourPeriod
const hour0 = new Date('2026-01-28T00:00:00Z');
const hour6 = new Date('2026-01-28T06:00:00Z');
const hour12 = new Date('2026-01-28T12:00:00Z');
const hour18 = new Date('2026-01-28T18:00:00Z');
test('Hour 0 = Period 0', get6HourPeriod(hour0) === 0);
test('Hour 6 = Period 1', get6HourPeriod(hour6) === 1);
test('Hour 12 = Period 2', get6HourPeriod(hour12) === 2);
test('Hour 18 = Period 3', get6HourPeriod(hour18) === 3);

// Edge cases within periods
const hour5 = new Date('2026-01-28T05:59:59Z');
const hour11 = new Date('2026-01-28T11:59:59Z');
test('Hour 5:59 = Period 0', get6HourPeriod(hour5) === 0);
test('Hour 11:59 = Period 1', get6HourPeriod(hour11) === 1);

// ═══════════════════════════════════════════════════════════
section('11. SORTING VERIFICATION');

const mixedIds = [
  '2026-W05', '2026-W04', '2026-W03',
  '2026-D028-P1', '2026-D028-P0', '2026-D027-P3',
  '2026-D028', '2026-D027',
  'TEST-003', 'TEST-002', 'TEST-001'
];

const sorted = [...mixedIds].sort((a, b) => b.localeCompare(a));
test('Sorted descending works', sorted[0] === 'TEST-003');
test('Weekly sorts correctly', sorted.indexOf('2026-W05') < sorted.indexOf('2026-W04'));
test('Daily sorts correctly', sorted.indexOf('2026-D028') < sorted.indexOf('2026-D027'));
test('6hour sorts correctly', sorted.indexOf('2026-D028-P1') < sorted.indexOf('2026-D028-P0'));

// ═══════════════════════════════════════════════════════════
section('12. CROSS-MODE COMPATIBILITY');

// These IDs should be parseable regardless of current mode
const allFormats = ['2026-W05', '2026-D028', '2026-D028-P0', 'TEST-001'];

for (const id of allFormats) {
  test(`${id} is always valid`, isValidWeekId(id));

  // getPreviousWeekId should work for any format
  try {
    const prev = getPreviousWeekId(id);
    // TEST-001 is a special case - prev returns TEST-001 (no earlier cycle)
    const expectSame = id === 'TEST-001';
    test(`getPreviousWeekId(${id}) works`, expectSame ? prev === id : (prev !== id && prev.length > 0));
  } catch (e) {
    test(`getPreviousWeekId(${id}) works`, false, String(e));
  }

  // getNextWeekId should work for any format
  try {
    const next = getNextWeekId(id);
    test(`getNextWeekId(${id}) works`, next !== id && next.length > 0);
  } catch (e) {
    test(`getNextWeekId(${id}) works`, false, String(e));
  }
}

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`TOTAL: ${passCount + failCount} tests`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log('═'.repeat(60));

if (failCount > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
  process.exit(1);
} else {
  console.log('\n✅ ALL TESTS PASSED');
  process.exit(0);
}
