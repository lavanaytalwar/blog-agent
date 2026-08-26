/**
 * One-way channel webhook. No bot, no application, no signature verification,
 * no 3-second interaction deadline — see DASHBOARD.md §1.
 *
 * Never throws: a missing webhook or a Discord outage must not fail an
 * approval that has already been written.
 */
export async function notifyDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  } catch (error) {
    console.error('discord webhook failed:', error);
  }
}
