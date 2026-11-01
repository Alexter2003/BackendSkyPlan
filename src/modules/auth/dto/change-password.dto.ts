import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Match } from '../../../common/validators/match.decorator.js';

export class ChangePasswordDto {
  // 72 es el límite real de entrada de bcrypt.
  @IsString()
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'el newPassword debe contener al menos una minúscula, una mayúscula y un número',
  })
  newPassword!: string;

  @IsString()
  @Match('newPassword', {
    message: 'confirmNewPassword debe coincidir con newPassword',
  })
  confirmNewPassword!: string;
}
