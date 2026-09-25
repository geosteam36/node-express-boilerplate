const httpStatus = require('http-status');
const httpMocks = require('node-mocks-http');
const { notesLimiter } = require('../../../src/middlewares/rateLimiter');

/**
 * Drive the middleware synchronously, returning the HTTP status that was set.
 * On the first max requests the middleware calls next(); on the (max+1)th it
 * calls res.status(429).send(…) instead.
 */
const callLimiter = (limiter, ip = '127.0.0.1') =>
  new Promise((resolve) => {
    const req = httpMocks.createRequest({ ip });
    const res = httpMocks.createResponse();
    const next = jest.fn();
    limiter(req, res, next);
    // express-rate-limit v5 stores are synchronous in memory, so the
    // response or next() is invoked before the promise resolves.
    setImmediate(() => {
      if (next.mock.calls.length > 0) {
        resolve(200); // passed through
      } else {
        resolve(res.statusCode);
      }
    });
  });

describe('Rate limiter middlewares', () => {
  describe('notesLimiter', () => {
    test('should allow requests below the limit', async () => {
      const status = await callLimiter(notesLimiter, '10.0.0.1');
      expect(status).toBe(200);
    });

    test('should return 429 after exceeding the request limit', async () => {
      const ip = '10.0.0.2';
      const MAX = 50;

      // Exhaust the window by firing MAX requests
      for (let i = 0; i < MAX; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await callLimiter(notesLimiter, ip);
      }

      // The (MAX+1)th request should be throttled
      const status = await callLimiter(notesLimiter, ip);
      expect(status).toBe(httpStatus.TOO_MANY_REQUESTS);
    });
  });
});
