import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '../../../core/auth/jwt';
import { jwtAuthMiddleware, requirePermission } from '../../../core/auth/jwt.middleware';

function buildAppWithMiddleware(perm?: string) {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', jwtAuthMiddleware);
  const opts = perm ? { preHandler: requirePermission(perm) } : {};
  app.get('/test', opts, async (req) => ({ user: req.authUser }));
  return app;
}

describe('jwt.middleware', () => {
  it('401 ohne Authorization-Header', async () => {
    const app = buildAppWithMiddleware();
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('401 mit falschem Token', async () => {
    const app = buildAppWithMiddleware();
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('200 mit gültigem Token, req.authUser ist befüllt', async () => {
    const app = buildAppWithMiddleware();
    const token = signAccessToken({
      userId: 'usr_x',
      tenantId: 'tnt_y',
      permissions: ['receipts.read'],
      preset: 'operator',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: { sub: string; tenant_id: string } };
    expect(body.user.sub).toBe('usr_x');
    expect(body.user.tenant_id).toBe('tnt_y');
    await app.close();
  });

  it('requirePermission: 403 wenn Permission fehlt', async () => {
    const app = buildAppWithMiddleware('users.manage');
    const token = signAccessToken({
      userId: 'usr_x',
      tenantId: 'tnt_y',
      permissions: ['receipts.read'],
      preset: 'operator',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('requirePermission: 200 mit Wildcard "*"', async () => {
    const app = buildAppWithMiddleware('users.manage');
    const token = signAccessToken({
      userId: 'usr_root',
      tenantId: null,
      permissions: ['*'],
      preset: 'super_admin',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('requirePermission: 200 mit Resource-Wildcard "users.*"', async () => {
    const app = buildAppWithMiddleware('users.manage');
    const token = signAccessToken({
      userId: 'usr_admin',
      tenantId: 'tnt_y',
      permissions: ['users.*'],
      preset: 'admin',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
