import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WeatherModule } from '../weather/weather.module.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesAutoCancelCron } from './activities-auto-cancel.cron.js';
import { ActivityAutoCancelService } from './activity-auto-cancel.service.js';
import { ActivityViabilityService } from './activity-viability.service.js';
import { UpcomingActivitiesService } from './upcoming-activities.service.js';

@Module({
  imports: [NotificationsModule, WeatherModule],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    ActivityViabilityService,
    ActivityAutoCancelService,
    ActivitiesAutoCancelCron,
    UpcomingActivitiesService,
  ],
  exports: [ActivityViabilityService],
})
export class ActivitiesModule {}
