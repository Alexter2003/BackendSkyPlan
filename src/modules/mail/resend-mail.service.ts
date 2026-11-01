import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { buildConfirmationEmail } from './templates/confirmation-email.template.js';
import { buildTemporaryPasswordEmail } from './templates/temporary-password-email.template.js';
import type {
  ConfirmationEmail,
  MailPort,
  TemporaryPasswordEmail,
} from './interfaces/mail-port.interface.js';

const DEFAULT_MAIL_FROM = 'SkyPlan <no-reply@skyplan.alexvyumes-dev.com>';

@Injectable()
export class ResendMailService implements MailPort {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.from = config.get<string>('MAIL_FROM') ?? DEFAULT_MAIL_FROM;
  }

  async sendConfirmationEmail(payload: ConfirmationEmail): Promise<void> {
    const { subject, html, text } = buildConfirmationEmail(
      payload.username,
      payload.confirmationCode,
      payload.expiresInMinutes,
    );

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(
        `Resend failed to send confirmation email: ${error.message}`,
      );
    }
  }

  async sendTemporaryPasswordEmail(
    payload: TemporaryPasswordEmail,
  ): Promise<void> {
    const { subject, html, text } = buildTemporaryPasswordEmail(
      payload.username,
      payload.temporaryPassword,
      payload.expiresInMinutes,
    );

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(
        `Resend failed to send temporary password email: ${error.message}`,
      );
    }
  }
}
