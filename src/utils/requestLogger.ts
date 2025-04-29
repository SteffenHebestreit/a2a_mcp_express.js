import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

// Symbol to store the request ID on the request object
const requestIdSymbol = Symbol('requestId');

/**
 * Extends Express Request interface to add request ID
 */
declare global {
  namespace Express {
    interface Request {
      [requestIdSymbol]?: string;
    }
  }
}

/**
 * Generate or reuse a request ID from headers
 * @param req Express request
 * @returns Request ID
 */
function getOrCreateRequestId(req: Request): string {
  // Check for existing request ID in headers (e.g. from a proxy or gateway)
  const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  
  if (existingId && typeof existingId === 'string') {
    return existingId;
  }
  
  // Generate a new UUID for this request
  return uuidv4();
}

/**
 * Get request ID from request object
 * @param req Express request
 * @returns Request ID
 */
export function getRequestId(req: Request): string | undefined {
  return req[requestIdSymbol];
}

/**
 * Middleware to log HTTP requests with request IDs
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate or get request ID
  const requestId = getOrCreateRequestId(req);
  
  // Attach the ID to the request object
  req[requestIdSymbol] = requestId;
  
  // Add the ID to response headers for tracking
  res.setHeader('X-Request-ID', requestId);
  
  // Log the incoming request
  const startTime = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  logger.info(`[${requestId}] ${method} ${url} from ${ip}`);
  logger.debug(`[${requestId}] Headers: ${JSON.stringify(req.headers)}`);
  
  // Use response finish event instead of overriding res.end
  res.on('finish', () => {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const statusCode = res.statusCode;
    
    // Color status code based on range
    let logFn = logger.info;
    if (statusCode >= 500) {
      logFn = logger.error;
    } else if (statusCode >= 400) {
      logFn = logger.warn;
    }
    
    logFn(`[${requestId}] ${method} ${url} completed with ${statusCode} in ${duration}ms`);
  });
  
  next();
}

/**
 * Express middleware to handle errors and log them
 */
export function errorLoggerMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = getRequestId(req) || 'unknown';
  logger.error(`[${requestId}] Error processing request: ${err.message}`);
  logger.debug(`[${requestId}] Error stack: ${err.stack}`);
  
  // Pass to next error handler or send response
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    requestId
  });
}

export default requestLoggerMiddleware;