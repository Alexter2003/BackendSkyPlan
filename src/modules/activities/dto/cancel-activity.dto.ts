import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'el motivo no puede estar vacío' })
  @MaxLength(500, { message: 'el motivo no puede superar los 500 caracteres' })
  reason?: string;
}
