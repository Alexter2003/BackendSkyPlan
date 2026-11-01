import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ForgotPasswordDto } from '../../../../src/modules/auth/dto/forgot-password.dto.js';

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(ForgotPasswordDto, body));
}

describe('ForgotPasswordDto', () => {
  it('accepts a valid email', async () => {
    expect(await errorsFor({ email: 'test@skyplan.dev' })).toHaveLength(0);
  });

  it.each(['not-an-email', '', 42, undefined])(
    'rejects %s as email',
    async (email) => {
      const errors = await errorsFor({ email });

      expect(errors.map((error) => error.property)).toContain('email');
    },
  );

  it('rejects an email longer than 255 characters', async () => {
    const email = `${'a'.repeat(250)}@skyplan.dev`;

    expect(await errorsFor({ email })).not.toHaveLength(0);
  });
});
