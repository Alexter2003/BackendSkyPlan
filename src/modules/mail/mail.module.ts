import { Module } from '@nestjs/common';
import { MAIL_PORT } from './interfaces/mail-port.interface.js';
import { MockMailService } from './mail.service.js';

@Module({
  providers: [{ provide: MAIL_PORT, useClass: MockMailService }],
  exports: [MAIL_PORT],
})
export class MailModule {}
