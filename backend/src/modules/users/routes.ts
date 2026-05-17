/**
 * M14 — Users + Auth Routes
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §5.2
 *
 * Registrierung in app.ts:
 *   await app.register(authPublicRoutes, { prefix: '/api/v1/auth' });
 *   await app.register(authProtectedRoutes, { prefix: '/api/v1/auth' });
 *   await app.register(usersRoutes, { prefix: '/api/v1/users' });
 *
 * - authPublicRoutes:    /login, /refresh, /logout — kein JWT erforderlich
 *   (für /login + /refresh ohnehin; /logout darf auch ohne JWT aufgerufen werden,
 *    nutzt Cookie zur Token-Invalidierung).
 * - authProtectedRoutes: /me, /change-password — JWT erforderlich
 * - usersRoutes: alle /users/* — JWT erforderlich, permission-spezifisch
 */

import type { FastifyInstance } from 'fastify';
import { jwtAuthMiddleware, requirePermission } from '../../core/auth/jwt.middleware';
import { changePasswordHandler } from './handlers/change-password.handler';
import { createUserHandler } from './handlers/create-user.handler';
import { deleteUserHandler } from './handlers/delete-user.handler';
import { getUserHandler } from './handlers/get-user.handler';
import { listUsersHandler } from './handlers/list-users.handler';
import { loginHandler } from './handlers/login.handler';
import { logoutHandler } from './handlers/logout.handler';
import { meHandler } from './handlers/me.handler';
import { refreshHandler } from './handlers/refresh.handler';
import { resetUserPasswordHandler } from './handlers/reset-user-password.handler';
import { updateUserHandler } from './handlers/update-user.handler';

export async function authPublicRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', loginHandler);
  app.post('/refresh', refreshHandler);
  // Logout darf auch ohne gültigen JWT funktionieren (Cookie reicht).
  app.post('/logout', logoutHandler);
}

export async function authProtectedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', jwtAuthMiddleware);
  app.get('/me', meHandler);
  app.post('/change-password', changePasswordHandler);
}

type IdParams = { Params: { id: string } };

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', jwtAuthMiddleware);
  app.get('/', { preHandler: requirePermission('users.read') }, listUsersHandler);
  app.post('/', { preHandler: requirePermission('users.manage') }, createUserHandler);
  app.get<IdParams>('/:id', { preHandler: requirePermission('users.read') }, getUserHandler);
  app.patch<IdParams>('/:id', { preHandler: requirePermission('users.manage') }, updateUserHandler);
  app.delete<IdParams>('/:id', { preHandler: requirePermission('users.manage') }, deleteUserHandler);
  app.post<IdParams>(
    '/:id/reset-password',
    { preHandler: requirePermission('users.manage') },
    resetUserPasswordHandler,
  );
}
