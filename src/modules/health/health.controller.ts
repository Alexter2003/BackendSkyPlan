import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async check(): Promise<ServiceResponse<{ status: 'ok'; database: 'up' }>> {
    const data = await this.healthService.check();
    return { status: HttpStatus.OK, message: 'Servicio operativo', data };
  }
}
