import {
  GUATEMALA_UTC_OFFSET_SECONDS,
  localToday,
} from '../../../src/common/utils/local-date.utils.js';
import { localToday as reExportedLocalToday } from '../../../src/modules/activities/utils/activities.utils.js';

describe('local-date.utils', () => {
  it('uses the Guatemala offset (UTC-6)', () => {
    expect(GUATEMALA_UTC_OFFSET_SECONDS).toBe(-21600);
  });

  it.each([
    ['2026-11-02T05:59:00Z', '2026-11-01T00:00:00.000Z'],
    ['2026-11-02T06:00:00Z', '2026-11-02T00:00:00.000Z'],
    ['2026-11-02T23:59:00Z', '2026-11-02T00:00:00.000Z'],
    ['2026-11-03T05:59:00Z', '2026-11-02T00:00:00.000Z'],
  ])('returns the Guatemala day for %s', (now, expected) => {
    expect(localToday(new Date(now)).toISOString()).toBe(expected);
  });

  it('is the same function re-exported from activities.utils', () => {
    expect(reExportedLocalToday).toBe(localToday);
  });
});
