import 'reflect-metadata';
import { UsersController } from '../../../src/modules/users/users.controller.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../../../src/common/decorators/allow-pending-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator.js';

describe('UsersController profile routes', () => {
  const usersService = { getProfile: vi.fn(), updateProfile: vi.fn() };
  const controller = new UsersController(
    usersService as unknown as UsersService,
  );
  const user = { id: 1 } as never;

  it('GET me delegates to getProfile with the authenticated user', () => {
    const response = { status: 200, message: 'ok', data: {} };
    usersService.getProfile.mockReturnValue(response);

    expect(controller.me(user)).toBe(response);
    expect(usersService.getProfile).toHaveBeenCalledWith(user);
  });

  it('PUT me delegates to updateProfile with the user and the dto', async () => {
    const response = { status: 200, message: 'ok', data: {} };
    usersService.updateProfile.mockResolvedValue(response);
    const dto = { firstName: 'Ana' };

    await expect(controller.updateMe(user, dto)).resolves.toBe(response);
    expect(usersService.updateProfile).toHaveBeenCalledWith(user, dto);
  });

  it('GET me is allowed while a password change is pending, PUT me is not', () => {
    expect(
      Reflect.getMetadata(
        ALLOW_PENDING_PASSWORD_CHANGE_KEY,
        UsersController.prototype.me,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_PENDING_PASSWORD_CHANGE_KEY,
        UsersController.prototype.updateMe,
      ),
    ).toBeUndefined();
  });

  it('profile routes are protected, not public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype.me),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype.updateMe),
    ).toBeUndefined();
  });
});
