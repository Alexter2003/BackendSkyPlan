// Shape returned to clients. Never includes passwordHash or confirmationCode.
export interface UserPublic {
  id: number;
  email: string;
  username: string;
  emailConfirmed: boolean;
  createdAt: Date;
}
