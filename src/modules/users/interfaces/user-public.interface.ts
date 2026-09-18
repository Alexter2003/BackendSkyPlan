// Forma devuelta a los clientes. Nunca incluye passwordHash ni el código
// de confirmación.
export interface UserPublic {
  id: number;
  email: string;
  username: string;
  emailConfirmed: boolean;
  createdAt: Date;
}
