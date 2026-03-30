import express from "express";
import { DateTime } from "luxon";
import { prisma } from "../db.js";
import { getAvailableSlotsForDate, isSlotInsideAvailability } from "../services/slots.js";
import { isBookingOverlapError } from "../utils/prisma-errors.js";
import { parseIsoInTimezone } from "../utils/time.js";
import { bookingRequestSchema, calendarQuerySchema, slotsQuerySchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

async function getEventTypeBySlug(handle, slug) {
  return prisma.eventType.findUnique({
    where: {
      userId_slug: {
        userId: (
          await prisma.user.findUnique({
            where: { handle },
            select: { id: true },
          })
        )?.id ?? "",
        slug,
      },
    },
    include: { user: true },
  });
}

async function getAvailabilityRules(userId) {
  const defaultSchedule = await prisma.availabilitySchedule.findFirst({
    where: { userId, isDefault: true },
    include: {
      rules: {
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
      },
    },
  });

  const schedule =
    defaultSchedule ??
    (await prisma.availabilitySchedule.findFirst({
      where: { userId },
      include: {
        rules: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    }));

  return {
    timezone: schedule?.timezone ?? null,
    rules: schedule?.rules ?? [],
  };
}

router.get("/:handle/:slug", async (req, res, next) => {
  try {
    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }
    const availability = await getAvailabilityRules(eventType.userId);

    return res.json({
      id: eventType.id,
      slug: eventType.slug,
      title: eventType.title,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      host: {
        name: eventType.user.name,
        email: eventType.user.email,
        handle: eventType.user.handle,
        timezone: availability.timezone ?? eventType.user.timezone,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:handle/:slug/slots", async (req, res, next) => {
  try {
    const parsedQuery = slotsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedQuery.error),
      });
    }

    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const availability = await getAvailabilityRules(eventType.userId);
    const displayTimezone = parsedQuery.data.tz ?? eventType.user.timezone;
    const slots = await getAvailableSlotsForDate({
      prisma,
      hostUserId: eventType.userId,
      date: parsedQuery.data.date,
      displayTimezone,
      hostTimezone: availability.timezone ?? eventType.user.timezone,
      durationMinutes: eventType.durationMinutes,
      availabilityRules: availability.rules,
    });

    if (slots === null) {
      return res.status(422).json({
        code: "INVALID_DATE",
        message: "date must be a valid calendar day",
      });
    }

    return res.json({
      date: parsedQuery.data.date,
      timezone: displayTimezone,
      slots: slots.map((slot) => ({
        startAt: slot.startAt.toISO(),
        endAt: slot.endAt.toISO(),
        isAvailable: true,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:handle/:slug/calendar", async (req, res, next) => {
  try {
    const parsedQuery = calendarQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedQuery.error),
      });
    }

    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const availability = await getAvailabilityRules(eventType.userId);
    const displayTimezone = parsedQuery.data.tz ?? eventType.user.timezone;
    const monthStart = DateTime.fromISO(`${parsedQuery.data.month}-01`, {
      zone: displayTimezone,
    }).startOf("day");

    if (!monthStart.isValid) {
      return res.status(422).json({
        code: "INVALID_MONTH",
        message: "month must be a valid calendar month",
      });
    }

    const daysInMonth = monthStart.daysInMonth;
    const dates = [];
    for (let dayOffset = 0; dayOffset < daysInMonth; dayOffset += 1) {
      const date = monthStart.plus({ days: dayOffset }).toISODate();
      const slots = await getAvailableSlotsForDate({
        prisma,
        hostUserId: eventType.userId,
        date,
        displayTimezone,
        hostTimezone: availability.timezone ?? eventType.user.timezone,
        durationMinutes: eventType.durationMinutes,
        availabilityRules: availability.rules,
      });

      if (slots && slots.length > 0) {
        dates.push(date);
      }
    }

    return res.json({
      month: parsedQuery.data.month,
      timezone: displayTimezone,
      dates,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:handle/:slug/bookings", async (req, res, next) => {
  try {
    const parsedBody = bookingRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    if (req.user && req.user.id === eventType.userId) {
      return res.status(403).json({
        code: "HOST_BOOKING_NOT_ALLOWED",
        message: "Hosts cannot book their own event types.",
      });
    }

    const displayTimezone = parsedBody.data.timezone ?? eventType.user.timezone;
    const startUtc = parseIsoInTimezone(parsedBody.data.startAt, displayTimezone);
    if (!startUtc || !startUtc.isValid) {
      return res.status(422).json({
        code: "INVALID_SLOT",
        message: "startAt must be a valid ISO datetime",
      });
    }

    const nowUtc = DateTime.utc();
    if (startUtc <= nowUtc) {
      return res.status(422).json({
        code: "INVALID_SLOT",
        message: "startAt must be in the future",
      });
    }

    const availability = await getAvailabilityRules(eventType.userId);
    const insideAvailability = isSlotInsideAvailability({
      startUtc,
      durationMinutes: eventType.durationMinutes,
      hostTimezone: availability.timezone ?? eventType.user.timezone,
      availabilityRules: availability.rules,
    });

    if (!insideAvailability) {
      return res.status(422).json({
        code: "INVALID_SLOT",
        message: "Slot is outside host availability",
      });
    }

    try {
      const endUtc = startUtc.plus({ minutes: eventType.durationMinutes });
      const booking = await prisma.$transaction((tx) => {
        return tx.booking.create({
          data: {
            eventTypeId: eventType.id,
            hostUserId: eventType.userId,
            bookerName: parsedBody.data.name,
            bookerEmail: parsedBody.data.email,
            startAt: startUtc.toJSDate(),
            endAt: endUtc.toJSDate(),
            status: "confirmed",
          },
        });
      });

      return res.status(201).json({
        id: booking.id,
        eventTypeId: booking.eventTypeId,
        eventTitle: eventType.title,
        eventSlug: eventType.slug,
        durationMinutes: eventType.durationMinutes,
        hostUserId: booking.hostUserId,
        hostName: eventType.user.name,
        hostEmail: eventType.user.email,
        hostTimezone: eventType.user.timezone,
        status: booking.status,
        bookerName: booking.bookerName,
        bookerEmail: booking.bookerEmail,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
      });
    } catch (error) {
      if (isBookingOverlapError(error)) {
        return res.status(409).json({
          code: "SLOT_UNAVAILABLE",
          message: "Selected slot is already booked",
        });
      }

      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get("/:handle/:slug/bookings/:id", async (req, res, next) => {
  try {
    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: req.params.id,
        eventTypeId: eventType.id,
      },
      include: {
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
      id: booking.id,
      eventTypeId: booking.eventTypeId,
      eventTitle: eventType.title,
      eventSlug: eventType.slug,
      durationMinutes: eventType.durationMinutes,
      hostUserId: booking.hostUserId,
      hostName: booking.hostUser.name,
      hostTimezone: booking.hostUser.timezone,
      status: booking.status,
      bookerName: booking.bookerName,
      bookerEmail: booking.bookerEmail,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      host: booking.hostUser,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:handle/:slug/bookings/:id/cancel", async (req, res, next) => {
  try {
    const eventType = await getEventTypeBySlug(req.params.handle, req.params.slug);
    if (!eventType) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: req.params.id,
        eventTypeId: eventType.id,
      },
    });

    if (!booking) {
      return res.status(404).json({ code: "BOOKING_NOT_FOUND" });
    }

    if (booking.status === "cancelled") {
      return res.json({
        id: booking.id,
        status: booking.status,
        cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    return res.json({
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt?.toISOString() ?? null,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
