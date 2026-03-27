import express from "express";
import { prisma } from "../db.js";
import { getDefaultHost } from "../services/default-host.js";
import { availabilityUpdateSchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

function sortRules(rules) {
  return [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

async function getHostOr404(res) {
  const host = await getDefaultHost(prisma);
  if (!host) {
    res.status(404).json({ code: "DEFAULT_HOST_NOT_FOUND" });
    return null;
  }

  return host;
}

router.get("/", async (_req, res, next) => {
  try {
    const host = await getHostOr404(res);
    if (!host) {
      return;
    }

    const rules = await prisma.availabilityRule.findMany({
      where: { userId: host.id },
      select: {
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });

    return res.json({
      timezone: host.timezone,
      rules,
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const host = await getHostOr404(res);
    if (!host) {
      return;
    }

    const parsedBody = availabilityUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const { timezone, rules } = parsedBody.data;
    const sortedRules = sortRules(rules);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: host.id },
        data: { timezone },
      });

      await tx.availabilityRule.deleteMany({
        where: { userId: host.id },
      });

      if (sortedRules.length > 0) {
        await tx.availabilityRule.createMany({
          data: sortedRules.map((rule) => ({
            userId: host.id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            timezone,
          })),
        });
      }
    });

    return res.json({
      timezone,
      rules: sortedRules,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
