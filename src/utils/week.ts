// ═══════════════════════════════════════════════════════════
// Week ID Utilities
// Format: "YYYY-WXX" (e.g., "2025-W04")
// ═══════════════════════════════════════════════════════════

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
 * Get the previous week ID
 */
export function getPreviousWeekId(weekId: string): string {
  const startDate = getWeekStartDate(weekId);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  return getWeekId(startDate);
}

/**
 * Get the next week ID
 */
export function getNextWeekId(weekId: string): string {
  const startDate = getWeekStartDate(weekId);
  startDate.setUTCDate(startDate.getUTCDate() + 7);
  return getWeekId(startDate);
}

/**
 * Get the current week ID
 */
export function getCurrentWeekId(): string {
  return getWeekId(new Date());
}

/**
 * Validate week ID format
 */
export function isValidWeekId(weekId: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    return false;
  }
  const { week } = parseWeekId(weekId);
  return week >= 1 && week <= 53;
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
