import { randomUUID } from "node:crypto";
import request from "supertest";
import { DateTime } from "luxon";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDatabase = hasDatabase ? describe : describe.skip;

describeIfDatabase("admin api integration", () => {
  const prisma = new PrismaClient();
  const app = createApp();

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    const host = await prisma.user.upsert({
      where: { email: config.defaultHostEmail },
      update: { name: "Default Host", timezone: "UTC" },
      create: {
        name: "Default Host",
        email: config.defaultHostEmail,
        timezone: "UTC",
      },
    });

    await prisma.booking.deleteMany({ where: { hostUserId: host.id } });
    await prisma.availabilityRule.deleteMany({ where: { userId: host.id } });
    await prisma.eventType.deleteMany({ where: { userId: host.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function getHost() {
    return prisma.user.findUnique({
      where: { email: config.defaultHostEmail },
    });
  }

  it("supports event type CRUD and active toggle", async () => {
    const createRes = await request(app).post("/api/event-types").send({
      title: "Quick chat",
      slug: `quick-chat-${randomUUID().slice(0, 8)}`,
      description: "Initial chat",
      durationMinutes: 30,
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.isActive).toBe(true);

    const listRes = await request(app).get("/api/event-types");
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const eventId = createRes.body.id;
    const patchRes = await request(app).patch(`/api/event-types/${eventId}`).send({
      title: "Updated chat",
      durationMinutes: 45,
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe("Updated chat");
    expect(patchRes.body.durationMinutes).toBe(45);

    const toggleRes = await request(app).patch(`/api/event-types/${eventId}/active`).send({
      isActive: false,
    });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isActive).toBe(false);

    const deleteRes = await request(app).delete(`/api/event-types/${eventId}`);
    expect(deleteRes.status).toBe(204);

    const finalList = await request(app).get("/api/event-types");
    expect(finalList.status).toBe(200);
    expect(finalList.body).toHaveLength(0);
  });

  it("supports availability read and replace update", async () => {
    const putRes = await request(app).put("/api/availability").send({
      timezone: "Asia/Kolkata",
      rules: [
        { dayOfWeek: 1, startMinute: 540, endMinute: 1020 },
        { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
        { dayOfWeek: 5, startMinute: 600, endMinute: 900 },
      ],
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.timezone).toBe("Asia/Kolkata");
    expect(putRes.body.rules).toHaveLength(3);

    const getRes = await request(app).get("/api/availability");
    expect(getRes.status).toBe(200);
    expect(getRes.body.timezone).toBe("Asia/Kolkata");
    expect(getRes.body.rules).toEqual([
      { dayOfWeek: 1, startMinute: 540, endMinute: 1020 },
      { dayOfWeek: 2, startMinute: 540, endMinute: 1020 },
      { dayOfWeek: 5, startMinute: 600, endMinute: 900 },
    ]);
  });

  it("filters bookings by scope", async () => {
    const host = await getHost();
    const eventType = await prisma.eventType.create({
      data: {
        userId: host.id,
        title: "Scope Event",
        description: "",
        durationMinutes: 30,
        slug: `scope-${randomUUID().slice(0, 8)}`,
        isActive: true,
      },
    });

    const now = DateTime.utc();
    await prisma.booking.create({
      data: {
        eventTypeId: eventType.id,
        hostUserId: host.id,
        bookerName: "Upcoming User",
        bookerEmail: "upcoming@example.com",
        status: "confirmed",
        startAt: now.plus({ days: 1 }).toJSDate(),
        endAt: now.plus({ days: 1, minutes: 30 }).toJSDate(),
      },
    });

    await prisma.booking.create({
      data: {
        eventTypeId: eventType.id,
        hostUserId: host.id,
        bookerName: "Past User",
        bookerEmail: "past@example.com",
        status: "confirmed",
        startAt: now.minus({ days: 1, minutes: 30 }).toJSDate(),
        endAt: now.minus({ days: 1 }).toJSDate(),
      },
    });

    await prisma.booking.create({
      data: {
        eventTypeId: eventType.id,
        hostUserId: host.id,
        bookerName: "Cancelled User",
        bookerEmail: "cancelled@example.com",
        status: "cancelled",
        cancelledAt: now.toJSDate(),
        startAt: now.plus({ days: 2 }).toJSDate(),
        endAt: now.plus({ days: 2, minutes: 30 }).toJSDate(),
      },
    });

    const upcoming = await request(app).get("/api/bookings").query({ scope: "upcoming" });
    expect(upcoming.status).toBe(200);
    expect(upcoming.body).toHaveLength(1);
    expect(upcoming.body[0].bookerEmail).toBe("upcoming@example.com");

    const past = await request(app).get("/api/bookings").query({ scope: "past" });
    expect(past.status).toBe(200);
    expect(past.body).toHaveLength(1);
    expect(past.body[0].bookerEmail).toBe("past@example.com");

    const cancelled = await request(app).get("/api/bookings").query({ scope: "cancelled" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toHaveLength(1);
    expect(cancelled.body[0].bookerEmail).toBe("cancelled@example.com");

    const all = await request(app).get("/api/bookings").query({ scope: "all" });
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);
  });
});

if (!hasDatabase) {
  describe("admin api integration", () => {
    it("is skipped when DATABASE_URL is not provided", () => {
      expect(true).toBe(true);
    });
  });
}
