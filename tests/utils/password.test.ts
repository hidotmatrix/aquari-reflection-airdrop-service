import {
  hashPassword,
  verifyPassword,
  isBcryptHash,
} from '../../src/utils/password';

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should generate a bcrypt hash', async () => {
      const hash = await hashPassword('testpassword');
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await hashPassword('samepassword');
      const hash2 = await hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password against hash', async () => {
      const password = 'mysecretpassword';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correctpassword');
      const result = await verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });

    it('should handle legacy plain-text passwords with warning', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await verifyPassword('admin123', 'admin123');

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plain-text password detected')
      );

      consoleSpy.mockRestore();
    });

    it('should reject wrong plain-text password', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await verifyPassword('wrongpassword', 'admin123');

      expect(result).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('isBcryptHash', () => {
    it('should identify $2a$ bcrypt hashes', () => {
      expect(isBcryptHash('$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.HQS1K1pQvKMKiu')).toBe(true);
    });

    it('should identify $2b$ bcrypt hashes', () => {
      expect(isBcryptHash('$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.HQS1K1pQvKMKiu')).toBe(true);
    });

    it('should identify $2y$ bcrypt hashes', () => {
      expect(isBcryptHash('$2y$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.HQS1K1pQvKMKiu')).toBe(true);
    });

    it('should reject plain-text strings', () => {
      expect(isBcryptHash('plainpassword')).toBe(false);
      expect(isBcryptHash('admin123')).toBe(false);
    });

    it('should reject other hash formats', () => {
      expect(isBcryptHash('5e884898da28047d9142')).toBe(false);
      expect(isBcryptHash('sha256:abcdef')).toBe(false);
    });
  });
});
