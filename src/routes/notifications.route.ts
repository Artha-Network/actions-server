import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/notifications?wallet_address=...&limit=20&unread_only=false
router.get("/", async (req, res) => {
  try {
    const { wallet_address, limit = "20", unread_only } = req.query as Record<string, string>;

    if (!wallet_address) {
      return res.status(400).json({ error: "wallet_address is required" });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet_address },
      select: { id: true },
    });

    if (!user) {
      return res.json({ notifications: [], total: 0, unread_count: 0 });
    }

    const take = Math.min(Number(limit) || 20, 100);
    const isUnreadOnly = unread_only === "true";

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: user.id,
          ...(isUnreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          title: true,
          body: true,
          type: true,
          dealId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    res.json({
      notifications: notifications.map((n) => ({
        ...n,
        created_at: n.createdAt.toISOString(),
        deal_id: n.dealId,
        is_read: n.isRead,
      })),
      total: notifications.length,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// PATCH /api/notifications/mark-all-read?wallet_address=...
router.patch("/mark-all-read", async (req, res) => {
  try {
    const { wallet_address } = req.query as Record<string, string>;

    if (!wallet_address) {
      return res.status(400).json({ error: "wallet_address is required" });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: wallet_address },
      select: { id: true },
    });

    if (!user) {
      return res.json({ updated: 0 });
    }

    const result = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ updated: result.count });
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

export default router;
