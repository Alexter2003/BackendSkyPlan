import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVisitDto } from '../../../../src/modules/visits/dto/create-visit.dto.js';

const validPayload = {
  name: 'Antigua Guatemala',
  latitude: 14.5586,
  longitude: -90.7295,
  date: '2026-09-28',
};

describe('CreateVisitDto', () => {
  it('passes validation with a valid payload', async () => {
    const dto = plainToInstance(CreateVisitDto, validPayload);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a latitude out of range', async () => {
    const dto = plainToInstance(CreateVisitDto, {
      ...validPayload,
      latitude: 200,
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'latitude')).toBe(true);
  });

  it('rejects a longitude out of range', async () => {
    const dto = plainToInstance(CreateVisitDto, {
      ...validPayload,
      longitude: -400,
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'longitude')).toBe(true);
  });

  it('rejects a date not in YYYY-MM-DD format', async () => {
    const dto = plainToInstance(CreateVisitDto, {
      ...validPayload,
      date: '09/28/2026',
    });
    const errors = await validate(dto);

    const match = errors.find((error) => error.property === 'date');
    expect(match).toBeDefined();
    expect(match?.constraints).toMatchObject({
      matches: 'la fecha debe tener el formato YYYY-MM-DD',
    });
  });

  it('rejects an empty name', async () => {
    const dto = plainToInstance(CreateVisitDto, { ...validPayload, name: '' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });
});
