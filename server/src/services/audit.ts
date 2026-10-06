import { Request } from 'express';
import { AuditLog } from '../models/Clinical';

export async function recordAudit(request: Request, action: string, resourceType: string, resourceId?: string, patientId?: string): Promise<void> {
  await AuditLog.create({
    actorId: request.user?.id,
    actorRole: request.user?.role,
    action,
    resourceType,
    resourceId,
    patientId,
    ipAddress: request.ip
  });
}