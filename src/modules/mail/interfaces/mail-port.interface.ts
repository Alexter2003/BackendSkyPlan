export interface ConfirmationEmail {
  to: string;
  username: string;
  confirmationCode: string;
  expiresInMinutes: number;
}

export interface TemporaryPasswordEmail {
  to: string;
  username: string;
  temporaryPassword: string;
  expiresInMinutes: number;
}

// Puerto que implementa cualquier transporte de correo (mock, nodemailer,
// Resend, ...). Los consumidores dependen de este token, nunca de un
// proveedor concreto.
export interface MailPort {
  sendConfirmationEmail(payload: ConfirmationEmail): Promise<void>;
  sendTemporaryPasswordEmail(payload: TemporaryPasswordEmail): Promise<void>;
}

export const MAIL_PORT = Symbol('MAIL_PORT');
