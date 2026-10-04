import { Module } from '@nestjs/common';
import { WEATHER_PORT } from './interfaces/weather-port.interface.js';
import { OpenMeteoService } from './open-meteo.service.js';
import { WeatherConditionsController } from './weather-conditions.controller.js';
import { WeatherConditionsService } from './weather-conditions.service.js';

@Module({
  controllers: [WeatherConditionsController],
  providers: [
    { provide: WEATHER_PORT, useClass: OpenMeteoService },
    WeatherConditionsService,
  ],
  exports: [WEATHER_PORT],
})
export class WeatherModule {}
