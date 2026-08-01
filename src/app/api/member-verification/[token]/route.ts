import { Api } from "grammy";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  restoreMemberAccess,
  sendRollingWelcome,
} from "@/bot/moderation";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  groupModerationSettings,
  memberVerifications,
  moderationActions,
} from "@/db/schema";
import { randomBytes } from "node:crypto";

const bodySchema = z.object({ answer: z.coerce.number().int() });
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const maximumAttempts = 5;

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = tokenSchema.safeParse((await context.params).token);
  if (!token.success) {
    return Response.json({ message: "Invalid verification link." }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return Response.json({ message: "Invalid answer." }, { status: 400 });
  }

  const verification = await db.query.memberVerifications.findFirst({
    where: eq(memberVerifications.challengeAccessToken, token.data),
  });
  if (
    !verification ||
    verification.status !== "PENDING" ||
    !verification.claimedAt ||
    verification.expiresAt <= new Date()
  ) {
    return Response.json(
      { message: "This verification has expired." },
      { status: 410 },
    );
  }
  if (body.data.answer !== verification.expectedAnswer) {
    const attemptCount = verification.attemptCount + 1;
    await db
      .update(memberVerifications)
      .set({
        attemptCount,
        expiresAt:
          attemptCount >= maximumAttempts
            ? new Date()
            : verification.expiresAt,
      })
      .where(eq(memberVerifications.id, verification.id));
    return Response.json(
      {
        message:
          attemptCount >= maximumAttempts
            ? "Too many incorrect attempts. Verification expired."
            : "Incorrect answer. Try again.",
      },
      { status: attemptCount >= maximumAttempts ? 429 : 400 },
    );
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ message: "Bot unavailable." }, { status: 503 });
  }

  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  await restoreMemberAccess(
    api,
    Number(verification.groupId),
    Number(verification.userId),
  );
  const claimed = await db
    .update(memberVerifications)
    .set({ status: "VERIFIED", verifiedAt: new Date() })
    .where(
      and(
        eq(memberVerifications.id, verification.id),
        eq(memberVerifications.status, "PENDING"),
      ),
    )
    .returning({ id: memberVerifications.id });
  if (claimed.length === 0) {
    return Response.json({ message: "Verification already completed." });
  }
  await db.insert(moderationActions).values({
    id: `mod_${randomBytes(18).toString("base64url")}`,
    groupId: verification.groupId,
    userId: verification.userId,
    action: "VERIFICATION_PASSED",
    detailsJson: JSON.stringify({ method: "WEB_CHALLENGE" }),
  });
  if (verification.challengeMessageId) {
    await api
      .deleteMessage(
        Number(verification.groupId),
        Number(verification.challengeMessageId),
      )
      .catch(() => undefined);
  }
  const moderationSettings =
    await db.query.groupModerationSettings.findFirst({
      where: eq(
        groupModerationSettings.groupId,
        verification.groupId,
      ),
    });
  if (moderationSettings?.welcomeEnabled !== false) {
    await sendRollingWelcome({
      api,
      groupId: Number(verification.groupId),
      userId: Number(verification.userId),
      firstName: verification.firstName,
      template: moderationSettings?.welcomeMessage,
    });
  }
  return Response.json({
    message: "Verification passed. You can return to Telegram.",
  });
}
