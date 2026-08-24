import mongoose from "mongoose";
import { config } from "./config";

export async function connectDb(): Promise<void> {
  mongoose.connection.on("connected", () => console.log("✅ MongoDB connected"));
  mongoose.connection.on("error", (err) => console.error("MongoDB connection error:", err));
  mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  await mongoose.connect(config.mongoUri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}