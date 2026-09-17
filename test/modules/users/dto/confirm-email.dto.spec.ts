import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmEmailDto } from '../../../../src/modules/users/dto/confirm-email.dto.js';

const validPayload = {
  email: 'test@skyplan.dev',
  code: 'ABCDE',
};

describe('ConfirmEmailDto', () => {
  it('passes validation with a valid email and code', async () => {
    const dto = plainToInstance(ConfirmEmailDto, validPayload);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('normalizes a lowercase code to uppercase and trims whitespace', () => {
    const dto = plainToInstance(ConfirmEmailDto, {
      ...validPayload,
      code: ' abcde ',
    });

    expect(dto.code).toBe('ABCDE');
  });

  it('fails validation for a code that is not 5 alphanumeric characters', async () => {
    const dto = plainToInstance(ConfirmEmailDto, {
      ...validPayload,
      code: 'AB',
    });
    const errors = await validate(dto);

    const match = errors.find((error) => error.property === 'code');
    expect(match).toBeDefined();
  });

  it('fails validation for an invalid email', async () => {
    const dto = plainToInstance(ConfirmEmailDto, {
      ...validPayload,
      email: 'not-an-email',
    });
    const errors = await validate(dto);

    const match = errors.find((error) => error.property === 'email');
    expect(match).toBeDefined();
  });
});
