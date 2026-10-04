import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ActivityType } from '@prisma/client';

export const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TIME_FORMAT_MESSAGE = 'la hora debe tener el formato HH:mm';

export class CreateActivityDto {
  @IsInt()
  visitId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description!: string;

  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  startTime!: string;

  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  endTime!: string;

  @IsEnum(ActivityType, {
    message: 'el tipo debe ser OUTDOOR (al aire libre) o INDOOR (interior)',
  })
  type!: ActivityType;

  @IsArray()
  @ArrayMinSize(1, { message: 'debes elegir al menos una condición climática' })
  @ArrayUnique({ message: 'las condiciones climáticas no pueden repetirse' })
  @IsInt({ each: true })
  weatherConditionIds!: number[];
}
