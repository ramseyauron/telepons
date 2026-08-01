export const teleponsLinks = {
  telegramBot: "https://t.me/teleponsBot",
  announcementChannel: "https://t.me/TeleponsAnnouncement",
  launchList: "https://t.me/teleponslaunchlist",
  x: process.env.NEXT_PUBLIC_TELEPONS_X_URL?.trim() || null,
} as const;
