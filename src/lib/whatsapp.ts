import { supabase } from './supabase';

// ── WhatsApp: click-to-send today, Business API tomorrow ──────────────────────
// The app composes the message and opens WhatsApp pre-filled. All message bodies
// are built from templates here, and every send is logged to outbound_messages,
// so upgrading to the official WhatsApp Business API is a backend-only change —
// the calling UI never has to change.

/** Normalise a phone number to digits only for wa.me links. */
function normalisePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export interface OutboundLog {
  academyId: string;
  playerId?: string | null;
  templateKey: string;
  refType?: string;
  refId?: string | null;
}

/**
 * Open WhatsApp with a pre-filled message to the given number, and log the
 * outbound message. Returns the wa.me URL that was opened.
 */
export async function sendWhatsApp(
  phone: string,
  body: string,
  log: OutboundLog,
): Promise<string> {
  const url = `https://wa.me/${normalisePhone(phone)}?text=${encodeURIComponent(body)}`;

  // Best-effort log; never block the send on a logging failure.
  try {
    await supabase.from('outbound_messages').insert({
      academy_id: log.academyId,
      player_id: log.playerId ?? null,
      channel: 'whatsapp_click',
      template_key: log.templateKey,
      body,
      ref_type: log.refType ?? null,
      ref_id: log.refId ?? null,
      status: 'composed',
    });
  } catch (e) {
    console.warn('[Loop] failed to log outbound message', e);
  }

  window.open(url, '_blank', 'noopener');
  return url;
}

// ── Message templates ─────────────────────────────────────────────────────────
// Centralised so wording is consistent and a future Business-API template
// mapping is trivial.

export const templates = {
  reportSent: (childFirstName: string, body: string) =>
    `Hi! Here's an update on ${childFirstName} from Loop by Zak Cricket:\n\n${body}`,

  attendanceConfirmed: (childFirstName: string, dateLabel: string, late: boolean) =>
    `Hi! ${childFirstName} attended training on ${dateLabel}${late ? ' (arrived a little late, still counted as attended)' : ''}. — Loop by Zak Cricket`,

  paymentReminder: (childFirstName: string, amountLabel: string) =>
    `Hi! A friendly reminder regarding ${childFirstName}'s outstanding balance of ${amountLabel}. Thank you! — Loop by Zak Cricket`,

  renewalNudge: (childFirstName: string, remaining: number) =>
    `Hi! ${childFirstName} has ${remaining} session${remaining === 1 ? '' : 's'} remaining. Would you like to renew the package? — Loop by Zak Cricket`,

  packageAssigned: (childFirstName: string, sessionsLabel: string, remaining: number | null, deducted: number) => {
    const base = `Hi! ${childFirstName} has been assigned a ${sessionsLabel} at Loop by Zak Cricket.`;
    const extra =
      deducted > 0
        ? ` ${deducted} already-taken session${deducted === 1 ? '' : 's'} ${deducted === 1 ? 'was' : 'were'} deducted, leaving ${remaining} session${remaining === 1 ? '' : 's'} remaining.`
        : remaining != null
          ? ` ${remaining} session${remaining === 1 ? '' : 's'} to enjoy.`
          : '';
    return `${base}${extra} Thank you! — Loop by Zak Cricket`;
  },

  badgeEarned: (childFirstName: string, badgeName: string) =>
    `🏅 Congratulations! ${childFirstName} just earned the "${badgeName}" badge at Loop by Zak Cricket!`,

  coachReminder: (coachFirstName: string, days: number | null) =>
    `Hi ${coachFirstName}, quick nudge from the Head Coach — ${days == null ? "let's get some player reports out this week" : `it's been ${days} day${days === 1 ? '' : 's'} since your last report, let's keep parents updated`}. Thanks! 🏏 — Loop by Zak Cricket`,

  packageComplete: (childFirstName: string, body: string) =>
    `Hi! ${childFirstName} has completed their package at Loop by Zak Cricket — here's a progress summary:\n\n${body}\n\nWe'd love to continue the journey — reply to renew. Thank you!`,

  matchFeeRequest: (childFirstName: string, amountLabel: string, bankDetails: string) =>
    `Hi! Match fee for ${childFirstName} is ${amountLabel}. You can pay by cash on the day or bank transfer:\n\n${bankDetails}\n\nPlease send a screenshot once transferred. Thank you! — Loop by Zak Cricket`,
};
