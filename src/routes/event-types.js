import express from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { eventTypeActiveSchema, eventTypeCreateSchema, eventTypeUpdateSchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

function toEventTypePayload(eventType) {
  return {
    id: eventType.id,
    title: eventType.title,
    slug: eventType.slug,
    description: eventType.description ?? "",
    durationMinutes: eventType.durationMinutes,
    isActive: eventType.isActive,
    hostHandle: eventType.user?.handle,
  };
}

function duplicateUrlError(res) {
  return res.status(400).json({
    code: "BAD_REQUEST",
    message: "An event type with this URL already exists.",
  });
}

router.get("/", async (req, res, next) => {
  try {
    const host = req.user;

    const eventTypes = await prisma.eventType.findMany({
      where: { userId: host.id },
      include: { user: { select: { handle: true } } },
      orderBy: [{ createdAt: "asc" }],
    });

    return res.json(eventTypes.map(toEventTypePayload));
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedBody = eventTypeCreateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const data = parsedBody.data;
    try {
      const created = await prisma.eventType.create({
        data: {
          userId: host.id,
          title: data.title,
          slug: data.slug,
          description: data.description,
          durationMinutes: data.durationMinutes,
          isActive: true,
        },
      });

      return res.status(201).json(toEventTypePayload(created));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return duplicateUrlError(res);
      }

      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedBody = eventTypeUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const existing = await prisma.eventType.findFirst({
      where: { id: req.params.id, userId: host.id },
    });
    if (!existing) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    try {
      const updated = await prisma.eventType.update({
        where: { id: existing.id },
        data: parsedBody.data,
      });

      return res.json(toEventTypePayload(updated));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return duplicateUrlError(res);
      }

      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/active", async (req, res, next) => {
  try {
    const host = req.user;

    const parsedBody = eventTypeActiveSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const existing = await prisma.eventType.findFirst({
      where: { id: req.params.id, userId: host.id },
    });
    if (!existing) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const updated = await prisma.eventType.update({
      where: { id: existing.id },
      data: { isActive: parsedBody.data.isActive },
    });

    return res.json(toEventTypePayload(updated));
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const host = req.user;

    const existing = await prisma.eventType.findFirst({
      where: { id: req.params.id, userId: host.id },
    });
    if (!existing) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    await prisma.eventType.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
