import mongoose, { Schema, Document, Types } from "mongoose";

export interface IResource extends Document {
  userId: Types.ObjectId;
  url: string;
  title?: string;
  rawContent?: string;
  summary?: string;
  topics: string[];
  concepts: string[];
  embedding?: number[];
  status: "pending" | "processing" | "processed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    url: { type: String, required: true, trim: true },
    title: { type: String, trim: true },
    rawContent: { type: String },
    summary: { type: String },
    topics: { type: [String], default: [], index: true },
    concepts: { type: [String], default: [], index: true },
    embedding: { type: [Number], default: undefined, select: false },
    status: {
      type: String,
      enum: ["pending", "processing", "processed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

resourceSchema.index({ userId: 1, createdAt: -1 });

export const Resource = mongoose.model<IResource>("Resource", resourceSchema);