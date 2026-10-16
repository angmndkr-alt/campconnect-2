import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import type { AppRole } from '../types.js';

export type AuthUser = {
  id: string;
  email: string;
  role: AppRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Attaches req.user when a valid Bearer token is present. Never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    if (payload) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    }
  }

  next();
}

/** Requires a signed-in user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

/** Requires one of the given global roles. */
export function requireRole(...roles: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** True when the caller is a platform super admin. */
export function isSuperAdmin(req: Request): boolean {
  return req.user?.role === 'super_admin';
}