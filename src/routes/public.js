import express from "express";
import { DateTime } from "luxon";
import { prisma } from "../db.js";
import { getAvailableSlotsForDate, isSlotInsideAvailability } from "../services/slots.js";
import { isBookingOverlapError } from "../utils/prisma-errors.js";
import { parseIsoInTimezone } from "../utils/time.js";
import { bookingRequestSchema, slotsQuerySchema } from "../validation.js";

const router = express.Router();

function zodIssuesToMessage(error) {
  return error.issues.map((issue) => issue.message).join(", ");
}

async function getEventTypeBySlug(slug) {
  return prisma.eventType.findUnique({
    where: { slug },
    include: { user: true },
  });
}

async function getAvailabilityRules(userId) {
  return prisma.availabilityRule.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
}

router.get("/:slug", async (req, res, next) => {
  try {
    const eventType = await getEventTypeBySlug(req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    return res.json({
      id: eventType.id,
      slug: eventType.slug,
      title: eventType.title,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      host: {
        name: eventType.user.name,
        timezone: eventType.user.timezone,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:slug/slots", async (req, res, next) => {
  try {
    const parsedQuery = slotsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedQuery.error),
      });
    }

    const eventType = await getEventTypeBySlug(req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
    }

    const availabilityRules = await getAvailabilityRules(eventType.userId);
    const displayTimezone = parsedQuery.data.tz ?? eventType.user.timezone;
    const slots = await getAvailableSlotsForDate({
      prisma,
      hostUserId: eventType.userId,
      date: parsedQuery.data.date,
      displayTimezone,
      hostTimezone: eventType.user.timezone,
      durationMinutes: eventType.durationMinutes,
      availabilityRules,
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

router.post("/:slug/bookings", async (req, res, next) => {
  try {
    const parsedBody = bookingRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: zodIssuesToMessage(parsedBody.error),
      });
    }

    const eventType = await getEventTypeBySlug(req.params.slug);
    if (!eventType || !eventType.isActive) {
      return res.status(404).json({ code: "EVENT_TYPE_NOT_FOUND" });
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

    const availabilityRules = await getAvailabilityRules(eventType.userId);
    const insideAvailability = isSlotInsideAvailability({
      startUtc,
      durationMinutes: eventType.durationMinutes,
      hostTimezone: eventType.user.timezone,
      availabilityRules,
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

export default router;
