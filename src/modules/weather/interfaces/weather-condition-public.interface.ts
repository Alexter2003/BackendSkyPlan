export interface WeatherConditionPublic {
  id: number;
  name: string;
  description: string;
  // IDs de las condiciones que no se pueden elegir junto a esta. El cliente
  // los usa para deshabilitar opciones; la validación real es del backend.
  conflictsWith: number[];
}
