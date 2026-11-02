import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { ActivitiesController } from '../../../src/modules/activities/activities.controller.js';
import type { ActivitiesService } from '../../../src/modules/activities/activities.service.js';
import type { UpcomingActivitiesService } from '../../../src/modules/activities/upcoming-activities.service.js';
import { IS_PUBLIC_KEY } from '../../../src/common/decorators/public.decorator.js';

describe('ActivitiesController checklist routes', () => {
  const service = {
    complete: vi.fn(),
    cancel: vi.fn(),
    uncomplete: vi.fn(),
  };
  const controller = new ActivitiesController(
    service as unknown as ActivitiesService,
    {} as unknown as UpcomingActivitiesService,
  );
  const user = { id: 1 } as never;

  it('PATCH :id/uncomplete delegates with the user id and the activity id', async () => {
    const response = { status: 200, message: 'ok', data: {} };
    service.uncomplete.mockResolvedValue(response);

    await expect(controller.uncomplete(user, 5)).resolves.toBe(response);
    expect(service.uncomplete).toHaveBeenCalledWith(1, 5);
  });

  it('is routed as PATCH :id/uncomplete', () => {
    expect(
      Reflect.getMetadata('path', ActivitiesController.prototype.uncomplete),
    ).toBe(':id/uncomplete');
    expect(
      Reflect.getMetadata('method', ActivitiesController.prototype.uncomplete),
    ).toBe(RequestMethod.PATCH);
  });

  it('is protected, not public', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        ActivitiesController.prototype.uncomplete,
      ),
    ).toBeUndefined();
  });

  it('complete and cancel still delegate and expose the visit status', async () => {
    const response = {
      status: 200,
      message: 'ok',
      data: { visitStatus: 'COMPLETED' },
    };
    service.complete.mockResolvedValue(response);
    service.cancel.mockResolvedValue(response);

    await expect(controller.complete(user, 5)).resolves.toBe(response);
    await expect(controller.cancel(user, 5, { reason: 'x' })).resolves.toBe(
      response,
    );
    expect(service.cancel).toHaveBeenCalledWith(1, 5, { reason: 'x' });
  });
});
