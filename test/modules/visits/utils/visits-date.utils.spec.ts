import { BadRequestException } from '@nestjs/common';
import { assertDateHasArrived } from '../../../../src/modules/visits/utils/visits.utils.js';

describe('assertDateHasArrived (Guatemala day)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(isoUtc: string): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoUtc));
  }

  it("rejects tomorrow's visit at 19:00 in Guatemala, when UTC is already the next day", () => {
    // 2026-11-02 19:00 Guatemala = 2026-11-03 01:00 UTC
    at('2026-11-03T01:00:00Z');

    expect(() =>
      assertDateHasArrived(new Date('2026-11-03T00:00:00Z')),
    ).toThrow(BadRequestException);
  });

  it("accepts today's visit at 19:00 in Guatemala", () => {
    at('2026-11-03T01:00:00Z');

    expect(() =>
      assertDateHasArrived(new Date('2026-11-02T00:00:00Z')),
    ).not.toThrow();
  });

  it("accepts today's visit at 08:00 in Guatemala", () => {
    // 2026-11-02 08:00 Guatemala = 14:00 UTC
    at('2026-11-02T14:00:00Z');

    expect(() =>
      assertDateHasArrived(new Date('2026-11-02T00:00:00Z')),
    ).not.toThrow();
  });

  it('accepts a past visit and rejects a future one', () => {
    at('2026-11-02T14:00:00Z');

    expect(() =>
      assertDateHasArrived(new Date('2026-10-30T00:00:00Z')),
    ).not.toThrow();
    expect(() =>
      assertDateHasArrived(new Date('2026-11-04T00:00:00Z')),
    ).toThrow('No puedes finalizar una visita cuya fecha aún no ha llegado');
  });

  it('keeps the visit of the Guatemala day allowed just after midnight local', () => {
    // 2026-11-03 00:30 Guatemala = 06:30 UTC
    at('2026-11-03T06:30:00Z');

    expect(() =>
      assertDateHasArrived(new Date('2026-11-03T00:00:00Z')),
    ).not.toThrow();
  });
});
