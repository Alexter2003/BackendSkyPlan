import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityViabilityService } from './activity-viability.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityViabilityService],
  exports: [ActivityViabilityService],
})
export class ActivitiesModule {}
