import express from "express";
import { prisma } from "../db.js";
import {
  availabilityQuerySchema,
  availabilityScheduleCreateSchema,
  availabilityScheduleUpdateSchema,
} from "../validation.js";

const router = express.Router();

const DEFAULT_RULES = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

function formatMinute(minute) {
  const hour24 = Math.floor(minute / 60);
  const mins = minute % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${mins.toString().padStart(2, "0")} ${period}`;
}

function summarizeSchedule(rules) {
  if (rules.length === 0) {
    return "No active days";
  }

  const sorted = [...rules].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sameTimeAcrossRules = sorted.every(
    (rule) => rule.startMinute === first.startMinute && rule.endMinute === first.endMinute,
  );

  if (sameTimeAcrossRules) {
    return `${DAY_SHORT[first.dayOfWeek]} - ${DAY_SHORT[last.dayOfWeek]}, ${formatMinute(first.startMinute)} - ${formatMinute(first.endMinute)}`;
  }

  return `${sorted.length} time slots configured`;
}

function toScheduleDetail(schedule) {
  const rules = (schedule.rules ?? []).map((rule) => ({
    dayOfWeek: rule.dayOfWeek,
    startMinute: rule.startMinute,
    endMinute: rule.endMinute,
  }));

  return {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    isDefault: schedule.isDefault,
    summary: summarizeSchedule(rules),
    rules,
  };
}

async function getSchedulesForHost(userId) {
  return prisma.availabilitySchedule.findMany({
    where: { userId },
    include: {
      rules: {
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

async function ensureAtLeastOneSchedule(host) {
  const existing = await prisma.availabilitySchedule.findFirst({
    where: { userId: host.id },
  });
  if (existing) {
    return;
  }

  await prisma.availabilitySchedule.create({
    data: {
      userId: host.id,
      name: "Working hours",
      timezone: host.timezone,
      isDefault: true,
      rules: {
        createMany: {
          data: DEFAULT_RULES.map((rule) => ({
            userId: host.id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            timezone: host.timezone,
          })),
        },
      },
    },
  });
}

router.get("/", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedQuery = availabilityQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedQuery.error),
      });
    }

    await ensureAtLeastOneSchedule(host);
    const schedules = await getSchedulesForHost(host.id);
    const targetScheduleId = parsedQuery.data.scheduleId;

    const selected =
      schedules.find((schedule) => schedule.id === targetScheduleId) ??
      schedules.find((schedule) => schedule.isDefault) ??
      schedules[0];

    return res.json({
      schedules: schedules.map(toScheduleDetail),
      selectedSchedule: selected ? toScheduleDetail(selected) : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/schedules", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedBody = availabilityScheduleCreateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const scheduleCount = await prisma.availabilitySchedule.count({
      where: { userId: host.id },
    });

    const created = await prisma.availabilitySchedule.create({
      data: {
        userId: host.id,
        name: parsedBody.data.name,
        timezone: host.timezone,
        isDefault: scheduleCount === 0,
        rules: {
          createMany: {
            data: DEFAULT_RULES.map((rule) => ({
              userId: host.id,
              dayOfWeek: rule.dayOfWeek,
              startMinute: rule.startMinute,
              endMinute: rule.endMinute,
              timezone: host.timezone,
            })),
          },
        },
      },
      include: {
        rules: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return res.status(201).json(toScheduleDetail(created));
  } catch (error) {
    return next(error);
  }
});

router.put("/schedules/:id", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedBody = availabilityScheduleUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const existing = await prisma.availabilitySchedule.findFirst({
      where: { id: req.params.id, userId: host.id },
    });
    if (!existing) {
      return res.status(404).json({ code: "SCHEDULE_NOT_FOUND" });
    }

    const { name, timezone, isDefault, rules } = parsedBody.data;
    if (!isDefault) {
      const otherDefault = await prisma.availabilitySchedule.findFirst({
        where: {
          userId: host.id,
          isDefault: true,
          id: { not: existing.id },
        },
      });
      if (!otherDefault && existing.isDefault) {
        return res.status(400).json({
          code: "DEFAULT_REQUIRED",
          message: "At least one default schedule is required",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.availabilitySchedule.updateMany({
          where: { userId: host.id, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }

      await tx.availabilitySchedule.update({
        where: { id: existing.id },
        data: {
          name,
          timezone,
          isDefault,
        },
      });

      await tx.availabilityRule.deleteMany({
        where: { scheduleId: existing.id },
      });

      if (rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: rules.map((rule) => ({
            userId: host.id,
            scheduleId: existing.id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            timezone,
          })),
        });
      }
    });

    const updated = await prisma.availabilitySchedule.findUnique({
      where: { id: existing.id },
      include: {
        rules: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
    });

    return res.json(toScheduleDetail(updated));
  } catch (error) {
    return next(error);
  }
});

router.delete("/schedules/:id", async (req, res, next) => {
  try {
    const host = req.user;

    const existing = await prisma.availabilitySchedule.findFirst({
      where: { id: req.params.id, userId: host.id },
    });
    if (!existing) {
      return res.status(404).json({ code: "SCHEDULE_NOT_FOUND" });
    }

    const count = await prisma.availabilitySchedule.count({
      where: { userId: host.id },
    });
    if (count <= 1) {
      return res.status(400).json({
        code: "LAST_SCHEDULE",
        message: "Cannot delete the only schedule",
      });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.isDefault) {
        const fallback = await tx.availabilitySchedule.findFirst({
          where: {
            userId: host.id,
            id: { not: existing.id },
          },
          orderBy: { createdAt: "asc" },
        });
        if (fallback) {
          await tx.availabilitySchedule.update({
            where: { id: fallback.id },
            data: { isDefault: true },
          });
        }
      }

      await tx.availabilitySchedule.delete({
        where: { id: existing.id },
      });
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
