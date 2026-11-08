import nodemailer from "nodemailer";

// Outbound email for device links. The link carries identity only; the key never
// comes through here, so the message can't unlock anything on its own.

export const MAIL_ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = MAIL_ENABLED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export async function sendDeviceLink(to: string, link: string) {
  if (!transport) throw new Error("mail not configured");
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    to,
    subject: "Open your Loft files on this device",
    text: `Open this link on the device you want to use:\n\n${link}\n\nThen enter your recovery code there to unlock your files. The link stops working after 24 hours.\n\nIf you didn't ask for this, ignore it.`,
    html: `<p>Open this link on the device you want to use:</p><p><a href="${link}">${link}</a></p><p>Then enter your recovery code there to unlock your files. The link stops working after 24 hours.</p><p style="color:#888">If you didn't ask for this, ignore it.</p>`,
  });
}
