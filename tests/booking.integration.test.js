import { randomUUID } from "node:crypto";
import request from "supertest";
import { DateTime } from "luxon";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDatabase = hasDatabase ? describe : describe.skip;

describeIfDatabase("booking flow integration", () => {
  const prisma = new PrismaClient();
  const app = createApp();

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.booking.deleteMany();
    await prisma.availabilityRule.deleteMany();
    await prisma.eventType.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: "@integration.test",
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function bootstrapHost({
    timezone = "UTC",
    slug = `event-${randomUUID().slice(0, 8)}`,
    durationMinutes = 30,
  } = {}) {
    const host = await prisma.user.create({
      data: {
        name: "Integration Host",
        email: `${randomUUID()}@integration.test`,
        timezone,
      },
    });

    await prisma.availabilityRule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        userId: host.id,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        timezone,
      })),
    });

    const eventType = await prisma.eventType.create({
      data: {
        userId: host.id,
        title: "Integration Event",
        description: "Test event",
        durationMinutes,
        slug,
      },
    });

    return { host, eventType };
  }

  function tomorrowAt(hour, minute = 0, timezone = "UTC") {
    return DateTime.now()
      .setZone(timezone)
      .plus({ days: 1 })
      .startOf("day")
      .plus({ hours: hour, minutes: minute });
  }

  it("creates a booking for an available slot", async () => {
    const { eventType } = await bootstrapHost({ timezone: "UTC" });
    const slot = tomorrowAt(10, 0, "UTC");

    const response = await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "User A",
      email: "user.a@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("confirmed");
  });

  it("allows only one booking when two requests race for the same slot", async () => {
    const { eventType } = await bootstrapHost({ timezone: "UTC" });
    const slot = tomorrowAt(11, 0, "UTC");

    const payloadA = {
      name: "User A",
      email: "parallel.a@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    };
    const payloadB = {
      name: "User B",
      email: "parallel.b@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    };

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/public/${eventType.slug}/bookings`).send(payloadA),
      request(app).post(`/api/public/${eventType.slug}/bookings`).send(payloadB),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("blocks overlapping bookings across two event types owned by the same host", async () => {
    const { host, eventType } = await bootstrapHost({ timezone: "UTC" });
    const secondEvent = await prisma.eventType.create({
      data: {
        userId: host.id,
        title: "Another Event",
        description: "Overlap test",
        durationMinutes: 30,
        slug: `second-${randomUUID().slice(0, 8)}`,
      },
    });

    const firstSlot = tomorrowAt(10, 0, "UTC");
    const overlapStart = tomorrowAt(10, 15, "UTC");

    await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "User A",
      email: "user.a@example.com",
      startAt: firstSlot.toISO(),
      timezone: "UTC",
    });

    const response = await request(app).post(`/api/public/${secondEvent.slug}/bookings`).send({
      name: "User B",
      email: "user.b@example.com",
      startAt: overlapStart.toISO(),
      timezone: "UTC",
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("SLOT_UNAVAILABLE");
  });

  it("allows same slot for different hosts", async () => {
    const { eventType: eventTypeA } = await bootstrapHost({ timezone: "UTC" });
    const { eventType: eventTypeB } = await bootstrapHost({ timezone: "UTC" });
    const slot = tomorrowAt(12, 0, "UTC");

    const first = await request(app).post(`/api/public/${eventTypeA.slug}/bookings`).send({
      name: "Host A Booker",
      email: "a@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });
    const second = await request(app).post(`/api/public/${eventTypeB.slug}/bookings`).send({
      name: "Host B Booker",
      email: "b@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("releases a slot after cancellation", async () => {
    const { eventType } = await bootstrapHost({ timezone: "UTC" });
    const slot = tomorrowAt(13, 0, "UTC");

    const create = await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "Cancel Flow",
      email: "cancel@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });
    expect(create.status).toBe(201);

    const cancel = await request(app).post(`/api/bookings/${create.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("cancelled");

    const rebook = await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "Rebook User",
      email: "rebook@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });

    expect(rebook.status).toBe(201);
  });

  it("does not return already booked slots in public slot listing", async () => {
    const { eventType } = await bootstrapHost({ timezone: "UTC" });
    const slot = tomorrowAt(14, 0, "UTC");

    const create = await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "Booked Slot User",
      email: "booked.slot@example.com",
      startAt: slot.toISO(),
      timezone: "UTC",
    });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/public/${eventType.slug}/slots`).query({
      date: slot.toISODate(),
      tz: "UTC",
    });
    expect(list.status).toBe(200);

    const foundBookedSlot = list.body.slots.some((item) => item.startAt === slot.toISO());
    expect(foundBookedSlot).toBe(false);
  });

  it("converts timezone-based booking input to UTC before persistence", async () => {
    const timezone = "Asia/Kolkata";
    const { eventType } = await bootstrapHost({ timezone });
    const localSlot = tomorrowAt(10, 0, timezone);

    const create = await request(app).post(`/api/public/${eventType.slug}/bookings`).send({
      name: "Timezone User",
      email: "timezone@example.com",
      startAt: localSlot.toFormat("yyyy-LL-dd'T'HH:mm:ss"),
      timezone,
    });
    expect(create.status).toBe(201);

    const booking = await prisma.booking.findUnique({
      where: { id: create.body.id },
    });
    expect(booking).not.toBeNull();
    expect(booking.startAt.getTime()).toBe(localSlot.toUTC().toMillis());
  });
});

if (!hasDatabase) {
  describe("booking flow integration", () => {
    it("is skipped when DATABASE_URL is not provided", () => {
      expect(true).toBe(true);
    });
  });
}
