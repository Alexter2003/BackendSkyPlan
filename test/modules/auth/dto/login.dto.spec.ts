import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../../../src/modules/auth/dto/login.dto.js';

describe('LoginDto', () => {
  it('passes validation with a valid identifier and password', async () => {
    const dto = plainToInstance(LoginDto, {
      identifier: 'testuser',
      password: 'anypassword',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes validation with a password that does not meet the registration strength rules', async () => {
    // Login must not replicate CreateUserDto's strength rules: doing so
    // would lock out any account whose password predates a policy change.
    const dto = plainToInstance(LoginDto, {
      identifier: 'testuser',
      password: 'weak',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation with an empty identifier', async () => {
    const dto = plainToInstance(LoginDto, {
      identifier: '',
      password: 'anypassword',
    });
    const errors = await validate(dto);

    expect(
      errors.find((error) => error.property === 'identifier'),
    ).toBeDefined();
  });

  it('fails validation with a password longer than the bcrypt input limit', async () => {
    const dto = plainToInstance(LoginDto, {
      identifier: 'testuser',
      password: 'a'.repeat(73),
    });
    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'password')).toBeDefined();
  });
});
