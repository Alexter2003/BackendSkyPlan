import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Connection is lazy: Prisma opens it on the first query rather than at
// bootstrap, so the app can start even if the database isn't reachable yet
// (e.g. Supabase credentials not configured). Use GET /api/health to check
// connectivity.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
