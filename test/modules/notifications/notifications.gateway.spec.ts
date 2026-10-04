import { NotificationsGateway } from '../../../src/modules/notifications/notifications.gateway.js';
import type { PrismaService } from '../../../src/prisma/prisma.service.js';
import { hashSessionToken } from '../../../src/common/utils/session-token.utils.js';

function createClient(token: unknown) {
  return {
    handshake: { auth: { token } },
    join: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
}

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let prisma: {
    session: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const validSession = {
    id: 3,
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: null,
    user: { id: 7, isActive: true, passwordHash: 'x' },
  };

  beforeEach(() => {
    prisma = { session: { findUnique: vi.fn(), update: vi.fn() } };
    gateway = new NotificationsGateway(prisma as unknown as PrismaService);
  });

  it('joins the user room when the token is a valid session', async () => {
    prisma.session.findUnique.mockResolvedValue(validSession);
    const client = createClient('abc');

    await gateway.handleConnection(client as never);

    expect(prisma.session.findUnique.mock.calls[0][0].where).toEqual({
      tokenHash: hashSessionToken('abc'),
    });
    expect(client.join).toHaveBeenCalledWith('user:7');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 42])(
    'disconnects when the token is %s',
    async (token) => {
      const client = createClient(token);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(prisma.session.findUnique).not.toHaveBeenCalled();
    },
  );

  it('disconnects when the session does not exist', async () => {
    prisma.session.findUnique.mockResolvedValue(null);
    const client = createClient('nope');

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('disconnects when the session is expired or the account inactive', async () => {
    for (const session of [
      { ...validSession, expiresAt: new Date(Date.now() - 1000) },
      { ...validSession, user: { ...validSession.user, isActive: false } },
    ]) {
      prisma.session.findUnique.mockResolvedValue(session);
      const client = createClient('abc');

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    }
  });

  it('emits events only to the target user room', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.emitToUser(7, 'event', { a: 1 });

    expect(to).toHaveBeenCalledWith('user:7');
    expect(emit).toHaveBeenCalledWith('event', { a: 1 });
  });
});
