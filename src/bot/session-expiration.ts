import { Api } from "grammy";
import { and, eq, lte } from "drizzle-orm";
import {
  launchAnnouncementCaption,
  launchAnnouncementKeyboard,
} from "@/bot/launch-announcement";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  launchOrders,
  launchSessions,
  telegramGroups,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

export async function expireLaunchSessions(api: Api): Promise<number> {
  const expired = await db.query.launchSessions.findMany({
    where: and(
      eq(launchSessions.status, "READY"),
      lte(launchSessions.expiresAt, new Date()),
    ),
  });

  for (const session of expired) {
    await db
      .update(launchSessions)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(launchSessions.id, session.id),
          eq(launchSessions.status, "READY"),
        ),
      );
    await db
      .update(telegramGroups)
      .set({ lifecycle: "UNCONFIGURED", activeLaunchSessionId: null })
      .where(eq(telegramGroups.id, session.groupId));

    const order = await db.query.launchOrders.findFirst({
      where: eq(launchOrders.launchSessionId, session.id),
    });
    if (!order?.announcementMessageId) continue;

    const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
    try {
      await api.editMessageCaption(
        env.TELEGRAM_LAUNCH_CHANNEL,
        Number(order.announcementMessageId),
        {
          caption: launchAnnouncementCaption({
            draft,
            status: "EXPIRED",
          }),
          reply_markup: launchAnnouncementKeyboard({
            draft,
            launchUrl: new URL(
              `/launch/${session.id}`,
              env.APP_BASE_URL,
            ).toString(),
          }),
        },
      );
    } catch (error) {
      console.error("Could not mark channel announcement expired", error);
    }
  }

  return expired.length;
}
