import { IsString, Matches } from 'class-validator';
import { TIME_FORMAT, TIME_FORMAT_MESSAGE } from './create-activity.dto.js';

export const DATE_FORMAT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class RescheduleActivityDto {
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'la fecha debe tener el formato YYYY-MM-DD',
  })
  date!: string;

  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  startTime!: string;

  @IsString()
  @Matches(TIME_FORMAT, { message: TIME_FORMAT_MESSAGE })
  endTime!: string;
}
