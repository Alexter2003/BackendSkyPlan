// Catálogo de condiciones climáticas que el usuario puede elegir para una
// actividad. Los nombres coinciden con las filas de la tabla WeatherCondition
// (prisma/seed.ts importa esta constante, así hay una sola fuente de verdad).
export const WEATHER_CONDITION = {
  SUNNY: 'sunny',
  CLEAR: 'clear',
  PARTLY_CLOUDY: 'partly_cloudy',
  CLOUDY: 'cloudy',
  DRIZZLE: 'drizzle',
  RAINY: 'rainy',
  SNOWY: 'snowy',
  WINDY: 'windy',
} as const;

export type WeatherConditionName =
  (typeof WEATHER_CONDITION)[keyof typeof WEATHER_CONDITION];

export const WEATHER_CONDITION_NAMES = Object.values(
  WEATHER_CONDITION,
) as WeatherConditionName[];

export const WEATHER_CONDITION_DESCRIPTIONS: Record<
  WeatherConditionName,
  string
> = {
  sunny: 'Clear sky with abundant sunshine',
  clear: 'Clear sky',
  partly_cloudy: 'Partly cloudy sky',
  cloudy: 'Overcast sky',
  drizzle: 'Light drizzle',
  rainy: 'Continuous rainfall',
  snowy: 'Snowfall',
  windy: 'Strong sustained wind',
};

// Etiquetas que se muestran al usuario en los mensajes de error.
export const WEATHER_CONDITION_LABELS: Record<WeatherConditionName, string> = {
  sunny: 'soleado',
  clear: 'despejado',
  partly_cloudy: 'parcialmente nublado',
  cloudy: 'nublado',
  drizzle: 'llovizna',
  rainy: 'lluvia',
  snowy: 'nieve',
  windy: 'ventoso',
};

// Única fuente de verdad de las combinaciones contradictorias. Cada par se
// lee en ambos sentidos (A con B es lo mismo que B con A). `windy` no aparece
// porque es compatible con cualquier otra condición, y `sunny` con `clear`
// tampoco: son sinónimos, no se contradicen.
export const WEATHER_CONDITION_CONFLICTS: ReadonlyArray<
  readonly [WeatherConditionName, WeatherConditionName]
> = [
  // Cielo: el nivel de nubosidad es uno solo.
  ['sunny', 'partly_cloudy'],
  ['sunny', 'cloudy'],
  ['clear', 'partly_cloudy'],
  ['clear', 'cloudy'],
  ['partly_cloudy', 'cloudy'],
  // Precipitación: solo puede ocurrir un tipo a la vez.
  ['drizzle', 'rainy'],
  ['drizzle', 'snowy'],
  ['rainy', 'snowy'],
  // Cielo despejado contra cualquier precipitación.
  ['sunny', 'drizzle'],
  ['sunny', 'rainy'],
  ['sunny', 'snowy'],
  ['clear', 'drizzle'],
  ['clear', 'rainy'],
  ['clear', 'snowy'],
];

// Umbrales con los que se traducen los datos numéricos del clima a las
// condiciones del catálogo. Ver weather-conditions.utils.ts.
export const CLASSIFICATION_THRESHOLDS = {
  // Nubosidad en %: < CLEAR_MAX despejado, < PARTLY_CLOUDY_MAX parcialmente
  // nublado, el resto nublado.
  CLOUD_COVER_CLEAR_MAX: 30,
  CLOUD_COVER_PARTLY_CLOUDY_MAX: 70,
  // Precipitación en mm: >= DRIZZLE_MIN llovizna, >= RAIN_MIN lluvia.
  PRECIPITATION_DRIZZLE_MIN: 0.1,
  PRECIPITATION_RAIN_MIN: 1,
  // Viento en km/h.
  WIND_SPEED_WINDY_MIN: 30,
} as const;

// Códigos WMO (https://open-meteo.com/en/docs) agrupados por fenómeno.
export const WMO_CODES = {
  DRIZZLE: [51, 52, 53, 54, 55, 56, 57],
  RAIN: [61, 62, 63, 64, 65, 66, 67, 80, 81, 82, 95, 96, 97, 98, 99],
  SNOW: [71, 72, 73, 74, 75, 76, 77, 85, 86],
} as const;
