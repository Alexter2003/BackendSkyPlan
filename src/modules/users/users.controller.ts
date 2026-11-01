import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { AllowPendingPasswordChange } from '../../common/decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { ConfirmEmailDto } from './dto/confirm-email.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { UserProfile } from './interfaces/user-profile.interface.js';
import type { UserPublic } from './interfaces/user-public.interface.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto): Promise<ServiceResponse<UserPublic>> {
    return this.usersService.create(dto);
  }

  @Public()
  @Post('confirm-email')
  @HttpCode(HttpStatus.OK)
  confirmEmail(
    @Body() dto: ConfirmEmailDto,
  ): Promise<ServiceResponse<UserPublic>> {
    return this.usersService.confirmEmail(dto);
  }

  @Public()
  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  resendConfirmation(
    @Body() dto: ResendConfirmationDto,
  ): Promise<ServiceResponse<{ email: string }>> {
    return this.usersService.resendConfirmation(dto);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): ServiceResponse<UserProfile> {
    return this.usersService.getProfile(user);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ServiceResponse<UserProfile>> {
    return this.usersService.updateProfile(user, dto);
  }
}
