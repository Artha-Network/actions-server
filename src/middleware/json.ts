import type { Request, Response, NextFunction } from "express";

export function jsonHandler(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Type", "application/json");
  next();
}

