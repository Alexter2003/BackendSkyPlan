import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

const STATUS_BY_CODE: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT, // violación de restricción única
  P2025: HttpStatus.NOT_FOUND, // registro no encontrado
  P2003: HttpStatus.BAD_REQUEST, // violación de llave foránea
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(`[${exception.code}] ${exception.message}`);

    response.status(status).json({
      statusCode: status,
      message: STATUS_BY_CODE[exception.code]
        ? `Error de base de datos (${exception.code})`
        : 'Error interno del servidor',
    });
  }
}
