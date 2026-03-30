import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../db.js";
import { clearSession, createSession, setSessionCookie, clearSessionCookie } from "../middleware/auth.js";
import { loginSchema, signupSchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

function toUserPayload(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    handle: user.handle,
    timezone: user.timezone,
  };
}

const DEFAULT_RULES = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

async function generateUniqueHandle(base) {
  const root = slugify(base) || "user";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const candidate = `${root}-${suffix}`;
    const existing = await prisma.user.findUnique({ where: { handle: candidate } });
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Unable to generate unique handle");
}

router.post("/login", async (req, res, next) => {
  try {
    const parsedBody = loginSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const { email, password } = parsedBody.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ code: "INVALID_CREDENTIALS" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ code: "INVALID_CREDENTIALS" });
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    return res.json(toUserPayload(user));
  } catch (error) {
    return next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  try {
    const parsedBody = signupSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const { name, email, password, timezone } = parsedBody.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({
        code: "EMAIL_IN_USE",
        message: "Email is already in use",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userTimezone = timezone ?? "UTC";
    const handle = await generateUniqueHandle(name);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          timezone: userTimezone,
          passwordHash,
          handle,
        },
      });

      await tx.availabilitySchedule.create({
        data: {
          userId: createdUser.id,
          name: "Working hours",
          timezone: userTimezone,
          isDefault: true,
          rules: {
            createMany: {
              data: DEFAULT_RULES.map((rule) => ({
                userId: createdUser.id,
                dayOfWeek: rule.dayOfWeek,
                startMinute: rule.startMinute,
                endMinute: rule.endMinute,
                timezone: userTimezone,
              })),
            },
          },
        },
      });

      return createdUser;
    });

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    return res.status(201).json(toUserPayload(user));
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(400).json({
        code: "EMAIL_IN_USE",
        message: "Email is already in use",
      });
    }
    return next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.headers.cookie?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1] ?? "";
    await clearSession(token);
    clearSessionCookie(res);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ code: "UNAUTHORIZED" });
  }

  return res.json(toUserPayload(req.user));
});

export default router;
