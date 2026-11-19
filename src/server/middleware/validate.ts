import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "ולידציה נכשלה",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
        });
        return;
      }
      res.status(400).json({ error: "בקשה לא תקינה" });
    }
  };
}
