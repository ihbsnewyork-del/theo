import { Schema, model } from "mongoose";

export interface IAppSettings {
  key: string; // singleton key, always "global"
  platformCommission: number; // percentage, e.g. 2.5
  icalSyncInterval: number; // minutes
  supportEmail: string;
}

const settingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, default: "global", unique: true },
    platformCommission: { type: Number, default: 5 },
    icalSyncInterval: { type: Number, default: 20 },
    supportEmail: { type: String, default: "" },
  },
  { timestamps: true },
);

export const AppSettings = model<IAppSettings>("AppSettings", settingsSchema);
