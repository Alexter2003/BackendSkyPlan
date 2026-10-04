import { PrismaClient } from '@prisma/client';
import {
  WEATHER_CONDITION_DESCRIPTIONS,
  WEATHER_CONDITION_NAMES,
} from '../src/modules/weather/constants/weather-conditions.constants.js';

const prisma = new PrismaClient();

const STATES = ['planned', 'confirmed', 'cancelled', 'completed'];

const WEATHER_CONDITIONS = WEATHER_CONDITION_NAMES.map((name) => ({
  name,
  description: WEATHER_CONDITION_DESCRIPTIONS[name],
}));

async function main() {
  for (const name of STATES) {
    await prisma.state.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const condition of WEATHER_CONDITIONS) {
    await prisma.weatherCondition.upsert({
      where: { name: condition.name },
      update: {},
      create: condition,
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
