import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { message: 'Endpoint not found.', code: 'not_found' },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        message: error.message,
        code: error.code,
        ...(error.details !== undefined && { details: error.details }),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Please check the highlighted fields.',
        code: 'validation_error',
        details: error.issues.map((i) => ({
          field: i.path.join('.') || '(root)',
          message: i.message,
        })),
      },
    });
    return;
  }

  // Postgres unique-violation surfaced without an explicit guard.
  const pgCode = (error as { code?: string })?.code;
  if (pgCode === '23505' || pgCode === '23514') {
    res.status(409).json({
      error: {
        message:
          pgCode === '23505'
            ? 'That record already exists.'
            : 'That value is not allowed.',
        code: 'conflict',
      },
    });
    return;
  }
  if (pgCode === '23503') {
    res.status(400).json({
      error: { message: 'A referenced record does not exist.', code: 'bad_request' },
    });
    return;
  }

  logger.error({ err: error, path: req.originalUrl, method: req.method }, 'Unhandled error');

  res.status(500).json({
    error: { message: 'Something went wrong on our side.', code: 'internal_error' },
  });
}

/** Wrap async handlers so rejected promises reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}