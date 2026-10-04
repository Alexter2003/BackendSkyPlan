import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import type { NotificationPublic } from './interfaces/notification-public.interface.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<ServiceResponse<NotificationPublic[]>> {
    return this.notificationsService.findAll(user.id, query.unread === 'true');
  }

  // Debe declararse antes de ':id/read' para que "read-all" no se interprete
  // como un id.
  @Patch('read-all')
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponse<{ count: number }>> {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<NotificationPublic>> {
    return this.notificationsService.markRead(user.id, id);
  }
}
