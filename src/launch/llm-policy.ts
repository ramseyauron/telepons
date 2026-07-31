export type GroupLifecycle =
  | "UNCONFIGURED"
  | "DRAFTING"
  | "READY"
  | "ACTIVE";

type LlmAccessInput = {
  senderUserId: string;
  ownerUserId: string;
  lifecycle: GroupLifecycle;
  hasActiveDraft: boolean;
};

export type LlmAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "NOT_GROUP_OWNER"
        | "NO_ACTIVE_DRAFT"
        | "GROUP_NOT_DRAFTING"
        | "TOKEN_ALREADY_LAUNCHED";
    };

/**
 * This is the authoritative LLM access boundary. Prompt instructions are only
 * a second layer; callers must pass this policy before sending data to a model.
 */
export function canUseTokenDraftLlm(
  input: LlmAccessInput,
): LlmAccessDecision {
  if (input.senderUserId !== input.ownerUserId) {
    return { allowed: false, reason: "NOT_GROUP_OWNER" };
  }

  if (input.lifecycle === "ACTIVE") {
    return { allowed: false, reason: "TOKEN_ALREADY_LAUNCHED" };
  }

  if (input.lifecycle !== "DRAFTING") {
    return { allowed: false, reason: "GROUP_NOT_DRAFTING" };
  }

  if (!input.hasActiveDraft) {
    return { allowed: false, reason: "NO_ACTIVE_DRAFT" };
  }

  return { allowed: true };
}

const tokenDetailSignals = [
  "name",
  "symbol",
  "ticker",
  "description",
  "deployer",
  "developer buy",
  "dev buy",
  "twitter",
  "telegram",
  "website",
  "logo",
  "creator fee",
  "creator tax",
  "buyback",
];

/**
 * A cheap scope filter prevents unrelated group conversation from reaching the
 * model. The structured-output schema remains the final content boundary.
 */
export function looksLikeTokenDetails(message: string): boolean {
  const normalized = message.toLowerCase();
  return tokenDetailSignals.some((signal) => normalized.includes(signal));
}
