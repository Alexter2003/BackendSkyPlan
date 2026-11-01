import { randomInt } from 'node:crypto';
import { TEMP_PASSWORD_LENGTH } from '../constants/password-recovery.constants.js';

// Sin caracteres ambiguos (0/O, 1/l/I) porque el usuario la copia a mano
// desde el correo.
const LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWERCASE + UPPERCASE + DIGITS;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

// Genera una contraseña temporal que cumple la complejidad exigida en el
// registro (minúscula, mayúscula y dígito): se garantiza un carácter de cada
// clase y el resto sale del alfabeto completo, luego se mezcla.
export function generateTemporaryPassword(): string {
  const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
