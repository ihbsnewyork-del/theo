/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import catchAsync from "../../utilities/catchAsync";
import sendResponse from "../../utilities/sendResponse";
import { AdminService } from "./admin.service";

const getDashboard = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getDashboard(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Dashboard retrieved successfully",
    data: result,
  });
});

const getHosts = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getHosts(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Hosts retrieved successfully",
    data: result,
  });
});

const getHostById = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getHostById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Host retrieved successfully",
    data: result,
  });
});

const getCleaners = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getCleaners(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaners retrieved successfully",
    data: result,
  });
});

const getCleanerById = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getCleanerById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Cleaner retrieved successfully",
    data: result,
  });
});

const getSchedules = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getSchedules(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedules retrieved successfully",
    data: result,
  });
});

const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getTransactions(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Transactions retrieved successfully",
    data: result,
  });
});

const setUserBlocked = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.setUserBlocked(
    req.params.id,
    req.body.block === true || req.body.block === "true",
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.blocked ? "User blocked" : "User unblocked",
    data: result,
  });
});

const getAdmins = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAdmins(req.query as any);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admins retrieved successfully",
    data: result,
  });
});

const createAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.createAdmin(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Admin created successfully",
    data: result,
  });
});

const deleteAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.deleteAdmin(req.params.id, req.user.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Admin deleted successfully",
    data: result,
  });
});

export const AdminController = {
  getDashboard,
  getHosts,
  getHostById,
  getCleaners,
  getCleanerById,
  getSchedules,
  getTransactions,
  setUserBlocked,
  getAdmins,
  createAdmin,
  deleteAdmin,
};
