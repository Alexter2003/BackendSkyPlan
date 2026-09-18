import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// La conexión es perezosa: Prisma la abre en el primer query en lugar de
// al arrancar, así la app puede iniciar aunque la base de datos no esté
// disponible aún (ej. credenciales de Supabase sin configurar).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
