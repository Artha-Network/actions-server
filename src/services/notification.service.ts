import { prisma } from "../lib/prisma";

interface NotificationOpts {
  body?: string;
  type?: string;
  dealId?: string;
}

export async function createNotification(
  userId: string,
  title: string,
  opts?: NotificationOpts
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        body: opts?.body ?? null,
        type: opts?.type ?? "info",
        dealId: opts?.dealId ?? null,
      },
    });
  } catch (err) {
    // Notifications are non-critical — log but don't propagate
    console.error("[notification] Failed to create notification:", err);
  }
}

export async function createNotificationByWallet(
  walletAddress: string,
  title: string,
  opts?: NotificationOpts
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: { id: true },
    });
    if (!user) return;
    await createNotification(user.id, title, opts);
  } catch (err) {
    console.error("[notification] Failed to create notification by wallet:", err);
  }
}
