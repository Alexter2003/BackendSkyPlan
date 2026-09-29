import { Module } from '@nestjs/common';
import { WeatherModule } from '../weather/weather.module.js';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';
import { VisitsWeatherCron } from './visits-weather.cron.js';

@Module({
  imports: [WeatherModule],
  controllers: [VisitsController],
  providers: [VisitsService, VisitsWeatherCron],
})
export class VisitsModule {}
