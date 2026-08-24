import { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function sanitizeUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    throw new Error("Invalid URL provided");
  }
}