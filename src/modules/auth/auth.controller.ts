import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
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

  // SessionGuard ya validó la sesión y dejó su id en req.sessionId.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request): Promise<ServiceResponse<null>> {
    return this.authService.logout(req.sessionId);
  }
}
