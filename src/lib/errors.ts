// Error codes shared by services and route handlers (docs/06-API-SPEC.md "Error codes").
export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "CONFLICT_DUPLICATE"
  | "POLICY_BLOCKED"
  | "PAYPAL_ERROR"
  | "AI_ERROR"
  | "RATE_LIMITED"
  | "FROZEN";

export interface AppError {
  code: ErrorCode;
  message: string;
  /** Extra machine-readable detail: PayPal debugId, AI reason, rule ids… */
  detail?: Record<string, string | string[]>;
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT_DUPLICATE: 409,
  POLICY_BLOCKED: 422,
  PAYPAL_ERROR: 502,
  AI_ERROR: 502,
  RATE_LIMITED: 429,
  FROZEN: 423,
};
