import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActivityDto } from '../../../../src/modules/activities/dto/create-activity.dto.js';

const valid = {
  visitId: 1,
  name: 'Caminata',
  description: 'Cerro de la Cruz',
  startTime: '08:00',
  endTime: '10:30',
  type: 'OUTDOOR',
  weatherConditionIds: [1, 3],
};

async function errorsFor(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateActivityDto, { ...valid, ...overrides });
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('CreateActivityDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(['8:00', '24:00', '08:60', '0800', 'ab:cd'])(
    'rejects startTime %s',
    async (startTime) => {
      expect(await errorsFor({ startTime })).toContain('startTime');
    },
  );

  it('rejects an unknown activity type', async () => {
    expect(await errorsFor({ type: 'UNDERWATER' })).toContain('type');
  });

  it('accepts both activity types', async () => {
    expect(await errorsFor({ type: 'INDOOR' })).toEqual([]);
  });

  it('requires at least one weather condition', async () => {
    expect(await errorsFor({ weatherConditionIds: [] })).toContain(
      'weatherConditionIds',
    );
  });

  it('rejects duplicated weather conditions', async () => {
    expect(await errorsFor({ weatherConditionIds: [1, 1] })).toContain(
      'weatherConditionIds',
    );
  });

  it('rejects non-integer weather condition ids', async () => {
    expect(await errorsFor({ weatherConditionIds: ['a'] })).toContain(
      'weatherConditionIds',
    );
  });

  it('uses Spanish error messages', async () => {
    const dto = plainToInstance(CreateActivityDto, {
      ...valid,
      startTime: 'x',
      weatherConditionIds: [],
    });
    const messages = (await validate(dto)).flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    expect(messages).toContain('la hora debe tener el formato HH:mm');
    expect(messages).toContain('debes elegir al menos una condición climática');
  });
});
