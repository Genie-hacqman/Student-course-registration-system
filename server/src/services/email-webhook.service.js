import { Op } from 'sequelize';
import { Resend } from 'resend';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { EmailDelivery } from '../models/index.js';
import { AppError, BadRequestError } from '../utils/errors.js';
import { EMAIL_STATUS } from '../utils/constants.js';
import { buildPagination } from '../utils/pagination.js';

const EVENT_STATUS = {
  'email.delivered': EMAIL_STATUS.DELIVERED,
  'email.delivery_delayed': EMAIL_STATUS.DELIVERY_DELAYED,
  'email.bounced': EMAIL_STATUS.BOUNCED,
  'email.complained': EMAIL_STATUS.COMPLAINED,
  'email.failed': EMAIL_STATUS.FAILED,
};
const FINAL = [EMAIL_STATUS.DELIVERED, EMAIL_STATUS.BOUNCED, EMAIL_STATUS.COMPLAINED];

export const verifyEvent = (rawBody, headers, { secret = env.RESEND_WEBHOOK_SECRET } = {}) => {
  if (!secret) throw new AppError('Email webhooks are not configured (RESEND_WEBHOOK_SECRET)', 503, 'WEBHOOK_NOT_CONFIGURED');
  try {
    return new Resend(env.RESEND_API_KEY || 're_verify_only').webhooks.verify({
      payload: rawBody.toString('utf8'),
      headers: { id: headers['svix-id'], timestamp: headers['svix-timestamp'], signature: headers['svix-signature'] },
      webhookSecret: secret,
    });
  } catch {
    throw new BadRequestError('Invalid webhook signature');
  }
};

export const applyEvent = async (event) => {
  const status = EVENT_STATUS[event?.type];
  const messageId = event?.data?.email_id;
  if (!status || !messageId) return { ignored: true };
  const [updated] = await EmailDelivery.update(
    {
      status,
      lastEventAt: event.created_at ? new Date(event.created_at) : new Date(),
      ...(status === EMAIL_STATUS.BOUNCED || status === EMAIL_STATUS.FAILED
        ? { error: String(event.data?.bounce?.message ?? event.data?.failed?.reason ?? event.type).slice(0, 255) }
        : {}),
    },
    { where: { providerMessageId: messageId, status: { [Op.notIn]: FINAL.filter((s) => s !== status) } } },
  );
  if (!updated) logger.info(`Resend webhook ${event.type}: no matching delivery (or already final)`);
  return { updated };
};

export const listDeliveries = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['createdAt', 'updatedAt'], ['id', 'DESC']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.template) where.template = query.template;
  if (query.search) where.recipient = { [Op.like]: `%${query.search}%` };
  const result = await EmailDelivery.findAndCountAll({
    where,
    attributes: ['id', 'template', 'recipient', 'subject', 'provider', 'status', 'error', 'attempts', 'lastEventAt', 'entityType', 'entityId', 'createdAt', 'updatedAt'],
    limit, offset, order,
  });
  return { result, page, limit };
};
