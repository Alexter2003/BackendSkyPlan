import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AllowPendingPasswordChange } from '../../common/decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/guards/session.guard.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { LoginResult } from './interfaces/login-result.interface.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<ServiceResponse<LoginResult>> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ServiceResponse<null>> {
    return this.authService.forgotPassword(dto);
  }

  @AllowPendingPasswordChange()
  @Put('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Body() dto: ChangePasswordDto,
  ): Promise<ServiceResponse<null>> {
    return this.authService.changePassword(user, req.sessionId, dto);
  }

  // SessionGuard ya validó la sesión y dejó su id en req.sessionId.
  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request): Promise<ServiceResponse<null>> {
    return this.authService.logout(req.sessionId);
  }
}
