export interface ConfirmationEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildConfirmationEmail(
  username: string,
  confirmationCode: string,
): ConfirmationEmailContent {
  const subject = 'Confirm your SkyPlan account';

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #f4f5f7; padding: 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 32px;">
            <tr>
              <td style="color: #1a1a1a; font-size: 20px; font-weight: bold; padding-bottom: 16px;">
                Welcome to SkyPlan, ${username}!
              </td>
            </tr>
            <tr>
              <td style="color: #4a4a4a; font-size: 14px; padding-bottom: 24px;">
                Use the confirmation code below to verify your email address.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom: 24px;">
                <span style="display: inline-block; background-color: #f0f2f5; color: #1a1a1a; font-size: 22px; font-weight: bold; letter-spacing: 2px; padding: 12px 20px; border-radius: 6px;">
                  ${confirmationCode}
                </span>
              </td>
            </tr>
            <tr>
              <td style="color: #8a8a8a; font-size: 12px;">
                If you didn't create a SkyPlan account, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const text = `Welcome to SkyPlan, ${username}!\n\nYour confirmation code is: ${confirmationCode}\n\nIf you didn't create a SkyPlan account, you can ignore this email.`;

  return { subject, html, text };
}
