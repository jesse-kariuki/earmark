import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PAYPAL_MODE: z.enum(["mock", "sandbox"]).default("mock"),
    AI_MODE: z.enum(["fixture", "live"]).default("fixture"),
    PAYOUT_MODE: z.enum(["real", "simulated"]).default("real"),
    JUDGE_MODE: bool.default(true),

    PAYPAL_CLIENT_ID: optionalString,
    PAYPAL_CLIENT_SECRET: optionalString,
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: optionalString,
    PAYPAL_WEBHOOK_ID: optionalString,
    PAYPAL_ACCESS_TOKEN: optionalString,
    SCHOOL_PAYPAL_EMAIL: z.string().email().default("sb-lakeview@business.example.com"),
    LOOKALIKE_PAYPAL_EMAIL: z.string().email().default("sb-lookalike@personal.example.com"),

    AI_PROVIDER: z.enum(["anthropic", "google"]).default("anthropic"),
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: optionalString,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
    GOOGLE_MODEL: optionalString,
    AI_RECORD: bool.default(false),
    LIVE_AI_DAILY_BUDGET: z.coerce.number().int().nonnegative().default(200),
    RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),

    TICKET_SECRET: z.string().min(16).default("change-me-32-bytes-hex"),
    DEMO_RESET_TOKEN: z.string().min(1).default("change-me"),
    SCHOOL_PRIVATE_KEY: optionalString,
    SCHOOL_PUBLIC_KEY: optionalString,

    DATABASE_PATH: z.string().min(1).default(".data/earmark.db"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    KES_DISPLAY_RATE: z.coerce.number().positive().default(129),
  })
  .superRefine((e, ctx) => {
    if (e.PAYPAL_MODE === "sandbox") {
      for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const) {
        if (!e[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when PAYPAL_MODE=sandbox` });
        }
      }
    }
    const key = e.AI_PROVIDER === "google" ? "GOOGLE_GENERATIVE_AI_API_KEY" : "ANTHROPIC_API_KEY";
    if (e.AI_MODE === "live" && !e[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when AI_MODE=live and AI_PROVIDER=${e.AI_PROVIDER}` });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parse an env source. Strips inline `# comments` the way .env.example is written. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    cleaned[k] = v?.replace(/\s+#.*$/, "");
  }
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
