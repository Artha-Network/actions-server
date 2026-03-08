/**
 * Email notification service
 *
 * Sends AI-generated emails via Gmail SMTP (nodemailer).
 * Requires:
 *   GMAIL_USER         – Gmail address (default: mbirochan@gmail.com)
 *   GMAIL_APP_PASSWORD  – Gmail app password
 *   ANTHROPIC_API_KEY  – Claude API key for AI-written email copy
 *   FRONTEND_URL       – Base URL of the web app (default: https://artha.network)
 */

import * as nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER || "mbirochan@gmail.com";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "yjul vzae oric zvpd";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://artha.network";
const FROM_EMAIL = `Artha Network <${GMAIL_USER}>`;

// ---------------------------------------------------------------------------
// Gmail SMTP transporter (reusable, connection pooling)
// ---------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

export interface DealEmailParams {
  to: string;
  dealId: string;
  dealTitle?: string | null;
  amountUsd: string;
  initiatorWallet: string;
  counterpartyRole: "buyer" | "seller";
  deliverDeadline?: Date | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Claude: generate personalised email copy
// ---------------------------------------------------------------------------

async function generateEmailWithClaude(params: DealEmailParams): Promise<{ subject: string; html: string } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const deadlineStr = params.deliverDeadline
    ? new Date(params.deliverDeadline).toLocaleDateString("en-US", { dateStyle: "long" })
    : "not specified";

  const prompt = `You are writing a professional, friendly email on behalf of Artha Network, a Solana-based smart escrow platform.

A user has created a new escrow deal and you need to notify the counterparty.

Deal details:
- Title: ${params.dealTitle || "Untitled Deal"}
- Amount: $${params.amountUsd} USDC
- Initiator wallet: ${params.initiatorWallet}
- Counterparty role: ${params.counterpartyRole}
- Delivery deadline: ${deadlineStr}
- Description: ${params.description || "No description provided"}
- Deal link: ${dealLink}

Write a professional email that:
1. Informs the ${params.counterpartyRole} that a deal has been created for them
2. Summarises the deal terms clearly
3. Explains that Artha Network uses blockchain-secured smart contracts
4. Encourages them to sign up at ${FRONTEND_URL} to view and accept the deal
5. Includes the deal link prominently
6. Keeps a warm but professional tone, signed "The Artha Network Team"

Respond with valid JSON ONLY, in this exact format:
{
  "subject": "<email subject line>",
  "body": "<full email body as plain text with line breaks as \\n>"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) return null;

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { subject: string; body: string };
    if (!parsed.subject || !parsed.body) return null;

    const html = parsed.body
      .split("\n")
      .map((line: string) => (line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : "<br>"))
      .join("\n");

    return { subject: parsed.subject, html };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback template (used when Claude is unavailable)
// ---------------------------------------------------------------------------

function buildFallbackEmail(params: DealEmailParams): { subject: string; html: string } {
  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const deadlineStr = params.deliverDeadline
    ? new Date(params.deliverDeadline).toLocaleDateString("en-US", { dateStyle: "long" })
    : "as agreed";
  const title = params.dealTitle || "Escrow Deal";

  const subject = `You have a new deal on Artha Network: ${title}`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
  <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:22px">Artha Network</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px">Blockchain-secured smart escrow</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 16px;font-size:18px">You have a new escrow deal</h2>
    <p>You've been named as the <strong>${params.counterpartyRole}</strong> in a secure escrow agreement on Artha Network.</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin:24px 0">
      <h3 style="margin:0 0 12px;font-size:15px;color:#0f172a">Deal Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Title</td><td style="padding:6px 0;font-weight:600">${title}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:600">$${params.amountUsd} USDC</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Deliver by</td><td style="padding:6px 0">${deadlineStr}</td></tr>
        ${params.description ? `<tr><td style="padding:6px 0;color:#64748b;vertical-align:top">Description</td><td style="padding:6px 0">${params.description}</td></tr>` : ""}
      </table>
    </div>

    <p>Artha Network protects both parties through Solana smart contracts — funds are held securely until all conditions are met.</p>

    <div style="text-align:center;margin:32px 0">
      <a href="${dealLink}" style="background:#0f172a;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
        View Your Deal →
      </a>
    </div>

    <p style="font-size:13px;color:#64748b">
      New to Artha Network? <a href="${FRONTEND_URL}" style="color:#3b82f6">Sign up for free</a> to securely manage this deal.<br>
      If you did not expect this email, you can safely ignore it.
    </p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:12px;color:#94a3b8;text-align:center">
      The Artha Network Team · <a href="${FRONTEND_URL}" style="color:#94a3b8">${FRONTEND_URL.replace(/^https?:\/\//, "")}</a>
    </p>
  </div>
</div>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Send email via Gmail SMTP (nodemailer)
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}

// ---------------------------------------------------------------------------
// Deal completion notification (sent to both parties)
// ---------------------------------------------------------------------------

export interface DealCompletionParams {
  dealId: string;
  dealTitle?: string | null;
  amountUsd: string;
  buyerEmail?: string | null;
  sellerEmail?: string | null;
  outcome: "RELEASED" | "REFUNDED";
}

async function generateCompletionEmailWithClaude(
  params: DealCompletionParams,
  recipientRole: "buyer" | "seller",
): Promise<{ subject: string; html: string } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const outcomeText = params.outcome === "RELEASED" ? "Funds have been released to the seller" : "Funds have been refunded to the buyer";

  const prompt = `You are writing a professional, friendly email on behalf of Artha Network, a Solana-based smart escrow platform.

An escrow deal has been completed and you need to notify the ${recipientRole}.

Deal details:
- Title: ${params.dealTitle || "Untitled Deal"}
- Amount: $${params.amountUsd} USDC
- Outcome: ${params.outcome}
- What happened: ${outcomeText}
- Deal link: ${dealLink}

Write a professional email that:
1. Informs the ${recipientRole} that the deal has been completed
2. Clearly states the outcome (${params.outcome === "RELEASED" ? "funds released to seller" : "funds refunded to buyer"})
3. Thanks them for using Artha Network
4. Includes the deal link for their records
5. Keeps a warm but professional tone, signed "The Artha Network Team"

Respond with valid JSON ONLY, in this exact format:
{
  "subject": "<email subject line>",
  "body": "<full email body as plain text with line breaks as \\n>"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) return null;

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { subject: string; body: string };
    if (!parsed.subject || !parsed.body) return null;

