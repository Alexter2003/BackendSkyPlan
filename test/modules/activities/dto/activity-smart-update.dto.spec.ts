import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelActivityDto } from '../../../../src/modules/activities/dto/cancel-activity.dto.js';
import { ListUpcomingActivitiesQueryDto } from '../../../../src/modules/activities/dto/list-upcoming-activities-query.dto.js';
import { RescheduleActivityDto } from '../../../../src/modules/activities/dto/reschedule-activity.dto.js';

async function errors<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
) {
  const result = await validate(plainToInstance(cls, payload));
  return result.map((error) => error.property);
}

describe('CancelActivityDto', () => {
  it.each([{}, { reason: 'Me enfermé' }])('accepts %j', async (payload) => {
    expect(await errors(CancelActivityDto, payload)).toEqual([]);
  });

  it('rejects an empty reason', async () => {
    expect(await errors(CancelActivityDto, { reason: '' })).toContain('reason');
  });

  it('rejects a reason longer than 500 characters', async () => {
    expect(
      await errors(CancelActivityDto, { reason: 'x'.repeat(501) }),
    ).toContain('reason');
  });
});

describe('RescheduleActivityDto', () => {
  const valid = { date: '2026-11-05', startTime: '14:00', endTime: '16:00' };

  it('accepts a valid payload', async () => {
    expect(await errors(RescheduleActivityDto, valid)).toEqual([]);
  });

  it.each(['2026-13-01', '2026-11-32', '05-11-2026', '2026/11/05', ''])(
    'rejects date %s',
    async (date) => {
      expect(await errors(RescheduleActivityDto, { ...valid, date })).toContain(
        'date',
      );
    },
  );

  it.each(['8:00', '24:00', 'ab:cd'])('rejects startTime %s', async (value) => {
    expect(
      await errors(RescheduleActivityDto, { ...valid, startTime: value }),
    ).toContain('startTime');
  });

  it('requires all three fields', async () => {
    expect(await errors(RescheduleActivityDto, {})).toEqual(
      expect.arrayContaining(['date', 'startTime', 'endTime']),
    );
  });
});

describe('ListUpcomingActivitiesQueryDto', () => {
  it('accepts an empty query and coerces numeric strings', async () => {
    expect(await errors(ListUpcomingActivitiesQueryDto, {})).toEqual([]);

    const dto = plainToInstance(ListUpcomingActivitiesQueryDto, {
      days: '3',
      probabilityMin: '70',
      page: '2',
      limit: '10',
      state: 'cancelled_by_system',
      sortBy: 'probability',
      order: 'desc',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.days).toBe(3);
    expect(dto.probabilityMin).toBe(70);
  });

  it.each([
    ['days', 0],
    ['days', 366],
    ['probabilityMin', -1],
    ['probabilityMax', 101],
    ['page', 0],
    ['limit', 0],
    ['limit', 101],
    ['state', 'confirmed'],
    ['sortBy', 'name'],
    ['order', 'up'],
    ['visitId', 'abc'],
  ])('rejects %s=%s', async (field, value) => {
    expect(
      await errors(ListUpcomingActivitiesQueryDto, { [field]: value }),
    ).toContain(field);
  });
});
