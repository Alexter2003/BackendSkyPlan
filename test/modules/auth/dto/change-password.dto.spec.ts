import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../../../../src/modules/auth/dto/change-password.dto.js';

const validPayload = {
  currentPassword: 'Tmp9xKq2LmWz',
  newPassword: 'NewPassw0rd',
  confirmNewPassword: 'NewPassw0rd',
};

async function propertiesWithErrors(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(ChangePasswordDto, body));
  return errors.map((error) => error.property);
}

describe('ChangePasswordDto', () => {
  it('passes with matching, strong passwords', async () => {
    expect(await propertiesWithErrors(validPayload)).toEqual([]);
  });

  it('rejects when the confirmation does not match', async () => {
    expect(
      await propertiesWithErrors({
        ...validPayload,
        confirmNewPassword: 'Different1',
      }),
    ).toEqual(['confirmNewPassword']);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'password123'],
    ['no digit', 'PasswordOnly'],
    ['longer than 72', `Aa1${'x'.repeat(70)}`],
  ])('rejects a new password that is %s', async (_label, newPassword) => {
    const properties = await propertiesWithErrors({
      ...validPayload,
      newPassword,
      confirmNewPassword: newPassword,
    });

    expect(properties).toContain('newPassword');
  });

  it('rejects when the current password is missing', async () => {
    expect(
      await propertiesWithErrors({
        newPassword: validPayload.newPassword,
        confirmNewPassword: validPayload.confirmNewPassword,
      }),
    ).toContain('currentPassword');
  });
});
