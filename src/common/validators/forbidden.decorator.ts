import { registerDecorator, ValidationOptions } from 'class-validator';

// Falla si la propiedad viene presente en el cuerpo (con cualquier valor,
// incluido null). Sirve para rechazar un campo con un mensaje específico en
// vez del genérico de forbidNonWhitelisted, que solo dice "no debe existir".
export function Forbidden(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'forbidden',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return value === undefined;
        },
        defaultMessage(): string {
          return 'este campo no se puede modificar';
        },
      },
    });
  };
}
