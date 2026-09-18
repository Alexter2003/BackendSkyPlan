import {
  extractBearerToken,
  hashSessionToken,
} from '../../../src/common/utils/session-token.utils.js';

describe('hashSessionToken', () => {
  it('is deterministic and produces a 64-char hex digest', () => {
    const token = 'a'.repeat(64);

    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashSessionToken('a'.repeat(64))).not.toBe(
      hashSessionToken('b'.repeat(64)),
    );
  });
});

describe('extractBearerToken', () => {
  it('extracts the token from a well-formed header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('returns null without the Bearer prefix', () => {
    expect(extractBearerToken('abc123')).toBeNull();
  });

  it('returns null when the header is missing', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null when there is nothing after the prefix', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
    expect(extractBearerToken('Bearer    ')).toBeNull();
  });
});
