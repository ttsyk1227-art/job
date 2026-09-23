import type { RecordCategory, Role, EnrollmentStatus } from "@prisma/client";

export const RECORD_CATEGORY_LABEL: Record<RecordCategory, string> = {
  LIFE_GUIDANCE: "生活指導",
  HEALTH: "健康・保健",
  CAREER: "進路",
  GUARDIAN_CONTACT: "保護者連絡",
  CLUB: "部活動",
  OTHER: "その他",
};

export const RECORD_CATEGORIES = Object.keys(
  RECORD_CATEGORY_LABEL
) as RecordCategory[];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "管理者",
  STAFF: "教員",
};

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ENROLLED: "在籍中",
  GRADUATED: "卒業",
  WITHDRAWN: "退学・転出",
};
