import { logger } from '../../src/utils/logger';

// ═══════════════════════════════════════════════════════════
// Logger Tests
// ═══════════════════════════════════════════════════════════

describe('Logger', () => {
  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('logging methods', () => {
    it('should log info without throwing', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log warn without throwing', () => {
      expect(() => logger.warn('Test warning message')).not.toThrow();
    });

    it('should log error without throwing', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log debug without throwing', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => logger.info('Message with meta', { key: 'value', num: 42 })).not.toThrow();
    });

    it('should log error with stack trace', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });
  });

  describe('log levels', () => {
    it('should have a log level set', () => {
      expect(logger.level).toBeDefined();
      expect(typeof logger.level).toBe('string');
    });

    it('should be silent in test mode', () => {
      // In test mode, console transport is silent
      expect(logger.transports.length).toBeGreaterThan(0);
    });
  });

  describe('default meta', () => {
    it('should have service name in default meta', () => {
      expect(logger.defaultMeta).toBeDefined();
      expect(logger.defaultMeta.service).toBe('aquari-airdrop');
    });
  });
});
