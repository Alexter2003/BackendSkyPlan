import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  identifier!: string;

  // Sin reglas de fuerza aquí (mayúscula/minúscula/dígito): eso filtraría
  // la política de contraseñas y bloquearía el acceso de cualquier cuenta
  // cuyo password no las cumpla. En login solo se valida presencia y el
  // límite real de entrada de bcrypt.
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
