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
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { CreateVisitDto } from './dto/create-visit.dto.js';
import { UpdateVisitDto } from './dto/update-visit.dto.js';
import type {
  VisitDetail,
  VisitPublic,
} from './interfaces/visit-public.interface.js';
import { VisitsService } from './visits.service.js';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVisitDto,
  ): Promise<ServiceResponse<VisitPublic>> {
    return this.visitsService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponse<VisitPublic[]>> {
    return this.visitsService.findAll(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<VisitDetail>> {
    return this.visitsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVisitDto,
  ): Promise<ServiceResponse<VisitPublic>> {
    return this.visitsService.update(user.id, id, dto);
  }

  @Patch(':id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<VisitPublic>> {
    return this.visitsService.complete(user.id, id);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<VisitPublic>> {
    return this.visitsService.cancel(user.id, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceResponse<null>> {
    return this.visitsService.remove(user.id, id);
  }
}
