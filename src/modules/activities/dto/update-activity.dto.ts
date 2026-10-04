import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ActivityType } from '@prisma/client';
import { TIME_FORMAT, TIME_FORMAT_MESSAGE } from './create-activity.dto.js';

// Escrito a mano (igual que UpdateVisitDto): no se justifica instalar
// @nestjs/mapped-types solo para esto. `visitId` no se puede cambiar aquí.
export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  endTime?: string;

  @IsOptional()
  @IsEnum(ActivityType, {
    message: 'el tipo debe ser OUTDOOR (al aire libre) o INDOOR (interior)',
  })
  type?: ActivityType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'debes elegir al menos una condición climática' })
  @ArrayUnique({ message: 'las condiciones climáticas no pueden repetirse' })
  @IsInt({ each: true })
  weatherConditionIds?: number[];
}
