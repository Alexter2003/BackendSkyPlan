import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from '../../../../src/modules/users/dto/update-profile.dto.js';

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, body);
  const errors = await validate(dto);
  return { dto, errors };
}

function messagesFor(
  errors: Awaited<ReturnType<typeof validate>>,
  property: string,
): string[] {
  return errors
    .filter((error) => error.property === property)
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateProfileDto', () => {
  it('passes with firstName and lastName', async () => {
    const { errors } = await validateBody({
      firstName: 'Ana',
      lastName: 'García',
    });

    expect(errors).toHaveLength(0);
  });

  it('passes with only one of the two fields', async () => {
    expect((await validateBody({ firstName: 'Ana' })).errors).toHaveLength(0);
    expect((await validateBody({ lastName: 'García' })).errors).toHaveLength(0);
  });

  it('trims surrounding whitespace', async () => {
    const { dto, errors } = await validateBody({ firstName: '  Ana  ' });

    expect(errors).toHaveLength(0);
    expect(dto.firstName).toBe('Ana');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['longer than 100 characters', 'a'.repeat(101)],
    ['null', null],
    ['not a string', 42],
  ])('rejects a firstName that is %s', async (_label, firstName) => {
    const { errors } = await validateBody({ firstName });

    expect(messagesFor(errors, 'firstName').length).toBeGreaterThan(0);
  });

  it('accepts exactly 100 characters', async () => {
    const { errors } = await validateBody({ lastName: 'a'.repeat(100) });

    expect(errors).toHaveLength(0);
  });

  describe('forbidden fields', () => {
    it.each([
      ['username', 'otro', 'nombre de usuario'],
      ['password', 'Passw0rd!', 'contraseña'],
      ['email', 'otro@skyplan.dev', 'correo'],
    ])('rejects %s with its own message', async (field, value, fragment) => {
      const { errors } = await validateBody({ [field]: value });

      const messages = messagesFor(errors, field);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(fragment);
    });

    it('rejects a forbidden field even when valid fields come along', async () => {
      const { errors } = await validateBody({
        firstName: 'Ana',
        username: 'otro',
      });

      expect(errors.map((error) => error.property)).toEqual(['username']);
    });

    it('rejects a forbidden field sent as null', async () => {
      const { errors } = await validateBody({ email: null });

      expect(messagesFor(errors, 'email')).toHaveLength(1);
    });
  });
});
