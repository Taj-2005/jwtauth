import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/tokens";

export interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Malformed Authorization header" });

  try {
    const payload = verifyAccessToken(token) as any;
    // attach user info to request
    req.user = { userId: payload.userId, username: payload.username };
    // optionally fetch user object from DB: const user = await User.findById(payload.userId);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired access token" });
  }
};
