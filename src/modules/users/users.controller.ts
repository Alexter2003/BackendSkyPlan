import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import type { UserPublic } from './interfaces/user-public.interface.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto): Promise<ServiceResponse<UserPublic>> {
    return this.usersService.create(dto);
  }
}
