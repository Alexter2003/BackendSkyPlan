import { IsIn, IsOptional } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'unread debe ser true o false' })
  unread?: 'true' | 'false';
}
