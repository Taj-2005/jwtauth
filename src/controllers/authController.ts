import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();
import {User} from "../models/User";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens";

const SALT_ROUNDS: number = parseInt(process.env.BCRYPT_SALT_ROUNDS!)

export async function signup(req: Request, res: Response) {
  try {
    const { username, name, email, password, location, bio } = req.body;
    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // check existing user
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(409).json({ error: "User already exists" });

    // hash password
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const user = new User({
      username,
      name,
      email,
      password: hashed,
      location,
      bio,
    });

    await user.save();

    // optionally don't send tokens here — you can auto-login or require login
    return res.status(201).json({ message: "User created" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }

}

export async function signin(req: Request, res: Response) {
    try {
        const { emailOrUsername, password } = req.body;

        if (!emailOrUsername || !password) {
            return res.status(400).json({ error: "Missing credentials" });
        }

        // Find user by email OR username
        const user = await User.findOne({
            $or: [{ email: emailOrUsername }, { username: emailOrUsername }]
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Create tokens
        const payload = { userId: user._id, username: user.username };
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // Save refresh token on user (for rotation/validation)
        user.refreshToken = refreshToken;
        await user.save();

        // Send refresh token as HttpOnly cookie
        res.cookie("jid", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });

        // Send access token in response
        return res.json({
            accessToken,
            user: { id: user._id, email: user.email, username: user.username },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error" });
    }

}

export async function refreshTokenHandler(req: Request, res: Response) {
  try {
    // refresh token can come from cookie or body
    const token = req.body?.refreshToken || req.headers["x-refresh-token"];
    if (!token) return res.status(401).json({ error: "No refresh token provided" });

    // verify refresh token signature
    let payload: any;
    try {
      payload = verifyRefreshToken(token) as any;
      console.log("Refresh token payload:", payload);
    } catch (e) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // find user and check stored token matches (simple rotation check)
    console.log("Payload User ID:", payload.userId);
    const user = await User.findById(payload.userId);
    console.log("Found User:", user ? user.username : "No user found");
    if (!user || !user.refreshToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    if (user.refreshToken !== token) {
      // token mismatch - possible reuse -> force logout all sessions
      user.refreshToken = undefined;
      await user.save();
      return res.status(401).json({ error: "Refresh token mismatch" });
    }

    // issue new access token (and optionally a new refresh token)
    const newAccessToken = signAccessToken({ userId: user._id, username: user.username });
    // Optionally rotate refresh token:
    const newRefreshToken = signRefreshToken({ userId: user._id, username: user.username });
    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie("jid", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }

}

export async function signout(req: Request, res: Response) {
  try {
    // Remove refresh token server-side
    const token = req.cookies?.jid || req.body?.refreshToken || req.headers["x-refresh-token"];
    if (!token) {
      // clear cookie anyway
      res.clearCookie("jid", { path: "/" });
      return res.json({ ok: true });
    }

    // find user that had this token and clear it (logout)
    const user = await User.findOne({ refreshToken: token });
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }

    res.clearCookie("jid", { path: "/" });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}