export interface TemporaryPasswordEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildTemporaryPasswordEmail(
  username: string,
  temporaryPassword: string,
  expiresInMinutes: number,
): TemporaryPasswordEmailContent {
  const subject = 'Your temporary SkyPlan password';

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #f4f5f7; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 32px;">
            <tr>
              <td style="color: #1a1a1a; font-size: 20px; font-weight: bold; padding-bottom: 16px;">
                Hi ${username}, here is your temporary password
              </td>
            </tr>
            <tr>
              <td style="color: #4a4a4a; font-size: 14px; padding-bottom: 24px;">
                Sign in with the password below. You will be asked to choose a new password right away.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom: 24px;">
                <span style="display: inline-block; background-color: #f0f2f5; color: #1a1a1a; font-size: 22px; font-weight: bold; letter-spacing: 2px; padding: 12px 20px; border-radius: 6px;">
                  ${temporaryPassword}
                </span>
              </td>
            </tr>
            <tr>
              <td style="color: #8a8a8a; font-size: 12px; padding-bottom: 8px;">
                This password expires in ${expiresInMinutes} minutes.
              </td>
            </tr>
            <tr>
              <td style="color: #8a8a8a; font-size: 12px;">
                If you didn't request this, you can ignore this email and request another one when you need it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Hi ${username},\n\nYour temporary password is: ${temporaryPassword}\n\nSign in with it and you will be asked to choose a new password right away.\n\nThis password expires in ${expiresInMinutes} minutes.\n\nIf you didn't request this, you can ignore this email and request another one when you need it.`;

  return { subject, html, text };
}
