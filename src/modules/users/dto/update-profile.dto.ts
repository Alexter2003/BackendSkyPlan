import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Forbidden } from '../../../common/validators/forbidden.decorator.js';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  // ValidateIf y no IsOptional: IsOptional también dejaría pasar null.
  @ValidateIf((o: UpdateProfileDto) => o.firstName !== undefined)
  @Transform(trimString)
  @IsString({ message: 'firstName debe ser texto' })
  @MinLength(1, { message: 'firstName no puede estar vacío' })
  @MaxLength(100, { message: 'firstName no puede exceder 100 caracteres' })
  firstName?: string;

  @ValidateIf((o: UpdateProfileDto) => o.lastName !== undefined)
  @Transform(trimString)
  @IsString({ message: 'lastName debe ser texto' })
  @MinLength(1, { message: 'lastName no puede estar vacío' })
  @MaxLength(100, { message: 'lastName no puede exceder 100 caracteres' })
  lastName?: string;

  // Campos que existen en el usuario pero que este endpoint rechaza de forma
  // explícita: el enunciado exige un rechazo, no que se ignoren en silencio.
  @Forbidden({ message: 'El nombre de usuario no se puede modificar' })
  username?: unknown;

  @Forbidden({
    message:
      'La contraseña no se puede modificar desde el perfil; usa la recuperación de contraseña',
  })
  password?: unknown;

  @Forbidden({ message: 'El correo no se puede modificar' })
  email?: unknown;
}
