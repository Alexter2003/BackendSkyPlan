import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class ConfirmEmailDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Transform(({ value }: { value: string }) => value?.trim().toUpperCase())
  @IsString()
  @Matches(/^[A-Z0-9]{5}$/, {
    message: 'el código debe tener 5 caracteres alfanuméricos en mayúscula',
  })
  code!: string;
}
