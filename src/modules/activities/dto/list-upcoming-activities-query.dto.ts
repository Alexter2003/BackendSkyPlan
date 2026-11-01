import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ACTIVITY_STATE } from '../utils/activities.utils.js';

export const UPCOMING_STATES = [
  ACTIVITY_STATE.PLANNED,
  ACTIVITY_STATE.COMPLETED,
  ACTIVITY_STATE.CANCELLED,
  ACTIVITY_STATE.CANCELLED_BY_SYSTEM,
] as const;

export const UPCOMING_SORT_FIELDS = ['date', 'probability'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export class ListUpcomingActivitiesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un número entero' })
  @Min(1, { message: 'days debe ser al menos 1' })
  @Max(365, { message: 'days no puede ser mayor a 365' })
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'visitId debe ser un número entero' })
  visitId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'probabilityMin debe ser un número entero' })
  @Min(0, { message: 'probabilityMin debe estar entre 0 y 100' })
  @Max(100, { message: 'probabilityMin debe estar entre 0 y 100' })
  probabilityMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'probabilityMax debe ser un número entero' })
  @Min(0, { message: 'probabilityMax debe estar entre 0 y 100' })
  @Max(100, { message: 'probabilityMax debe estar entre 0 y 100' })
  probabilityMax?: number;

  @IsOptional()
  @IsIn(UPCOMING_STATES, {
    message: `state debe ser uno de: ${UPCOMING_STATES.join(', ')}`,
  })
  state?: (typeof UPCOMING_STATES)[number];

  @IsOptional()
  @IsIn(UPCOMING_SORT_FIELDS, {
    message: `sortBy debe ser uno de: ${UPCOMING_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: (typeof UPCOMING_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'order debe ser asc o desc' })
  order?: (typeof SORT_ORDERS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero' })
  @Min(1, { message: 'page debe ser al menos 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(MAX_PAGE_LIMIT, {
    message: `limit no puede ser mayor a ${MAX_PAGE_LIMIT}`,
  })
  limit?: number;
}