    const html = parsed.body
      .split("\n")
      .map((line: string) => (line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : "<br>"))
      .join("\n");

    return { subject: parsed.subject, html };
  } catch {
    return null;
  }
}

function buildCompletionFallbackEmail(
  params: DealCompletionParams,
  recipientRole: "buyer" | "seller",
): { subject: string; html: string } {
  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const title = params.dealTitle || "Escrow Deal";
  const outcomeLabel = params.outcome === "RELEASED" ? "Funds Released" : "Funds Refunded";
  const outcomeColor = params.outcome === "RELEASED" ? "#16a34a" : "#dc2626";
  const outcomeDesc = params.outcome === "RELEASED"
    ? "The escrow funds have been released to the seller. The deal is now complete."
    : "The escrow funds have been refunded to the buyer. The deal has been closed.";

  const subject = `Deal Complete: ${title} — ${outcomeLabel}`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
  <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:22px">Artha Network</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px">Blockchain-secured smart escrow</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <div style="text-align:center;margin-bottom:24px">
      <span style="background:${outcomeColor};color:#fff;padding:8px 20px;border-radius:20px;font-weight:600;font-size:14px">${outcomeLabel}</span>
    </div>
    <h2 style="margin:0 0 16px;font-size:18px">Your deal has been completed</h2>
    <p>${outcomeDesc}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin:24px 0">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Deal</td><td style="padding:6px 0;font-weight:600">${title}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:600">$${params.amountUsd} USDC</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Your Role</td><td style="padding:6px 0">${recipientRole.charAt(0).toUpperCase() + recipientRole.slice(1)}</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:32px 0">
      <a href="${dealLink}" style="background:#0f172a;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
        View Deal Details →
      </a>
    </div>

    <p style="font-size:13px;color:#64748b">Thank you for using Artha Network. We look forward to securing your next deal.</p>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:12px;color:#94a3b8;text-align:center">
      The Artha Network Team · <a href="${FRONTEND_URL}" style="color:#94a3b8">${FRONTEND_URL.replace(/^https?:\/\//, "")}</a>
    </p>
  </div>
</div>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Generic deal status change notification (sent to both parties)
// ---------------------------------------------------------------------------

export interface DealStatusChangeParams {
  dealId: string;
  dealTitle?: string | null;
  amountUsd: string;
  buyerEmail?: string | null;
  sellerEmail?: string | null;
  newStatus: "INIT" | "FUNDED" | "DISPUTED" | "RESOLVED" | "RELEASED" | "REFUNDED";
  actorRole?: "buyer" | "seller" | "arbiter";
}

const STATUS_DESCRIPTIONS: Record<string, { label: string; description: string; color: string }> = {
  INIT: { label: "Deal Created", description: "A new escrow deal has been created. Review the terms and take action.", color: "#3b82f6" },
  FUNDED: { label: "Escrow Funded", description: "The buyer has deposited funds into the escrow. The seller can now proceed with delivery.", color: "#16a34a" },
  DISPUTED: { label: "Dispute Opened", description: "A dispute has been opened on this deal. Both parties should submit evidence for AI arbitration.", color: "#f59e0b" },
  RESOLVED: { label: "Dispute Resolved", description: "The AI arbiter has reviewed the evidence and issued a verdict. The winning party can now claim the funds.", color: "#8b5cf6" },
  RELEASED: { label: "Funds Released", description: "The escrow funds have been released to the seller. The deal is now complete.", color: "#16a34a" },
  REFUNDED: { label: "Funds Refunded", description: "The escrow funds have been refunded to the buyer. The deal has been closed.", color: "#dc2626" },
};

async function generateStatusEmailWithClaude(
  params: DealStatusChangeParams,
  recipientRole: "buyer" | "seller",
): Promise<{ subject: string; html: string } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const statusInfo = STATUS_DESCRIPTIONS[params.newStatus];

  const prompt = `You are writing a professional, friendly email on behalf of Artha Network, a Solana-based smart escrow platform.

An escrow deal status has changed and you need to notify the ${recipientRole}.

Deal details:
- Title: ${params.dealTitle || "Untitled Deal"}
- Amount: $${params.amountUsd} USDC
- New Status: ${statusInfo.label}
- What happened: ${statusInfo.description}
- Recipient role: ${recipientRole}
- Deal link: ${dealLink}

Write a concise, professional email that:
1. Clearly states the status change: "${statusInfo.label}"
2. Explains what this means for the ${recipientRole} specifically
3. Tells them what action they should take next (if any)
4. Includes the deal link
5. Keeps a warm but professional tone, signed "The Artha Network Team"
6. Keep it SHORT — 3-5 sentences max in the body

Respond with valid JSON ONLY, in this exact format:
{
  "subject": "<email subject line>",
  "body": "<full email body as plain text with line breaks as \\n>"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (!text) return null;

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { subject: string; body: string };
    if (!parsed.subject || !parsed.body) return null;

    const html = parsed.body
      .split("\n")
      .map((line: string) => (line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : "<br>"))
      .join("\n");

    return { subject: parsed.subject, html };
  } catch {
    return null;
  }
}

function buildStatusFallbackEmail(
  params: DealStatusChangeParams,
  recipientRole: "buyer" | "seller",
): { subject: string; html: string } {
  const dealLink = `${FRONTEND_URL}/deal/${params.dealId}`;
  const title = params.dealTitle || "Escrow Deal";
  const statusInfo = STATUS_DESCRIPTIONS[params.newStatus];

  const subject = `${statusInfo.label}: ${title}`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
  <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:22px">Artha Network</h1>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px">Blockchain-secured smart escrow</p>
  </div>
  <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <div style="text-align:center;margin-bottom:24px">
      <span style="background:${statusInfo.color};color:#fff;padding:8px 20px;border-radius:20px;font-weight:600;font-size:14px">${statusInfo.label}</span>
    </div>
    <h2 style="margin:0 0 16px;font-size:18px">${title}</h2>
    <p>${statusInfo.description}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:20px;margin:24px 0">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:600">$${params.amountUsd} USDC</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Your Role</td><td style="padding:6px 0">${recipientRole.charAt(0).toUpperCase() + recipientRole.slice(1)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Status</td><td style="padding:6px 0;font-weight:600">${statusInfo.label}</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:32px 0">
      <a href="${dealLink}" style="background:#0f172a;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
        View Deal →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:12px;color:#94a3b8;text-align:center">
      The Artha Network Team · <a href="${FRONTEND_URL}" style="color:#94a3b8">${FRONTEND_URL.replace(/^https?:\/\//, "")}</a>
    </p>
  </div>
</div>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send status change notification to both buyer and seller.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function sendDealStatusNotification(params: DealStatusChangeParams): Promise<void> {
  const recipients: { email: string; role: "buyer" | "seller" }[] = [];
  if (params.buyerEmail?.includes("@")) recipients.push({ email: params.buyerEmail, role: "buyer" });
  if (params.sellerEmail?.includes("@")) recipients.push({ email: params.sellerEmail, role: "seller" });

  for (const { email, role } of recipients) {
    try {
      const content =
        (await generateStatusEmailWithClaude(params, role)) ??
        buildStatusFallbackEmail(params, role);
      await sendEmail(email, content.subject, content.html);
      console.log(`[email] Sent ${params.newStatus} notification to ${email} (${role}) for deal ${params.dealId}`);
    } catch (err) {
      console.error(`[email] Failed to send ${params.newStatus} email to ${email} for deal ${params.dealId}:`, err);
    }
  }
}

/**
 * Send completion notification to both buyer and seller.
 * @deprecated Use sendDealStatusNotification with newStatus="RELEASED"|"REFUNDED" instead.
 * Kept for backwards compatibility.
 */
export async function sendDealCompletionNotification(params: DealCompletionParams): Promise<void> {
  const recipients: { email: string; role: "buyer" | "seller" }[] = [];
  if (params.buyerEmail?.includes("@")) recipients.push({ email: params.buyerEmail, role: "buyer" });
  if (params.sellerEmail?.includes("@")) recipients.push({ email: params.sellerEmail, role: "seller" });

  for (const { email, role } of recipients) {
    try {
      const content =
        (await generateCompletionEmailWithClaude(params, role)) ??
        buildCompletionFallbackEmail(params, role);
      await sendEmail(email, content.subject, content.html);
      console.log(`[email] ✅ Completion email sent to ${email} (${role}) for deal ${params.dealId}`);
    } catch (err) {
      console.error(`[email] ❌ Failed to send completion email to ${email} for deal ${params.dealId}:`, err);
    }
  }
}

/**
 * Send an AI-written notification email to the deal counterparty.
 * This is fire-and-forget — errors are logged but never thrown.
 */
export async function sendCounterpartyNotification(params: DealEmailParams): Promise<void> {
  if (!params.to || !params.to.includes("@")) {
    return;
  }

  try {
    const content = (await generateEmailWithClaude(params)) ?? buildFallbackEmail(params);
    await sendEmail(params.to, content.subject, content.html);
    console.log(`[email] ✅ Counterparty notification sent to ${params.to} for deal ${params.dealId}`);
  } catch (err) {
    console.error(`[email] ❌ Failed to send counterparty notification for deal ${params.dealId}:`, err);
  }
}
