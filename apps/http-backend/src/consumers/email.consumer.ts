import { ConsumeMessage } from "amqplib";
import nodemailer from "nodemailer";
import { getChannel } from "../infra/rabbitmq";
import { logger } from "../infra/logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function startEmailConsumer() {
  const channel = getChannel();
  const QUEUE = "email.queue";

  await channel.assertQueue(QUEUE, { durable: true });
  channel.prefetch(1);

  logger.info({ queue: QUEUE }, "Email Consumer started");

  channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      const { type, payload } = content;

      if (type === "VERIFY_EMAIL") {
        await sendVerificationEmail(payload.email, payload.token);
      } else if (type === "SESSION_SUMMARY") {
        await sendSummaryEmail(payload.emails, payload.summary, payload.roomName);
      }

      channel.ack(msg);
    } catch (error) {
      logger.error({ error }, "Failed to process email task");
      // Don't requeue indefinitely, maybe add retry logic later
      channel.ack(msg);
    }
  });
}

async function sendVerificationEmail(email: string, token: string) {
  const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;
  
  await transporter.sendMail({
    from: `"Pencil.io" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your Pencil.io account",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Welcome to Pencil.io!</h2>
        <p>Please verify your email address to unlock the full potential of our real-time collaboration tools.</p>
        <div style="margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Verify Email Address</a>
        </div>
        <p style="font-size: 14px; color: #64748b;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  });
  
  logger.info({ email }, "Verification email sent");
}

async function sendSummaryEmail(emails: string[], summary: string, roomName: string) {
  await transporter.sendMail({
    from: `"Pencil.io" <${process.env.SMTP_USER}>`,
    bcc: emails.join(", "),
    subject: `Meeting Summary: ${roomName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Session Highlights</h2>
        <p>Here is the AI-generated summary of your recent session in <strong>${roomName}</strong>:</p>
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; line-height: 1.6;">
          ${summary.replace(/\n/g, "<br/>")}
        </div>
        <p style="font-size: 14px; color: #64748b;">Visit your dashboard to view the full activity log and canvas state.</p>
      </div>
    `,
  });
  
  logger.info({ count: emails.length }, "Summary email sent to participants");
}
