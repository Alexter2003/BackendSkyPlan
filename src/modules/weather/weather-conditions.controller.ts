import { Controller, Get } from '@nestjs/common';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import type { WeatherConditionPublic } from './interfaces/weather-condition-public.interface.js';
import { WeatherConditionsService } from './weather-conditions.service.js';

@Controller('weather-conditions')
export class WeatherConditionsController {
  constructor(
    private readonly weatherConditionsService: WeatherConditionsService,
  ) {}

  @Get()
  findAll(): Promise<ServiceResponse<WeatherConditionPublic[]>> {
    return this.weatherConditionsService.findAll();
  }
}
