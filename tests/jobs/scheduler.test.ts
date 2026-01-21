import { getSchedulerState, stopScheduler } from '../../src/jobs/scheduler';
import { resetConfig } from '../../src/config/env';

// ═══════════════════════════════════════════════════════════
// Scheduler Tests
// ═══════════════════════════════════════════════════════════

describe('Scheduler', () => {
  beforeEach(() => {
    resetConfig();
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
    resetConfig();
  });

  describe('getSchedulerState', () => {
    it('should return initial state when not running', () => {
      const state = getSchedulerState();

      expect(state).toBeDefined();
      expect(state.isRunning).toBe(false);
      expect(state.currentCycle).toBe(0);
      expect(state.nextAction).toBe('stopped');
    });

    it('should return a copy of state (immutable)', () => {
      const state1 = getSchedulerState();
      const state2 = getSchedulerState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('stopScheduler', () => {
    it('should set isRunning to false', () => {
      stopScheduler();
      const state = getSchedulerState();

      expect(state.isRunning).toBe(false);
    });

    it('should set nextAction to stopped', () => {
      stopScheduler();
      const state = getSchedulerState();

      expect(state.nextAction).toBe('stopped');
    });

    it('should set nextActionTime to null', () => {
      stopScheduler();
      const state = getSchedulerState();

      expect(state.nextActionTime).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Date Calculation Tests
// These test the internal date calculation logic
// ═══════════════════════════════════════════════════════════

describe('Date Calculations', () => {
  describe('getNextSunday2359 logic', () => {
    function getNextSunday2359(now: Date): Date {
      const dayOfWeek = now.getUTCDay();
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();

      let daysToAdd = 0;

      if (dayOfWeek === 0) {
        if (hour < 23 || (hour === 23 && minute < 59)) {
          daysToAdd = 0;
        } else {
          daysToAdd = 7;
        }
      } else {
        daysToAdd = 7 - dayOfWeek;
      }

      const target = new Date(now);
      target.setUTCDate(now.getUTCDate() + daysToAdd);
      target.setUTCHours(23, 59, 0, 0);
      return target;
    }

    it('should return today if called on Sunday before 23:59', () => {
      const now = new Date('2025-01-19T10:00:00.000Z');
      const result = getNextSunday2359(now);

      expect(result.getUTCDay()).toBe(0);
      expect(result.getUTCDate()).toBe(19);
      expect(result.getUTCHours()).toBe(23);
      expect(result.getUTCMinutes()).toBe(59);
    });

    it('should return next Sunday if called on Sunday after 23:59', () => {
      const now = new Date('2025-01-19T23:59:30.000Z');
      const result = getNextSunday2359(now);

      expect(result.getUTCDay()).toBe(0);
      expect(result.getUTCDate()).toBe(26);
    });

    it('should return next Sunday if called on Monday', () => {
      const now = new Date('2025-01-20T10:00:00.000Z');
      const result = getNextSunday2359(now);

      expect(result.getUTCDay()).toBe(0);
      expect(result.getUTCDate()).toBe(26);
    });

    it('should return next Sunday if called on Wednesday', () => {
      const now = new Date('2025-01-22T10:00:00.000Z');
      const result = getNextSunday2359(now);

      expect(result.getUTCDay()).toBe(0);
      expect(result.getUTCDate()).toBe(26);
    });

    it('should return next Sunday if called on Saturday', () => {
      const now = new Date('2025-01-25T10:00:00.000Z');
      const result = getNextSunday2359(now);

      expect(result.getUTCDay()).toBe(0);
      expect(result.getUTCDate()).toBe(26);
    });
  });

  describe('getNextMonday0030 logic', () => {
    function getNextMonday0030(now: Date): Date {
      const dayOfWeek = now.getUTCDay();
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();

      let daysToAdd = 0;

      if (dayOfWeek === 1) {
        if (hour === 0 && minute < 30) {
          daysToAdd = 0;
        } else {
          daysToAdd = 7;
        }
      } else if (dayOfWeek === 0) {
        daysToAdd = 1;
      } else {
        daysToAdd = 8 - dayOfWeek;
      }

      const target = new Date(now);
      target.setUTCDate(now.getUTCDate() + daysToAdd);
      target.setUTCHours(0, 30, 0, 0);
      return target;
    }

    it('should return today if called on Monday before 00:30', () => {
      const now = new Date('2025-01-20T00:15:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(20);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(30);
    });

    it('should return next Monday if called on Monday after 00:30', () => {
      const now = new Date('2025-01-20T00:45:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(27);
    });

    it('should return next Monday if called on Monday afternoon', () => {
      const now = new Date('2025-01-20T14:00:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(27);
    });

    it('should return next day if called on Sunday', () => {
      const now = new Date('2025-01-19T22:00:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(20);
    });

    it('should return next Monday if called on Tuesday', () => {
      const now = new Date('2025-01-21T10:00:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(27);
    });

    it('should return next Monday if called on Friday', () => {
      const now = new Date('2025-01-24T10:00:00.000Z');
      const result = getNextMonday0030(now);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(27);
    });
  });

  describe('Weekly cycle timing', () => {
    it('should have 31 minutes between Sunday 23:59 and Monday 00:30', () => {
      const sunday2359 = new Date('2025-01-19T23:59:00.000Z');
      const monday0030 = new Date('2025-01-20T00:30:00.000Z');

      const diffMs = monday0030.getTime() - sunday2359.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      expect(diffMinutes).toBe(31);
    });
  });
});
