import crypto from "crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";

function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) {
    return result;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    const value = rest.join("=");
    result[rawKey] = decodeURIComponent(value ?? "");
  }
  return result;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function setSessionCookie(res, token) {
  const maxAgeSeconds = config.sessionDays * 24 * 60 * 60;
  const secure = config.env === "production" ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds};${secure}`,
  );
}

export function clearSessionCookie(res) {
  const secure = config.env === "production" ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;${secure}`,
  );
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

export async function clearSession(token) {
  if (!token) {
    return;
  }
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.sid;
    if (!token) {
      req.user = null;
      return next();
    }

    const tokenHash = hashToken(token);
    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });

    req.user = session?.user ?? null;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ code: "UNAUTHORIZED" });
  }

  return next();
}
