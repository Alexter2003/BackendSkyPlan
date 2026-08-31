import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATES = ['planned', 'confirmed', 'cancelled', 'completed'];

const WEATHER_CONDITIONS = [
  { name: 'sunny', description: 'Clear sky with abundant sunshine' },
  { name: 'rainy', description: 'Continuous rainfall' },
  { name: 'cloudy', description: 'Overcast sky' },
  { name: 'windy', description: 'Strong sustained wind' },
  { name: 'snowy', description: 'Snowfall' },
];

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
