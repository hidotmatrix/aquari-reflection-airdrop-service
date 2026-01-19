import {
  getWeekId,
  parseWeekId,
  getWeekStartDate,
  getWeekEndDate,
  getPreviousWeekId,
  getNextWeekId,
  isValidWeekId,
  getISOWeekNumber,
  getISOWeekYear,
} from '../../src/utils/week';

// ═══════════════════════════════════════════════════════════
// Week Utility Tests
// ═══════════════════════════════════════════════════════════

describe('Week Utilities', () => {
  describe('getWeekId', () => {
    it('should return correct week ID format', () => {
      const date = new Date('2025-01-20T12:00:00Z');
      const weekId = getWeekId(date);
      expect(weekId).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('should return 2025-W04 for January 20, 2025', () => {
      const date = new Date('2025-01-20T12:00:00Z');
      const weekId = getWeekId(date);
      expect(weekId).toBe('2025-W04');
    });

    it('should return 2025-W01 for January 1, 2025', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const weekId = getWeekId(date);
      expect(weekId).toBe('2025-W01');
    });

    it('should handle year boundary correctly (Dec 31)', () => {
      const date = new Date('2024-12-31T12:00:00Z');
      const weekId = getWeekId(date);
      // Dec 31, 2024 is in week 1 of 2025
      expect(weekId).toBe('2025-W01');
    });

    it('should use current date if not provided', () => {
      const weekId = getWeekId();
      expect(weekId).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  describe('parseWeekId', () => {
    it('should correctly parse valid week ID', () => {
      const result = parseWeekId('2025-W04');
      expect(result).toEqual({ year: 2025, week: 4 });
    });

    it('should throw error for invalid format', () => {
      expect(() => parseWeekId('2025-04')).toThrow('Invalid week ID format');
      expect(() => parseWeekId('2025-W4')).toThrow('Invalid week ID format');
      expect(() => parseWeekId('invalid')).toThrow('Invalid week ID format');
    });

    it('should handle week 01 correctly', () => {
      const result = parseWeekId('2025-W01');
      expect(result).toEqual({ year: 2025, week: 1 });
    });

    it('should handle week 53 correctly', () => {
      const result = parseWeekId('2020-W53');
      expect(result).toEqual({ year: 2020, week: 53 });
    });
  });

  describe('getWeekStartDate', () => {
    it('should return Monday 00:00 UTC', () => {
      const start = getWeekStartDate('2025-W04');
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(start.getUTCSeconds()).toBe(0);
    });

    it('should return correct date for 2025-W04', () => {
      const start = getWeekStartDate('2025-W04');
      expect(start.getUTCFullYear()).toBe(2025);
      expect(start.getUTCMonth()).toBe(0); // January
      expect(start.getUTCDate()).toBe(20);
    });
  });

  describe('getWeekEndDate', () => {
    it('should return Sunday 23:59:59 UTC', () => {
      const end = getWeekEndDate('2025-W04');
      expect(end.getUTCDay()).toBe(0); // Sunday
      expect(end.getUTCHours()).toBe(23);
      expect(end.getUTCMinutes()).toBe(59);
      expect(end.getUTCSeconds()).toBe(59);
    });

    it('should return correct date for 2025-W04', () => {
      const end = getWeekEndDate('2025-W04');
      expect(end.getUTCFullYear()).toBe(2025);
      expect(end.getUTCMonth()).toBe(0); // January
      expect(end.getUTCDate()).toBe(26);
    });
  });

  describe('getPreviousWeekId', () => {
    it('should return previous week', () => {
      expect(getPreviousWeekId('2025-W04')).toBe('2025-W03');
      expect(getPreviousWeekId('2025-W01')).toBe('2024-W52');
    });

    it('should handle year boundary', () => {
      const prevWeek = getPreviousWeekId('2025-W01');
      expect(prevWeek).toMatch(/^2024-W\d{2}$/);
    });
  });

  describe('getNextWeekId', () => {
    it('should return next week', () => {
      expect(getNextWeekId('2025-W04')).toBe('2025-W05');
    });

    it('should handle year boundary', () => {
      const nextWeek = getNextWeekId('2024-W52');
      expect(nextWeek).toMatch(/^(2024-W53|2025-W01)$/);
    });
  });

  describe('isValidWeekId', () => {
    it('should return true for valid week IDs', () => {
      expect(isValidWeekId('2025-W01')).toBe(true);
      expect(isValidWeekId('2025-W52')).toBe(true);
      expect(isValidWeekId('2020-W53')).toBe(true);
    });

    it('should return false for invalid week IDs', () => {
      expect(isValidWeekId('2025-W00')).toBe(false);
      expect(isValidWeekId('2025-W54')).toBe(false);
      expect(isValidWeekId('2025-04')).toBe(false);
      expect(isValidWeekId('invalid')).toBe(false);
    });
  });

  describe('getISOWeekNumber', () => {
    it('should return correct week number', () => {
      expect(getISOWeekNumber(new Date('2025-01-20'))).toBe(4);
      expect(getISOWeekNumber(new Date('2025-01-01'))).toBe(1);
    });
  });

  describe('getISOWeekYear', () => {
    it('should return correct year', () => {
      expect(getISOWeekYear(new Date('2025-01-20'))).toBe(2025);
    });

    it('should handle year boundary', () => {
      // Dec 31, 2024 is in ISO week 1 of 2025
      expect(getISOWeekYear(new Date('2024-12-31'))).toBe(2025);
    });
  });
});
