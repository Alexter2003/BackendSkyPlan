import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from '../../../../src/modules/users/dto/create-user.dto.js';

const validPayload = {
  email: 'test@skyplan.dev',
  username: 'testuser',
  password: 'Passw0rd!',
  passwordConfirmation: 'Passw0rd!',
};

describe('CreateUserDto', () => {
  it('passes validation with matching passwords', async () => {
    const dto = plainToInstance(CreateUserDto, validPayload);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation when passwordConfirmation does not match password', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...validPayload,
      passwordConfirmation: 'Different1!',
    });
    const errors = await validate(dto);

    const match = errors.find(
      (error) => error.property === 'passwordConfirmation',
    );
    expect(match).toBeDefined();
    expect(match?.constraints).toMatchObject({
      match: 'passwordConfirmation must match password',
    });
  });
});
