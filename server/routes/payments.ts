import crypto from 'crypto';
import { Request, Router } from 'express';
import { connectDB, isDBConfigured } from '../db.js';
import {
  getBaseUrl,
  isValidObjectId,
  paymentLimiter,
  requireAuth,
  requireDatabase,
} from '../middleware/auth.js';
import { Coupon, Course, Enrolment, Notification, Payment, User } from '../models.js';
import { PAYSTACK_REF_RE } from '../shared/validation.js';
import { calculateCouponDiscount, validateCouponForPricing } from '../utils/coupons.js';
import { sendTransactionalEmail } from '../utils/email.js';
import {
  getPaystackMode,
  initializePaystackTransaction,
  isPaystackConfigured,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '../utils/paystack.js';

const router = Router();

export function serializePayment(doc: unknown): Record<string, unknown> {
  const raw =
    doc && typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === 'function'
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : ((doc || {}) as Record<string, unknown>);
  const { processedEvents: _omitted, ...safe } = raw;
  return safe;
}

async function activateEnrolmentFromVerifiedPayment(params: {
  paymentId: string;
  status: 'success' | 'failed' | 'abandoned';
  channel?: string;
  gatewayResponse?: string;
  eventKey?: string;
}) {
  const { paymentId, status, channel, gatewayResponse, eventKey } = params;

  const setFields: Record<string, unknown> = { status };
  if (channel) setFields.channel = channel;
  if (gatewayResponse) setFields.gatewayResponse = gatewayResponse;
  if (status === 'success') setFields.verifiedAt = new Date();

  const guardFilter: Record<string, unknown> = {
    _id: paymentId,
    status: { $nin: ['success', 'refunded'] },
  };
  if (eventKey) {
    guardFilter.processedEvents = { $ne: eventKey };
  }

  // Atomic state transition: only one concurrent caller (verify OR webhook) can win the transition to 'success'
  const transitioned = await Payment.findOneAndUpdate(
    guardFilter,
    {
      $set: setFields,
      ...(eventKey ? { $addToSet: { processedEvents: eventKey } } : {}),
    },
    { new: true }
  );

  if (!transitioned) {
    // Still record idempotent event key if already success and eventKey is new
    if (eventKey) {
      await Payment.updateOne(
        { _id: paymentId, processedEvents: { $ne: eventKey } },
        { $addToSet: { processedEvents: eventKey } }
      );
    }
    const latest = await Payment.findById(paymentId);
    return { alreadyProcessed: true, activated: false, payment: latest };
  }

  if (status !== 'success') {
    return { alreadyProcessed: false, activated: false, payment: transitioned };
  }

  // Atomic coupon increment bounded by maxUses
  if (transitioned.couponCode) {
    await Coupon.findOneAndUpdate(
      {
        code: transitioned.couponCode,
        $or: [{ maxUses: { $lte: 0 } }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
      },
      { $inc: { usedCount: 1 } }
    );
  }

  // Idempotent enrolment upsert
  await Enrolment.findOneAndUpdate(
    { userId: transitioned.userId, courseId: transitioned.courseId },
    {
      userId: transitioned.userId,
      courseId: transitioned.courseId,
      paymentId: transitioned._id,
      status: 'active',
      activatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  const [course, learner] = await Promise.all([
    Course.findById(transitioned.courseId).lean(),
    User.findById(transitioned.userId).lean(),
  ]);

  const courseTitle = (course as { title?: string; slug?: string } | null)?.title || 'Course';
  const courseSlug = (course as { slug?: string } | null)?.slug || '';
  const learnerName = (learner as { name?: string; email?: string } | null)?.name || 'Learner';
  const learnerEmail = (learner as { email?: string } | null)?.email || '';

  await Promise.all([
    Notification.create({
      userId: transitioned.userId,
      targetRole: 'learner',
      title: 'Payment Confirmed & Enrolment Active',
      message: `Your payment (${transitioned.currency} ${transitioned.amount}) for "${courseTitle}" is verified.`,
      link: `/learner/courses/${courseSlug}`,
    }),
    Notification.create({
      targetRole: 'admin',
      title: `Verified Payment: ${transitioned.currency} ${transitioned.amount}`,
      message: `${learnerName} enrolled in "${courseTitle}"${transitioned.couponCode ? ` with coupon ${transitioned.couponCode}` : ''} (Ref: ${transitioned.reference}).`,
      link: '/portal-admin?tab=payments',
    }),
  ]);

  if (learnerEmail) {
    await sendTransactionalEmail({
      to: learnerEmail,
      subject: `Enrolment Confirmed: ${courseTitle} — NexaFlow Learn`,
      text: `Hello ${learnerName},\n\nYour payment reference ${transitioned.reference} (${transitioned.currency} ${transitioned.amount}) has been verified and your enrolment in "${courseTitle}" is now active.\n\nYou can start learning from your Learner Dashboard.`,
    });
  }

  return { alreadyProcessed: false, activated: true, payment: transitioned };
}

router.post('/initialize', paymentLimiter, requireDatabase, requireAuth, async (req, res) => {
  try {
    const rawCourseId = String(req.body?.courseId || '').trim();
    const couponCode = req.body?.couponCode ? String(req.body.couponCode).trim() : '';

    if (!isValidObjectId(rawCourseId)) {
      return res.status(400).json({ error: 'Valid course identifier is required.' });
    }

    const course = await Course.findOne({ _id: rawCourseId, published: true }).lean();
    if (!course) return res.status(404).json({ error: 'Course not found or unpublished.' });

    const c = course as {
      _id: { toString(): string };
      title: string;
      slug: string;
      price: number;
      currency: string;
    };
    if (c.price <= 0) {
      return res
        .status(400)
        .json({ error: 'This course is free and does not require Paystack checkout.' });
    }

    const existingEnrolment = await Enrolment.findOne({
      userId: req.user!.id,
      courseId: c._id,
      status: 'active',
    }).lean();
    if (existingEnrolment) {
      return res.status(400).json({ error: 'You are already enrolled in this course.' });
    }

    let appliedCode = '';
    let discountPercent = 0;
    let originalAmount = c.price;
    let discountAmount = 0;
    let finalAmount = c.price;

    if (couponCode) {
      const couponCheck = await validateCouponForPricing({
        code: couponCode,
        courseId: c._id.toString(),
      });
      if (!couponCheck.ok) {
        return res.status(couponCheck.status).json({ error: couponCheck.error });
      }
      const pricing = calculateCouponDiscount(c.price, couponCheck.coupon.discountPercent);
      appliedCode = couponCheck.coupon.code;
      discountPercent = pricing.discountPercent;
      originalAmount = pricing.originalAmount;
      discountAmount = pricing.discountAmount;
      finalAmount = pricing.finalAmount;

      if (finalAmount <= 0) {
        return res.json({
          freeWithCoupon: true,
          couponCode: appliedCode,
          discountPercent,
          originalAmount,
          finalAmount: 0,
        });
      }
    }

    if (!isPaystackConfigured()) {
      return res.status(503).json({
        error:
          'Paystack payment gateway is not configured yet. Set PAYSTACK_SECRET_KEY in server environment variables.',
        code: 'PAYSTACK_NOT_CONFIGURED',
      });
    }

    const reference = `NF-PAY-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const currency = (c.currency || 'GHS').toUpperCase();
    const amountMinor = Math.round(finalAmount * 100);

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return res.status(400).json({ error: 'Computed payable amount is invalid.' });
    }

    const payment = await Payment.create({
      userId: req.user!.id,
      courseId: c._id,
      reference,
      amount: finalAmount,
      originalAmount,
      discountAmount,
      discountPercent,
      couponCode: appliedCode,
      currency,
      status: 'pending',
      provider: 'paystack',
      mode: getPaystackMode(),
    });

    const origin = getBaseUrl(req);
    const callbackUrl = `${origin.replace(/\/$/, '')}/learner/payment/verify?reference=${encodeURIComponent(reference)}`;

    const initResult = await initializePaystackTransaction({
      email: req.user!.email,
      amountMinor,
      currency,
      reference,
      callbackUrl,
      metadata: {
        userId: req.user!.id,
        courseId: c._id.toString(),
        courseTitle: c.title,
        paymentId: payment._id.toString(),
        couponCode: appliedCode || undefined,
      },
    });

    if (!initResult.ok || !initResult.authorizationUrl) {
      payment.status = 'failed';
      payment.gatewayResponse = initResult.error || 'Initialization failed';
      await payment.save();
      return res.status(502).json({
        error: initResult.error || 'Unable to initialize Paystack checkout.',
      });
    }

    return res.json({
      authorizationUrl: initResult.authorizationUrl,
      reference,
      mode: getPaystackMode(),
      amount: finalAmount,
      couponCode: appliedCode || undefined,
      discountPercent,
    });
  } catch (err) {
    console.error('[Payment Initialize] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Unable to initialize checkout right now.' });
  }
});

router.get('/verify/:reference', paymentLimiter, requireDatabase, requireAuth, async (req, res) => {
  const reference = String(req.params.reference || '').trim();
  if (!PAYSTACK_REF_RE.test(reference)) {
    return res.status(400).json({ error: 'Invalid payment reference format.' });
  }

  const payment = await Payment.findOne({ reference });
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  if (!isAdmin && payment.userId.toString() !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (payment.status === 'success' || payment.status === 'refunded') {
    const course = await Course.findById(payment.courseId).select('title slug').lean();
    return res.json({
      status: payment.status,
      verified: payment.status === 'success',
      payment: serializePayment(payment),
      course,
    });
  }

  const verifyRes = await verifyPaystackTransaction(reference);
  if (!verifyRes.ok) {
    return res.status(502).json({
      error: verifyRes.error || 'Could not verify payment with Paystack.',
      status: payment.status,
    });
  }

  // Strictly validate exact amount, currency, intended courseId, and intended userId
  const expectedMinor = Math.round(payment.amount * 100);
  const actualMinor = Math.round(Number(verifyRes.amountMinor ?? 0));
  const actualCurrency = String(verifyRes.currency || '').toUpperCase();
  const metaCourseId = verifyRes.metadata?.courseId ? String(verifyRes.metadata.courseId) : '';
  const metaUserId = verifyRes.metadata?.userId ? String(verifyRes.metadata.userId) : '';

  if (verifyRes.status === 'success') {
    const amountMatches = actualMinor === expectedMinor;
    const currencyMatches = actualCurrency === payment.currency.toUpperCase();
    const courseMatches = !metaCourseId || metaCourseId === payment.courseId.toString();
    const userMatches = !metaUserId || metaUserId === payment.userId.toString();

    if (!amountMatches || !currencyMatches || !courseMatches || !userMatches) {
      await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'pending' },
        {
          $set: {
            status: 'failed',
            gatewayResponse: 'Verification mismatch (amount/currency/metadata)',
          },
        }
      );
      await Notification.create({
        targetRole: 'admin',
        title: `Security Alert: Payment Verification Mismatch`,
        message: `Reference ${reference} failed integrity checks (expected ${payment.currency} ${expectedMinor}, got ${actualCurrency} ${actualMinor}).`,
        link: '/portal-admin?tab=payments',
      });
      return res.status(400).json({
        error: 'Payment verification mismatch detected. Enrolment was not activated.',
        status: 'failed',
      });
    }

    const result = await activateEnrolmentFromVerifiedPayment({
      paymentId: payment._id.toString(),
      status: 'success',
      channel: verifyRes.channel,
      gatewayResponse: verifyRes.gatewayResponse,
      eventKey: `verify:${reference}`,
    });

    const course = await Course.findById(payment.courseId).select('title slug').lean();
    return res.json({
      status: 'success',
      verified: true,
      payment: serializePayment(result.payment || payment),
      course,
    });
  }

  if (verifyRes.status === 'failed' || verifyRes.status === 'abandoned') {
    const result = await activateEnrolmentFromVerifiedPayment({
      paymentId: payment._id.toString(),
      status: verifyRes.status,
      channel: verifyRes.channel,
      gatewayResponse: verifyRes.gatewayResponse,
    });
    return res.json({
      status: verifyRes.status,
      verified: false,
      payment: serializePayment(result.payment || payment),
    });
  }

  return res.json({
    status: verifyRes.status || payment.status,
    verified: false,
    payment: serializePayment(payment),
  });
});

// Paystack Webhook endpoint — authenticates via HMAC-SHA512 signature & processes idempotently
router.post('/webhook', async (req: Request & { rawBody?: Buffer }, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.status(503).send('Database unavailable');
  }

  const rawBody = req.rawBody;
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  if (!rawBody || !verifyPaystackWebhookSignature(rawBody, signature)) {
    if (signature) {
      await Notification.create({
        targetRole: 'admin',
        title: 'Security Alert: Invalid Paystack Webhook Signature',
        message: `Rejected an unsigned or forged Paystack webhook request from IP ${req.ip || 'unknown'}.`,
        link: '/portal-admin?tab=payments',
      }).catch(() => {});
    }
    return res.status(401).send('Invalid signature');
  }

  const event = req.body as {
    event?: string;
    data?: {
      id?: number | string;
      reference?: string;
      transaction_reference?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      gateway_response?: string;
      metadata?: Record<string, unknown>;
    };
  };

  const eventName = event?.event;
  const txReference = event?.data?.reference || event?.data?.transaction_reference;
  if (!eventName || !txReference || !PAYSTACK_REF_RE.test(String(txReference))) {
    return res.status(200).send('Ignored');
  }

  const allowedEvents = new Set(['charge.success', 'charge.failed', 'refund.processed', 'refund.failed']);
  if (!allowedEvents.has(eventName)) {
    return res.status(200).send('Ignored');
  }

  const eventKey = `${eventName}:${event.data?.id ?? txReference}`;
  const payment = await Payment.findOne({ reference: txReference });
  if (!payment) {
    return res.status(200).send('Unknown reference');
  }

  if (eventName === 'charge.success') {
    const expectedMinor = Math.round(payment.amount * 100);
    const actualMinor = Math.round(Number(event.data?.amount ?? 0));
    const actualCurrency = String(event.data?.currency || '').toUpperCase();
    const metaCourseId = event.data?.metadata?.courseId ? String(event.data.metadata.courseId) : '';
    const metaUserId = event.data?.metadata?.userId ? String(event.data.metadata.userId) : '';

    const amountMatches = actualMinor === expectedMinor;
    const currencyMatches = actualCurrency === payment.currency.toUpperCase();
    const courseMatches = !metaCourseId || metaCourseId === payment.courseId.toString();
    const userMatches = !metaUserId || metaUserId === payment.userId.toString();

    if (amountMatches && currencyMatches && courseMatches && userMatches) {
      await activateEnrolmentFromVerifiedPayment({
        paymentId: payment._id.toString(),
        status: 'success',
        channel: event.data?.channel,
        gatewayResponse: event.data?.gateway_response,
        eventKey,
      });
    } else {
      await Notification.create({
        targetRole: 'admin',
        title: `Webhook Integrity Warning: ${txReference}`,
        message: `Webhook charge.success discarded due to amount/currency/metadata mismatch.`,
        link: '/portal-admin?tab=payments',
      });
    }
  } else if (eventName === 'charge.failed') {
    await activateEnrolmentFromVerifiedPayment({
      paymentId: payment._id.toString(),
      status: 'failed',
      channel: event.data?.channel,
      gatewayResponse: event.data?.gateway_response || 'Charge failed via webhook',
      eventKey,
    });
  } else if (eventName === 'refund.processed') {
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, processedEvents: { $ne: eventKey } },
      {
        $set: {
          status: 'refunded',
          refundedAt: payment.refundedAt || new Date(),
          ...(event.data?.amount ? { refundAmount: Number(event.data.amount) / 100 } : {}),
        },
        $addToSet: { processedEvents: eventKey },
      },
      { new: true }
    );
    if (updated) {
      await Enrolment.updateOne(
        { userId: payment.userId, courseId: payment.courseId },
        { $set: { status: 'revoked' } }
      );
      await Notification.create({
        userId: payment.userId,
        targetRole: 'learner',
        title: 'Payment Refunded',
        message: `Your refund for payment reference ${payment.reference} has been processed.`,
        link: '/learner?tab=payments',
      });
    }
  } else if (eventName === 'refund.failed') {
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, processedEvents: { $ne: eventKey } },
      { $addToSet: { processedEvents: eventKey } },
      { new: true }
    );
    if (updated) {
      await Notification.create({
        targetRole: 'admin',
        title: `Paystack Refund Failed: ${payment.reference}`,
        message: `Paystack reported a refund failure for reference ${payment.reference}. Review inside Paystack Dashboard.`,
        link: '/portal-admin?tab=payments',
      });
    }
  }

  return res.status(200).send('OK');
});

export default router;
