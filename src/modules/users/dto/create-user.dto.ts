import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Match } from '../../../common/validators/match.decorator.js';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message:
      'username can only contain letters, numbers, dots, underscores and hyphens',
  })
  username!: string;

  // 72 is bcrypt's real input limit; anything past that is silently ignored.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain at least one lowercase letter, one uppercase letter and one number',
  })
  password!: string;

  @IsString()
  @Match('password', { message: 'passwordConfirmation must match password' })
  passwordConfirmation!: string;
}
