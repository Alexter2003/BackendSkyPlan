// Forma devuelta a los clientes. Nunca incluye passwordHash ni el código
// de confirmación.
export interface UserPublic {
  id: number;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  emailConfirmed: boolean;
  createdAt: Date;
}
