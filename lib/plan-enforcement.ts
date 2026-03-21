// ============================================
// ShoreStack Vault — Plan Enforcement
// ============================================
// Two tiers: Personal ($0.99/mo, 1 GB) and Plus ($1.99/mo, 10 GB).
// All plans have unlimited vault items. Differentiated by storage and features.

import { PLAN_LIMITS, type PlanType } from '@/types/vault';

export interface PlanCheckResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

export function checkStorageLimit(plan: PlanType, currentMB: number, newFileMB: number): PlanCheckResult {
  const limitMB = PLAN_LIMITS[plan].maxStorageMB;
  if (currentMB + newFileMB > limitMB) {
    return {
      allowed: false,
      reason: `This upload would exceed your ${limitMB >= 1024 ? `${limitMB / 1024} GB` : `${limitMB} MB`} storage limit. Upgrade to Plus for 10 GB.`,
      limit: limitMB,
      current: currentMB,
    };
  }
  return { allowed: true, limit: limitMB, current: currentMB };
}

export function checkAuditAccess(plan: PlanType): PlanCheckResult {
  if (!PLAN_LIMITS[plan].auditLog) {
    return { allowed: false, reason: 'Audit log requires a paid plan.' };
  }
  return { allowed: true };
}
