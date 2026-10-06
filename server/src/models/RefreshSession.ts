import { Schema, model } from 'mongoose';

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

export const RefreshSession = model('RefreshSession', refreshSessionSchema);