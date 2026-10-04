import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { ActivitiesService } from './activities.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { ListActivitiesQueryDto } from './dto/list-activities-query.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import type { ActivityPublic } from './interfaces/activity-public.interface.js';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateActivityDto,
  ): Promise<ServiceResponse<ActivityPublic>> {
    return this.activitiesService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListActivitiesQueryDto,
  ): Promise<ServiceResponse<ActivityPublic[]>> {
    return this.activitiesService.findAll(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    return this.activitiesService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityDto,
  ): Promise<ServiceResponse<ActivityPublic>> {
    return this.activitiesService.update(user.id, id, dto);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    return this.activitiesService.complete(user.id, id);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<ActivityPublic>> {
    return this.activitiesService.cancel(user.id, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<null>> {
    return this.activitiesService.remove(user.id, id);
  }
}
