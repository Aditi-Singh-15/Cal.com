import express from "express";
import availabilityRouter from "./routes/availability.js";
import bookingsRouter from "./routes/bookings.js";
import eventTypesRouter from "./routes/event-types.js";
import publicRouter from "./routes/public.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/event-types", eventTypesRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/bookings", bookingsRouter);

  app.use((error, _req, res, _next) => {
    // Keep logs simple for assignment evaluation.
    console.error(error);
    res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}
