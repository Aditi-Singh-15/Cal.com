import express from "express";
import { DateTime } from "luxon";
import { prisma } from "../db.js";
import { bookingsQuerySchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

function toBookingPayload(booking) {
  return {
    id: booking.id,
    eventTypeId: booking.eventTypeId,
    eventTitle: booking.eventType?.title ?? "",
    eventSlug: booking.eventType?.slug ?? "",
    bookerName: booking.bookerName,
    bookerEmail: booking.bookerEmail,
    status: booking.status,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const parsedQuery = bookingsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedQuery.error),
      });
    }

    const host = req.user;

    const scope = parsedQuery.data.scope;
    const now = DateTime.utc().toJSDate();
    const where = { hostUserId: host.id };
    const orderBy = [{ startAt: "asc" }];

    if (scope === "upcoming") {
      where.status = "confirmed";
      where.startAt = { gte: now };
    } else if (scope === "past") {
      where.status = "confirmed";
      where.endAt = { lt: now };
      orderBy[0] = { startAt: "desc" };
    } else if (scope === "cancelled") {
      where.status = "cancelled";
      orderBy[0] = { startAt: "desc" };
    } else {
      orderBy[0] = { startAt: "desc" };
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        eventType: {
          select: { title: true, slug: true },
        },
      },
      orderBy,
    });

    return res.json(bookings.map(toBookingPayload));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, hostUserId: req.user.id },
      include: {
        eventType: {
          select: {
            title: true,
            slug: true,
            durationMinutes: true,
            description: true,
          },
        },
        hostUser: {
          select: {
            name: true,
            email: true,
            timezone: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ code: "BOOKING_NOT_FOUND" });
    }

    return res.json({
      ...toBookingPayload(booking),
      eventDescription: booking.eventType?.description ?? "",
      durationMinutes: booking.eventType?.durationMinutes ?? null,
      host: booking.hostUser,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, hostUserId: req.user.id },
      include: {
        eventType: {
          select: { title: true, slug: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ code: "BOOKING_NOT_FOUND" });
    }

    if (existing.status === "cancelled") {
      return res.json(toBookingPayload(existing));
    }

    const updated = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      include: {
        eventType: {
          select: { title: true, slug: true },
        },
      },
    });

    return res.json(toBookingPayload(updated));
  } catch (error) {
    return next(error);
  }
});

export default router;
