import crypto from 'crypto';
import { Request, Router } from 'express';
import { connectDB, isDBConfigured } from '../db.js';
import { getBaseUrl, requireAuth, requireDatabase } from '../middleware/auth.js';
import { Coupon, Course, Enrolment, Notification, Payment, User } from '../models.js';
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

async function activateEnrolmentFromVerifiedPayment(params: {
  paymentDoc: InstanceType<typeof Payment>;
  status: 'success' | 'failed' | 'abandoned';
  channel?: string;
  gatewayResponse?: string;
  eventKey?: string;
}) {
  const { paymentDoc, status, channel, gatewayResponse, eventKey } = params;

  if (eventKey && paymentDoc.processedEvents.includes(eventKey)) {
    return { alreadyProcessed: true };
  }

  if (paymentDoc.status === 'success' && status === 'success') {
    if (eventKey && !paymentDoc.processedEvents.includes(eventKey)) {
      paymentDoc.processedEvents.push(eventKey);
      await paymentDoc.save();
    }
    return { alreadyProcessed: true };
  }

  paymentDoc.status = status;
  if (channel) paymentDoc.channel = channel;
  if (gatewayResponse) paymentDoc.gatewayResponse = gatewayResponse;
  if (status === 'success') {
    paymentDoc.verifiedAt = new Date();
  }
  if (eventKey) {
    paymentDoc.processedEvents.push(eventKey);
  }
  await paymentDoc.save();

  if (status !== 'success') {
    return { alreadyProcessed: false, activated: false };
  }

  // Increment coupon usage atomically only on first verified transition to 'success'
  if (paymentDoc.couponCode) {
    await Coupon.updateOne({ code: paymentDoc.couponCode }, { $inc: { usedCount: 1 } });
  }

  // Idempotent enrolment upsert
  await Enrolment.findOneAndUpdate(
    { userId: paymentDoc.userId, courseId: paymentDoc.courseId },
    {
      userId: paymentDoc.userId,
      courseId: paymentDoc.courseId,
      paymentId: paymentDoc._id,
      status: 'active',
      activatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  const [course, learner] = await Promise.all([
    Course.findById(paymentDoc.courseId).lean(),
    User.findById(paymentDoc.userId).lean(),
  ]);

  const courseTitle = (course as { title?: string; slug?: string } | null)?.title || 'Course';
  const courseSlug = (course as { slug?: string } | null)?.slug || '';
  const learnerName = (learner as { name?: string; email?: string } | null)?.name || 'Learner';
  const learnerEmail = (learner as { email?: string } | null)?.email || '';

  await Promise.all([
    Notification.create({
      userId: paymentDoc.userId,
      targetRole: 'learner',
      title: `Payment Confirmed & Enrolment Active`,
      message: `Your payment (${paymentDoc.currency} ${paymentDoc.amount}) for "${courseTitle}" is verified.`,
      link: `/learner/courses/${courseSlug}`,
    }),
    Notification.create({
      targetRole: 'admin',
      title: `Verified Payment: ${paymentDoc.currency} ${paymentDoc.amount}`,
      message: `${learnerName} enrolled in "${courseTitle}"${paymentDoc.couponCode ? ` with coupon ${paymentDoc.couponCode}` : ''} (Ref: ${paymentDoc.reference}).`,
      link: '/portal-admin?tab=payments',
    }),
  ]);

  if (learnerEmail) {
    await sendTransactionalEmail({
      to: learnerEmail,
      subject: `Enrolment Confirmed: ${courseTitle} — NexaFlow Learn`,
      text: `Hello ${learnerName},\n\nYour payment reference ${paymentDoc.reference} (${paymentDoc.currency} ${paymentDoc.amount}) has been verified and your enrolment in "${courseTitle}" is now active.\n\nYou can start learning from your Learner Dashboard.`,
    });
  }

  return { alreadyProcessed: false, activated: true };
}

router.post('/initialize', requireDatabase, requireAuth, async (req, res) => {
  try {
    const { courseId, couponCode } = req.body || {};
    if (!courseId) return res.status(400).json({ error: 'Course ID is required.' });

    const course = await Course.findOne({ _id: courseId, published: true }).lean();
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

    if (couponCode && String(couponCode).trim()) {
      const couponCheck = await validateCouponForPricing({
        code: String(couponCode),
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

    const reference = `NF-PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const currency = (c.currency || 'GHS').toUpperCase();
    const amountMinor = Math.round(finalAmount * 100);

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
    console.error('[Payment Initialize] Error:', err);
    return res.status(500).json({ error: 'Unable to initialize checkout right now.' });
  }
});

router.get('/verify/:reference', requireDatabase, requireAuth, async (req, res) => {
  const { reference } = req.params;
  const payment = await Payment.findOne({ reference });
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

  const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
  if (!isAdmin && payment.userId.toString() !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (payment.status === 'success') {
    const course = await Course.findById(payment.courseId).select('title slug').lean();
    return res.json({ status: 'success', verified: true, payment, course });
  }

  const verifyRes = await verifyPaystackTransaction(reference);
  if (!verifyRes.ok) {
    return res.status(502).json({
      error: verifyRes.error || 'Could not verify payment with Paystack.',
      status: payment.status,
    });
  }

  // Validate exact amount, currency, and intended course
  const expectedMinor = Math.round(payment.amount * 100);
  const metaCourseId = String(verifyRes.metadata?.courseId || '');

  if (verifyRes.status === 'success') {
    if (
      (verifyRes.amountMinor ?? 0) < expectedMinor ||
      (verifyRes.currency || '').toUpperCase() !== payment.currency.toUpperCase() ||
      (metaCourseId && metaCourseId !== payment.courseId.toString())
    ) {
      payment.status = 'failed';
      payment.gatewayResponse = 'Verification mismatch (amount/currency/course)';
      await payment.save();
      return res.status(400).json({
        error: 'Payment verification mismatch detected. Enrolment was not activated.',
        status: 'failed',
      });
    }

    await activateEnrolmentFromVerifiedPayment({
      paymentDoc: payment,
      status: 'success',
      channel: verifyRes.channel,
      gatewayResponse: verifyRes.gatewayResponse,
      eventKey: `verify:${reference}`,
    });

    const course = await Course.findById(payment.courseId).select('title slug').lean();
    return res.json({ status: 'success', verified: true, payment, course });
  }

  if (verifyRes.status === 'failed' || verifyRes.status === 'abandoned') {
    await activateEnrolmentFromVerifiedPayment({
      paymentDoc: payment,
      status: verifyRes.status,
      channel: verifyRes.channel,
      gatewayResponse: verifyRes.gatewayResponse,
    });
  }

  res.json({ status: verifyRes.status || payment.status, verified: false, payment });
});

// Paystack Webhook endpoint — authenticates via HMAC-SHA512 signature & processes idempotently
router.post('/webhook', async (req: Request & { rawBody?: Buffer }, res) => {
  if (!isDBConfigured() || !(await connectDB())) {
    return res.status(503).send('Database unavailable');
  }

  const rawBody = req.rawBody;
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  if (!rawBody || !verifyPaystackWebhookSignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body as {
    event?: string;
    data?: {
      id?: number | string;
      reference?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      gateway_response?: string;
      metadata?: Record<string, unknown>;
    };
  };

  if (!event?.event || !event?.data?.reference) {
    return res.status(200).send('Ignored');
  }

  const eventKey = `${event.event}:${event.data.id ?? event.data.reference}`;
  const payment = await Payment.findOne({ reference: event.data.reference });
  if (!payment) {
    return res.status(200).send('Unknown reference');
  }

  if (event.event === 'charge.success') {
    const expectedMinor = Math.round(payment.amount * 100);
    const actualMinor = Number(event.data.amount ?? 0);
    const actualCurrency = String(event.data.currency || '').toUpperCase();

    if (actualMinor >= expectedMinor && actualCurrency === payment.currency.toUpperCase()) {
      await activateEnrolmentFromVerifiedPayment({
        paymentDoc: payment,
        status: 'success',
        channel: event.data.channel,
        gatewayResponse: event.data.gateway_response,
        eventKey,
      });
    }
  } else if (event.event === 'refund.processed') {
    if (!payment.processedEvents.includes(eventKey)) {
      payment.status = 'refunded';
      payment.processedEvents.push(eventKey);
      await payment.save();
      await Enrolment.updateOne(
        { userId: payment.userId, courseId: payment.courseId },
        { $set: { status: 'revoked' } }
      );
    }
  }

  res.status(200).send('OK');
});

export default router;
