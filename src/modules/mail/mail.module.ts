import { Module } from '@nestjs/common';
import { MAIL_PORT } from './interfaces/mail-port.interface.js';
import { ResendMailService } from './resend-mail.service.js';

@Module({
  providers: [{ provide: MAIL_PORT, useClass: ResendMailService }],
  exports: [MAIL_PORT],
})
export class MailModule {}
