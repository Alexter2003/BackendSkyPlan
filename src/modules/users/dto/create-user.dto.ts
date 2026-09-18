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
      'el username solo puede contener letras, números, puntos, guiones bajos y guiones',
  })
  username!: string;

  // 72 es el límite real de entrada de bcrypt; todo lo que pase de ahí se
  // ignora silenciosamente.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'el password debe contener al menos una minúscula, una mayúscula y un número',
  })
  password!: string;

  @IsString()
  @Match('password', {
    message: 'passwordConfirmation debe coincidir con password',
  })
  passwordConfirmation!: string;
}
