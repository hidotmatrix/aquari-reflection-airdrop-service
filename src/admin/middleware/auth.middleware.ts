import { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════
// Auth Middleware
// ═══════════════════════════════════════════════════════════

// Extend Express Session
declare module 'express-session' {
  interface SessionData {
    isAuthenticated?: boolean;
    username?: string;
    returnTo?: string;
  }
}

/**
 * Require authentication middleware
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session?.isAuthenticated) {
    return next();
  }

  // Save intended URL for redirect after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/admin/login');
}

/**
 * Add user info to response locals
 */
export function addUserToLocals(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.locals.user = req.session?.isAuthenticated
    ? { username: req.session.username }
    : null;
  res.locals.isAuthenticated = req.session?.isAuthenticated ?? false;
  next();
}
