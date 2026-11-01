import { generateTemporaryPassword } from '../../../../src/modules/auth/utils/temp-password.utils.js';

describe('generateTemporaryPassword', () => {
  it('has 12 characters and meets the registration complexity rule on every call', () => {
    for (let i = 0; i < 500; i++) {
      const password = generateTemporaryPassword();

      expect(password).toHaveLength(12);
      expect(password).toMatch(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('is within the 8-72 characters accepted by the password rules', () => {
    const { length } = generateTemporaryPassword();

    expect(length).toBeGreaterThanOrEqual(8);
    expect(length).toBeLessThanOrEqual(72);
  });

  it('differs between calls', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generateTemporaryPassword()),
    );

    expect(passwords.size).toBe(50);
  });
});
