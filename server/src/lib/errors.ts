/** Error shape returned by every failing endpoint. */
export type ApiErrorBody = {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
};

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, 'bad_request', details);

export const unauthorized = (message = 'You must be signed in.') =>
  new HttpError(401, message, 'unauthorized');

export const forbidden = (message = 'You do not have permission to do that.') =>
  new HttpError(403, message, 'forbidden');

export const notFound = (message = 'Not found.') => new HttpError(404, message, 'not_found');

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, message, 'conflict', details);