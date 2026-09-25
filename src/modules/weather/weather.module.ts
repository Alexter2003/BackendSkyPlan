import { Module } from '@nestjs/common';
import { WEATHER_PORT } from './interfaces/weather-port.interface.js';
import { OpenMeteoService } from './open-meteo.service.js';

@Module({
  providers: [{ provide: WEATHER_PORT, useClass: OpenMeteoService }],
  exports: [WEATHER_PORT],
})
export class WeatherModule {}
