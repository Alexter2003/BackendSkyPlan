import { IsEmail, MaxLength } from 'class-validator';

export class ResendConfirmationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
