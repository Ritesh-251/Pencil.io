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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
      } else if (type === "MEETING_INVITATION") {
        await sendInvitationEmail(
          payload.emails,
          payload.title,
          payload.startTime,
          payload.roomName,
          payload.roomId
        );
      } else if (type === "SESSION_SUMMARY") {
        await sendSummaryEmail(
          payload.emails,
          payload.summary,
          payload.roomName,
          payload.tasks
        );
      }

      channel.ack(msg);
    } catch (error) {
      logger.error({ error }, "Failed to process email task");
      // Don't requeue indefinitely, maybe add retry logic later
      channel.ack(msg);
    }
  });
}

async function sendInvitationEmail(
  emails: string[],
  title: string,
  startTime: string,
  roomName: string,
  roomId: string
) {
  const dateStr = new Date(startTime).toLocaleString([], { 
    weekday: "long", 
    month: "long", 
    day: "numeric", 
    hour: "2-digit", 
    minute: "2-digit" 
  });
  const joinLink = `${process.env.FRONTEND_URL}/room/${roomId}`;

  await transporter.sendMail({
    from: `"Pencil.io" <${process.env.SMTP_USER}>`,
    bcc: emails.join(", "),
    subject: `Meeting Invitation: ${title}`,
    html: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 48px 40px; text-align: center;">
          <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 12px 24px; border-radius: 100px; color: #ffffff; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 24px; backdrop-filter: blur(10px);">
            New Invitation
          </div>
          <h1 style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.02em;">
            ${escapeHtml(title)}
          </h1>
        </div>
        
        <div style="padding: 40px;">
          <div style="background-color: #f8fafc; border-radius: 20px; padding: 32px; margin-bottom: 32px; border: 1px solid #f1f5f9;">
            <div style="margin-bottom: 24px;">
              <span style="display: block; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Schedule</span>
              <span style="display: block; font-size: 16px; font-weight: 600; color: #1e293b;">${dateStr}</span>
            </div>
            <div>
              <span style="display: block; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Collaboration Room</span>
              <span style="display: block; font-size: 16px; font-weight: 600; color: #1e293b;">${escapeHtml(roomName)}</span>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 40px;">
            <a href="${joinLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 18px 48px; text-decoration: none; border-radius: 16px; font-weight: 700; font-size: 16px; transition: all 0.2s ease; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);">
              Join Meeting Room
            </a>
          </div>
          
          <p style="font-size: 14px; line-height: 1.6; color: #64748b; text-align: center; margin: 0;">
            Get ready to collaborate. This link will take you directly to the shared canvas and real-time tools.
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; font-weight: 600; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
            Pencil.io — Creative Collaboration Platform
          </p>
        </div>
      </div>
    `,
  });

  logger.info({ count: emails.length }, "Invitation emails sent");
}

async function sendVerificationEmail(email: string, token: string) {
  const verificationLink = `${process.env.FRONTEND_URL}/verify?token=${token}`;

  await transporter.sendMail({
    from: `"Pencil.io" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your Pencil.io account",
    html: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
        <div style="padding: 48px 40px; text-align: center;">
          <div style="width: 64px; height: 64px; background: #4f46e5; border-radius: 16px; margin: 0 auto 32px auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: bold;">
            P
          </div>
          <h1 style="color: #1e293b; font-size: 32px; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.02em;">Welcome to Pencil!</h1>
          <p style="font-size: 16px; line-height: 1.6; color: #64748b; margin: 0 0 40px 0;">
            We're excited to have you join our creative community. Please verify your email to get started.
          </p>
          <a href="${verificationLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 18px 48px; text-decoration: none; border-radius: 16px; font-weight: 700; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);">
            Verify Email Address
          </a>
        </div>
        <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; font-weight: 600; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
            Pencil.io — Creative Collaboration Platform
          </p>
        </div>
      </div>
    `,
  });

  logger.info({ email }, "Verification email sent");
}

async function sendSummaryEmail(
  emails: string[],
  summary: string,
  roomName: string,
  tasks: Array<{ title: string; assigneeEmail?: string }> = []
) {
  const safeRoomName = escapeHtml(roomName);
  const safeSummary = escapeHtml(summary).replace(/\n/g, "<br/>");

  const tasksHtml =
    tasks.length > 0
      ? `
      <div style="margin-bottom: 40px;">
        <h2 style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Action Items</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${tasks
            .map(
              (t) => `
            <div style="padding: 16px; background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; margin-bottom: 8px;">
              <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">${escapeHtml(t.title)}</div>
              ${
                t.assigneeEmail
                  ? `<div style="font-size: 11px; color: #4f46e5; font-weight: 700; text-transform: uppercase;">Assigned to: ${escapeHtml(t.assigneeEmail.split("@")[0] as string)}</div>`
                  : ""
              }
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
      : "";

  await transporter.sendMail({
    from: `"Pencil.io" <${process.env.SMTP_USER}>`,
    bcc: emails.join(", "),
    subject: `Meeting Summary: ${roomName}`,
    html: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border: 1px solid #f1f5f9;">
        <div style="background: #1e293b; padding: 48px 40px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.02em;">
            Session Summary
          </h1>
          <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 16px;">Highlights from ${safeRoomName}</p>
        </div>
        
        <div style="padding: 40px;">
          <div style="background-color: #f8fafc; border-radius: 20px; padding: 32px; margin-bottom: 40px; border: 1px solid #f1f5f9; color: #334155; line-height: 1.8; font-size: 15px;">
            ${safeSummary}
          </div>

          ${tasksHtml}

          <div style="text-align: center; padding-top: 24px; border-top: 1px solid #f1f5f9;">
            <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin-bottom: 24px;">
              View the full activity log and canvas state in your dashboard.
            </p>
            <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: #f1f5f9; color: #4f46e5; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
              Open Dashboard →
            </a>
          </div>
        </div>
        
        <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="font-size: 12px; font-weight: 600; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
            Pencil.io — Creative Collaboration Platform
          </p>
        </div>
      </div>
    `,
  });

  logger.info({ count: emails.length }, "Summary email sent to participants");
}
