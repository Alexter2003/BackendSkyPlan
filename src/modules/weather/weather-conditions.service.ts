import { HttpStatus, Injectable } from '@nestjs/common';
import type { ServiceResponse } from '../../common/interfaces/service-response.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WEATHER_CONDITION_CONFLICTS } from './constants/weather-conditions.constants.js';
import type { WeatherConditionPublic } from './interfaces/weather-condition-public.interface.js';

@Injectable()
export class WeatherConditionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ServiceResponse<WeatherConditionPublic[]>> {
    const conditions = await this.prisma.weatherCondition.findMany({
      orderBy: { id: 'asc' },
    });

    const idByName = new Map(
      conditions.map((condition) => [condition.name, condition.id]),
    );
    const conflicts = new Map<number, Set<number>>();

    for (const [a, b] of WEATHER_CONDITION_CONFLICTS) {
      const idA = idByName.get(a);
      const idB = idByName.get(b);
      if (idA === undefined || idB === undefined) {
        continue;
      }
      conflicts.set(idA, (conflicts.get(idA) ?? new Set()).add(idB));
      conflicts.set(idB, (conflicts.get(idB) ?? new Set()).add(idA));
    }

    return {
      status: HttpStatus.OK,
      message: 'Condiciones climáticas obtenidas exitosamente',
      data: conditions.map((condition) => ({
        id: condition.id,
        name: condition.name,
        description: condition.description,
        conflictsWith: [...(conflicts.get(condition.id) ?? [])],
      })),
    };
  }
}
