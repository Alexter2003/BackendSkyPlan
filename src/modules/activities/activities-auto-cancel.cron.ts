import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ActivityAutoCancelService } from './activity-auto-cancel.service.js';

@Injectable()
export class ActivitiesAutoCancelCron {
  private readonly logger = new Logger(ActivitiesAutoCancelCron.name);
  private running = false;

  constructor(private readonly autoCancel: ActivityAutoCancelService) {}

  @Cron('*/15 * * * *', {
    name: 'auto-cancel-activities',
    timeZone: 'America/Guatemala',
  })
  async cancelUnviableActivities(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'La corrida anterior aún está en curso, se omite esta ejecución',
      );
      return;
    }

    this.running = true;
    const startedAt = Date.now();

    try {
      const result = await this.autoCancel.run();
      if (result.inWindow > 0) {
        this.logger.log(
          `Cancelación automática: ${result.scanned} candidatas, ${result.inWindow} en ventana, ` +
            `${result.cancelled} canceladas, ${result.skipped} omitidas (${Date.now() - startedAt}ms)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Fallo la cancelación automática: ${(error as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
