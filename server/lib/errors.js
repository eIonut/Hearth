// Typed errors carry an HTTP status so the error middleware in index.js can
// map them to a response once, instead of every route repeating status codes.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

// 400 — the request was malformed (missing field, bad path, invalid value).
export class ValidationError extends HttpError {
  constructor(message) {
    super(400, message);
  }
}

// 404 — the addressed resource does not exist.
export class NotFoundError extends HttpError {
  constructor(message = 'not found') {
    super(404, message);
  }
}
