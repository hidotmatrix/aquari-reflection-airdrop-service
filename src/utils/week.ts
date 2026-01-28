// ═══════════════════════════════════════════════════════════
// Week ID Utilities
// Format: "YYYY-WXX" (e.g., "2025-W04") for weekly mode
// Format: "YYYY-DXXX" (e.g., "2025-D028") for daily mode
// ═══════════════════════════════════════════════════════════

/**
 * Get cycle mode from environment
 * - 'weekly' (default): One cycle per calendar week (YYYY-WXX)
 * - 'daily': One cycle per day (YYYY-DXXX) - useful for testing
 * - '6hour': 4 cycles per day (YYYY-DXXX-HXX) - fastest testing
 */
export function getCycleMode(): 'weekly' | 'daily' | '6hour' {
  const mode = process.env.CYCLE_MODE;
  if (mode === 'daily') return 'daily';
  if (mode === '6hour') return '6hour';
  return 'weekly';
}

/**
 * Get day of year for a date (1-366)
 */
export function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Generate day ID for a given date
 * @param date - Date to get day ID for (defaults to now)
 * @returns Day ID in format "YYYY-DXXX"
 */
export function getDayId(date: Date = new Date()): string {
  const year = date.getFullYear();
  const day = getDayOfYear(date);
  return `${year}-D${day.toString().padStart(3, '0')}`;
}

/**
 * Get 6-hour period (0-3) for a given hour
 * Period 0: 00:00-05:59, Period 1: 06:00-11:59
 * Period 2: 12:00-17:59, Period 3: 18:00-23:59
 */
export function get6HourPeriod(date: Date = new Date()): number {
  return Math.floor(date.getUTCHours() / 6);
}

/**
 * Generate 6-hour period ID for a given date
 * @param date - Date to get period ID for (defaults to now)
 * @returns Period ID in format "YYYY-DXXX-PX"
 */
export function get6HourId(date: Date = new Date()): string {
  const dayId = getDayId(date);
  const period = get6HourPeriod(date);
  return `${dayId}-P${period}`;
}

/**
 * Check if a cycle ID is a 6-hour period ID
 */
export function is6HourCycleId(cycleId: string): boolean {
  return /^\d{4}-D\d{3}-P\d$/.test(cycleId);
}

/**
 * Parse a 6-hour period ID
 */
export function parse6HourId(periodId: string): { year: number; day: number; period: number } {
  const match = periodId.match(/^(\d{4})-D(\d{3})-P(\d)$/);
  if (!match) {
    throw new Error(`Invalid 6-hour period ID format: ${periodId}. Expected format: YYYY-DXXX-PX`);
  }
  return {
    year: parseInt(match[1]!, 10),
    day: parseInt(match[2]!, 10),
    period: parseInt(match[3]!, 10),
  };
}

/**
 * Get ISO week number for a date
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get ISO week year (can differ from calendar year at year boundaries)
 */
export function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * Generate week ID for a given date
 * @param date - Date to get week ID for (defaults to now)
 * @returns Week ID in format "YYYY-WXX"
 */
