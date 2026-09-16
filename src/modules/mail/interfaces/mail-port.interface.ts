export interface ConfirmationEmail {
  to: string;
  username: string;
  confirmationCode: string;
}

// Port that any mail transport (mock, nodemailer, Resend, ...) implements.
// Consumers depend on this token, never on a concrete provider.
export interface MailPort {
  sendConfirmationEmail(payload: ConfirmationEmail): Promise<void>;
}

export const MAIL_PORT = Symbol('MAIL_PORT');
