/* eslint-disable @typescript-eslint/no-explicit-any */
import { CleaningSchedule } from "./schedule.model";
import { Accommodation } from "../accommodation/accommodation.model";
import { User } from "../user/user.model";
import { AssignmentService } from "../assignment/assignment.service";
import { NotificationService } from "../notification/notification.service";
import { PaymentService } from "../payment/payment.service";
import AppError from "../../error/appError";

// Derive the cleaner's response to a schedule (what the host wants to see):
//   pending  → sent, cleaner hasn't responded yet
//   refused  → cleaner refused
//   accepted → cleaner accepted (and any state after acceptance)
const cleanerResponseOf = (
  status: string,
): "pending" | "accepted" | "refused" => {
  if (status === "scheduled") return "pending";
  if (status === "refused") return "refused";
  return "accepted";
};

// Start/end of the calendar day for a given date (used for same-day checks)
const dayRange = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

// Is there already an active schedule for this accommodation on this day?
// Refused / cancelled schedules don't count — the host may re-schedule those.
const findSameDaySchedule = async (
  accommodationId: string,
  date: Date,
  excludeId?: string,
) => {
  const { start, end } = dayRange(date);
  const filter: any = {
    accommodation: accommodationId,
    date: { $gte: start, $lte: end },
    status: { $nin: ["refused", "cancelled"] },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return CleaningSchedule.findOne(filter);
};

// ─── Host: create a schedule (Proceed to Schedule) ────────────────────────────
const createSchedule = async (
  hostId: string,
  accommodationId: string,
  payload: {
    date: string;
    checkInTime: string;
    checkOutTime: string;
    notes?: string;
    bookingId?: string;
  },
) => {
  const accommodation = await Accommodation.findOne({
    _id: accommodationId,
    host: hostId,
    isDeleted: false,
  });
  if (!accommodation) throw new AppError(404, "Accommodation not found");

  // BACKEND RESTRICTION: cannot schedule without an accepted primary cleaner
  const primary = await AssignmentService.getAcceptedPrimary(accommodationId);
  if (!primary) {
    throw new AppError(
      400,
      "You must assign a cleaner (who has accepted) before scheduling.",
    );
  }

  // Block a duplicate schedule for the same accommodation on the same day
  const existing = await findSameDaySchedule(
    accommodationId,
    new Date(payload.date),
  );
  if (existing) {
    throw new AppError(
      409,
      "You already created a schedule on this date. Please edit the schedule if you want.",
    );
  }

  const schedule = await CleaningSchedule.create({
    accommodation: accommodationId,
    host: hostId,
    cleaner: primary.cleaner,
    assignment: primary._id,
    booking: payload.bookingId,
    date: new Date(payload.date),
    checkInTime: payload.checkInTime,
    checkOutTime: payload.checkOutTime,
    notes: payload.notes,
    status: "scheduled",
  });

  accommodation.status = "scheduled";
  await accommodation.save();

  await NotificationService.createNotification({
    user: String(primary.cleaner),
    title: "New cleaning scheduled",
    message: `${accommodation.name} is scheduled for ${new Date(payload.date).toDateString()} (${payload.checkInTime}–${payload.checkOutTime}).`,
    type: "schedule_created",
    data: { scheduleId: String(schedule._id), accommodationId },
  });

  return schedule;
};

// ─── Host: edit a schedule (only before the cleaner accepts) ──────────────────
const updateSchedule = async (
  hostId: string,
  scheduleId: string,
  payload: {
    date?: string;
    checkInTime?: string;
    checkOutTime?: string;
    notes?: string;
  },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");

  // Once the cleaner has accepted (or the task moved on), the host can't edit.
  if (schedule.status !== "scheduled") {
    throw new AppError(
      400,
      schedule.status === "refused"
        ? "This schedule was refused. Please create a new one."
        : "The cleaner has already accepted this schedule, so it can no longer be edited.",
    );
  }

  // If the date changes to a *different* day, make sure it doesn't clash with
  // another schedule. Keeping the same day (e.g. editing only the time/notes)
  // must not trip the duplicate guard against itself.
  if (payload.date) {
    const newDate = new Date(payload.date);
    const isSameDay =
      dayRange(schedule.date).start.getTime() ===
      dayRange(newDate).start.getTime();

    if (!isSameDay) {
      const clash = await findSameDaySchedule(
        String(schedule.accommodation?._id || schedule.accommodation),
        newDate,
        String(schedule._id),
      );
      if (clash) {
        throw new AppError(
          409,
          "You already created a schedule on this date. Please edit the schedule if you want.",
        );
      }
    }
    schedule.date = newDate;
  }

  if (payload.checkInTime !== undefined) schedule.checkInTime = payload.checkInTime;
  if (payload.checkOutTime !== undefined)
    schedule.checkOutTime = payload.checkOutTime;
  if (payload.notes !== undefined) schedule.notes = payload.notes;

  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.cleaner),
    title: "Cleaning schedule updated",
    message: `The host updated the cleaning for ${accName} — ${schedule.date.toDateString()} (${schedule.checkInTime}–${schedule.checkOutTime}).`,
    type: "schedule_created",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Host: delete a schedule (only before the cleaner accepts) ────────────────
const deleteSchedule = async (hostId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");

  // Block deletion once money/work is involved.
  if (schedule.paymentStatus !== "unpaid") {
    throw new AppError(
      400,
      "This schedule has a payment attached and can no longer be deleted.",
    );
  }
  if (!["scheduled", "refused", "cancelled"].includes(schedule.status)) {
    throw new AppError(
      400,
      "The cleaner has already accepted this schedule, so it can no longer be deleted.",
    );
  }

  const accommodationId = schedule.accommodation?._id || schedule.accommodation;
  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  const wasScheduled = schedule.status === "scheduled";

  await schedule.deleteOne();

  // free the accommodation again
  await Accommodation.findByIdAndUpdate(accommodationId, {
    status: "not_scheduled",
  });

  // only notify the cleaner if they had a pending request waiting
  if (wasScheduled) {
    await NotificationService.createNotification({
      user: String(schedule.cleaner),
      title: "Cleaning schedule cancelled",
      message: `The host cancelled the cleaning for ${accName}.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  }

  return { message: "Schedule deleted successfully" };
};

// ─── Cleaner: accept / refuse a schedule ──────────────────────────────────────
const respondToSchedule = async (
  cleanerId: string,
  scheduleId: string,
  action: "accept" | "refuse",
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (schedule.status !== "scheduled") {
    throw new AppError(400, `Schedule already ${schedule.status}`);
  }

  const accName = (schedule.accommodation as any)?.name || "an accommodation";

  if (action === "accept") {
    schedule.status = "accepted";
    await schedule.save();

    await NotificationService.createNotification({
      user: String(schedule.host),
      title: "Cleaning accepted",
      message: `The cleaner accepted the cleaning for ${accName}. You can now proceed to payment.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  } else {
    schedule.status = "refused";
    await schedule.save();

    // free the accommodation again
    await Accommodation.findByIdAndUpdate(schedule.accommodation, {
      status: "not_scheduled",
    });

    await NotificationService.createNotification({
      user: String(schedule.host),
      title: "Cleaning refused",
      message: `The cleaner refused the cleaning for ${accName}.`,
      type: "schedule_created",
      data: { scheduleId: String(schedule._id) },
    });
  }

  return schedule;
};

// ─── Host: my schedules ───────────────────────────────────────────────────────
const getHostSchedules = async (
  hostId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { host: hostId };
  if (query.status) filter.status = query.status;
  if (query.accommodationId) filter.accommodation = query.accommodationId;

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city photos")
      .populate("cleaner", "firstName lastName name profileImage phone")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  const rows = data.map((s) => ({
    ...s.toObject(),
    cleanerResponse: cleanerResponseOf(s.status),
  }));

  return {
    data: rows,
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

// ─── Cleaner: my schedules ────────────────────────────────────────────────────
const getCleanerSchedules = async (
  cleanerId: string,
  query: Record<string, unknown>,
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter: any = { cleaner: cleanerId };
  if (query.status) filter.status = query.status;

  const [data, total] = await Promise.all([
    CleaningSchedule.find(filter)
      .populate("accommodation", "name address city photos accommodationType surface floor numberOfRooms keys accessCode instructions")
      .populate("host", "firstName lastName name profileImage phone")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit),
    CleaningSchedule.countDocuments(filter),
  ]);

  return { data, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

// ─── Single schedule (host or its cleaner) ────────────────────────────────────
const getScheduleById = async (userId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findById(scheduleId)
    .populate("accommodation")
    .populate("host", "firstName lastName name profileImage phone")
    .populate("cleaner", "firstName lastName name profileImage phone");
  if (!schedule) throw new AppError(404, "Schedule not found");

  const host = schedule.host as any;
  const cleaner = schedule.cleaner as any;
  const isParty =
    String(host?._id || host) === userId ||
    String(cleaner?._id || cleaner) === userId;
  if (!isParty) throw new AppError(403, "You are not part of this schedule");

  return {
    ...schedule.toObject(),
    cleanerResponse: cleanerResponseOf(schedule.status),
  };
};

// ─── Cleaner: submit proof of completion ──────────────────────────────────────
const submitProof = async (
  cleanerId: string,
  scheduleId: string,
  payload: { proofNotes?: string; proofPhotos: string[] },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (["completed", "cancelled", "refused"].includes(schedule.status)) {
    throw new AppError(400, `Cannot submit proof on a ${schedule.status} task`);
  }

  schedule.proofPhotos = payload.proofPhotos;
  schedule.proofNotes = payload.proofNotes;
  schedule.proofSubmittedAt = new Date();
  schedule.status = "proof_submitted";
  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.host),
    title: "Proof submitted",
    message: `The cleaner submitted proof of completion for ${accName}.`,
    type: "proof_submitted",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Cleaner: report a dispute ────────────────────────────────────────────────
const reportDispute = async (
  cleanerId: string,
  scheduleId: string,
  payload: { reason?: string; notes?: string; photos: string[] },
) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    cleaner: cleanerId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (["completed", "cancelled", "refused"].includes(schedule.status)) {
    throw new AppError(400, `Cannot dispute a ${schedule.status} task`);
  }

  schedule.dispute = {
    reason: payload.reason,
    notes: payload.notes,
    photos: payload.photos,
    raisedAt: new Date(),
  };
  schedule.status = "disputed";
  await schedule.save();

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.host),
    title: "Dispute reported",
    message: `The cleaner reported a dispute for ${accName}.`,
    type: "dispute",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

// ─── Host: complete / accept the task ─────────────────────────────────────────
const completeTask = async (hostId: string, scheduleId: string) => {
  const schedule = await CleaningSchedule.findOne({
    _id: scheduleId,
    host: hostId,
  }).populate("accommodation", "name");
  if (!schedule) throw new AppError(404, "Schedule not found");
  if (schedule.status === "completed") {
    throw new AppError(400, "Task already completed");
  }

  // Strict escrow gate: the host must have paid before approving the work.
  if (schedule.paymentStatus !== "paid_held") {
    throw new AppError(
      400,
      "Payment must be completed before approving this task.",
    );
  }

  schedule.status = "completed";
  schedule.completedAt = new Date();
  await schedule.save();

  // bump the cleaner's completed counter
  await User.findByIdAndUpdate(schedule.cleaner, {
    $inc: { cleaningsCompleted: 1 },
  });

  // Release the held funds to the cleaner (95%, platform keeps the fee).
  try {
    await PaymentService.releaseForSchedule(String(schedule._id));
  } catch (err) {
    // Completion stays committed; an admin can retry the payout if this fails.
    console.error("⚠️ Payout release failed:", (err as Error).message);
  }

  const accName = (schedule.accommodation as any)?.name || "an accommodation";
  await NotificationService.createNotification({
    user: String(schedule.cleaner),
    title: "Task completed",
    message: `The host marked the cleaning for ${accName} as completed.`,
    type: "task_completed",
    data: { scheduleId: String(schedule._id) },
  });

  return schedule;
};

export const ScheduleService = {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  respondToSchedule,
  getHostSchedules,
  getCleanerSchedules,
  getScheduleById,
  submitProof,
  reportDispute,
  completeTask,
};