export function getWeekId(date: Date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = getISOWeekNumber(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Parse a week ID into year and week number
 */
export function parseWeekId(weekId: string): { year: number; week: number } {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week ID format: ${weekId}. Expected format: YYYY-WXX`);
  }
  return {
    year: parseInt(match[1]!, 10),
    week: parseInt(match[2]!, 10),
  };
}

/**
 * Get the start date (Monday 00:00 UTC) of a week
 */
export function getWeekStartDate(weekId: string): Date {
  const { year, week } = parseWeekId(weekId);

  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

  // Add weeks
  const targetDate = new Date(firstMonday);
  targetDate.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);

  return targetDate;
}

/**
 * Get the end date (Sunday 23:59:59 UTC) of a week
 */
export function getWeekEndDate(weekId: string): Date {
  const startDate = getWeekStartDate(weekId);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  endDate.setUTCHours(23, 59, 59, 999);
  return endDate;
}

/**
 * Get the previous cycle ID (handles weekly, daily, and 6hour modes)
 */
export function getPreviousWeekId(weekId: string): string {
  // Handle 6-hour mode
  if (is6HourCycleId(weekId)) {
    const { year, day, period } = parse6HourId(weekId);
    if (period > 0) {
      // Previous period same day
      return `${year}-D${day.toString().padStart(3, '0')}-P${period - 1}`;
    } else {
      // Period 0, go to previous day period 3
      const date = new Date(Date.UTC(year, 0, day));
      date.setUTCDate(date.getUTCDate() - 1);
      return `${getDayId(date)}-P3`;
    }
  }

  // Handle daily mode
  if (isDailyCycleId(weekId)) {
    const { year, day } = parseDayId(weekId);
    const date = new Date(Date.UTC(year, 0, day));
    date.setUTCDate(date.getUTCDate() - 1);
    return getDayId(date);
  }

  // Weekly mode
  const startDate = getWeekStartDate(weekId);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  return getWeekId(startDate);
}

/**
 * Get the next cycle ID (handles weekly, daily, and 6hour modes)
 */
export function getNextWeekId(weekId: string): string {
  // Handle 6-hour mode
  if (is6HourCycleId(weekId)) {
    const { year, day, period } = parse6HourId(weekId);
    if (period < 3) {
      // Next period same day
      return `${year}-D${day.toString().padStart(3, '0')}-P${period + 1}`;
    } else {
      // Period 3, go to next day period 0
      const date = new Date(Date.UTC(year, 0, day));
      date.setUTCDate(date.getUTCDate() + 1);
      return `${getDayId(date)}-P0`;
    }
  }

  // Handle daily mode
  if (isDailyCycleId(weekId)) {
    const { year, day } = parseDayId(weekId);
    const date = new Date(Date.UTC(year, 0, day));
    date.setUTCDate(date.getUTCDate() + 1);
    return getDayId(date);
  }

  // Weekly mode
  const startDate = getWeekStartDate(weekId);
  startDate.setUTCDate(startDate.getUTCDate() + 7);
  return getWeekId(startDate);
}

/**
 * Get the current week ID (respects CYCLE_MODE)
 * - Weekly mode: returns "YYYY-WXX"
 * - Daily mode: returns "YYYY-DXXX"
 * - 6hour mode: returns "YYYY-DXXX-PX"
 */
export function getCurrentWeekId(): string {
  const mode = getCycleMode();
  if (mode === '6hour') {
    return get6HourId(new Date());
  }
  if (mode === 'daily') {
    return getDayId(new Date());
  }
  return getWeekId(new Date());
}

/**
 * Check if a cycle ID is a daily ID
 */
export function isDailyCycleId(cycleId: string): boolean {
  return /^\d{4}-D\d{3}$/.test(cycleId);
}

/**
 * Parse a daily cycle ID
 */
export function parseDayId(dayId: string): { year: number; day: number } {
  const match = dayId.match(/^(\d{4})-D(\d{3})$/);
  if (!match) {
    throw new Error(`Invalid day ID format: ${dayId}. Expected format: YYYY-DXXX`);
  }
  return {
    year: parseInt(match[1]!, 10),
    day: parseInt(match[2]!, 10),
  };
}

/**
 * Validate cycle ID format (handles weekly, daily, 6hour, and test formats)
 */
export function isValidWeekId(weekId: string): boolean {
  // 6-hour format: YYYY-DXXX-PX
  if (/^\d{4}-D\d{3}-P\d$/.test(weekId)) {
    const { day, period } = parse6HourId(weekId);
    return day >= 1 && day <= 366 && period >= 0 && period <= 3;
  }

  // Daily format: YYYY-DXXX
  if (/^\d{4}-D\d{3}$/.test(weekId)) {
    const { day } = parseDayId(weekId);
    return day >= 1 && day <= 366;
  }

  // Weekly format: YYYY-WXX
  if (/^\d{4}-W\d{2}$/.test(weekId)) {
    const { week } = parseWeekId(weekId);
    return week >= 1 && week <= 53;
  }

  // Test format: TEST-XXX
  if (/^TEST-\d{3}$/.test(weekId)) {
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// Test Mode Week IDs
// Format: "TEST-XXX" (e.g., "TEST-001", "TEST-002")
// ═══════════════════════════════════════════════════════════

/**
 * Generate a test cycle ID
 * @param cycleNumber - The test cycle number (1, 2, 3, etc.)
 * @returns Test cycle ID in format "TEST-XXX"
 */
export function getTestCycleId(cycleNumber: number): string {
  return `TEST-${cycleNumber.toString().padStart(3, '0')}`;
}

/**
 * Check if a week ID is a test cycle ID
 */
export function isTestCycleId(weekId: string): boolean {
  return /^TEST-\d{3}$/.test(weekId);
}

/**
 * Parse test cycle number from ID
 */
export function parseTestCycleId(weekId: string): number {
  const match = weekId.match(/^TEST-(\d{3})$/);
  if (!match) {
    throw new Error(`Invalid test cycle ID format: ${weekId}. Expected format: TEST-XXX`);
  }
  return parseInt(match[1]!, 10);
}
