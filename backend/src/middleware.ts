import { Request, Response, NextFunction } from "express";
import morgan from "morgan";

export const requestLogger = morgan(
  process.env.NODE_ENV === "production" ? "combined" : "dev"
);

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  if (!(err instanceof AppError)) {
    console.error(`[Unhandled Error] ${req.method} ${req.path}:`, err);
  }
  res.status(statusCode).json({ error: err.message || "Internal server error" });
}