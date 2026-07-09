/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { UserService } from "./user.service";

// ─── Admin & Dealer: Get all users ────────────────────────────────────────────
const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getAllUsers(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users retrieved successfully",
    data: result,
  });
});

// ─── Push device token (mobile app) ───────────────────────────────────────────
const registerDeviceToken = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await UserService.registerDeviceToken(
    userId,
    req.body.playerId,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

const removeDeviceToken = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const result = await UserService.removeDeviceToken(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.message,
    data: null,
  });
});

export const UserController = {
  getAllUsers,
  registerDeviceToken,
  removeDeviceToken,
};
