import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class ListActivitiesQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'visitId debe ser un número entero' })
  visitId!: number;
}
