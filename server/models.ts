import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    secondaryEmails: [{ type: String, lowercase: true, trim: true }],
    passwordHash: { type: String, required: false, default: '' },
    googleId: { type: String, default: undefined, sparse: true, index: true },
    authProviders: [{ type: String, enum: ['local', 'google'] }],
    avatarUrl: { type: String, default: '' },
    role: { type: String, enum: ['learner', 'admin', 'super_admin'], default: 'learner', index: true },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    organization: { type: String, default: '', trim: true, maxlength: 150 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
UserSchema.index({ secondaryEmails: 1 });
UserSchema.index({ role: 1, createdAt: -1 });
UserSchema.index({ role: 1, active: 1 });

const PasswordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    portal: { type: String, enum: ['admin', 'learner'], default: 'learner' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CourseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    shortDescription: { type: String, required: true, trim: true, maxlength: 500 },
    fullDescription: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'GHS', uppercase: true, trim: true },
    objectives: [{ type: String }],
    outcomes: [{ type: String }],
    published: { type: Boolean, default: false, index: true },
    ratingsEnabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
    focusKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);
CourseSchema.index({ published: 1, order: 1, createdAt: -1 });

const ModuleSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '' },
    order: { type: Number, default: 1 },
  },
  { timestamps: true }
);
ModuleSchema.index({ courseId: 1, order: 1 });

const LessonSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, default: '' },
    youtubeUrl: { type: String, default: '', trim: true },
    duration: { type: String, default: '', trim: true },
    order: { type: Number, default: 1 },
    published: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
LessonSchema.index({ moduleId: 1, order: 1 });
LessonSchema.index({ courseId: 1, published: 1, order: 1 });
LessonSchema.index({ moduleId: 1, published: 1, order: 1 });

const EnrolmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
    activatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
EnrolmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });
EnrolmentSchema.index({ status: 1, courseId: 1 });
EnrolmentSchema.index({ userId: 1, status: 1, activatedAt: -1 });

const PaymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    originalAmount: { type: Number, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    couponCode: { type: String, default: '', uppercase: true, trim: true },
    currency: { type: String, default: 'GHS', uppercase: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'abandoned', 'refunded'],
      default: 'pending',
      index: true,
    },
    provider: { type: String, default: 'paystack' },
    mode: { type: String, enum: ['test', 'live'], default: 'test' },
    channel: { type: String, default: '' },
    gatewayResponse: { type: String, default: '' },
    verifiedAt: { type: Date },
    processedEvents: [{ type: String }],
    refundAmount: { type: Number, min: 0 },
    refundReference: { type: String, default: '' },
    refundReason: { type: String, default: '', maxlength: 500 },
    refundedAt: { type: Date },
    refundedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });

const LessonProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
LessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
LessonProgressSchema.index({ userId: 1, courseId: 1 });

const SupportTicketSchema = new Schema(
  {
    referenceNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ['Course Question', 'Topic Clarification', 'Technical Issue', 'Complaint', 'Feedback'],
      default: 'Course Question',
    },
    description: { type: String, required: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Answered', 'Closed'],
      default: 'Open',
      index: true,
    },
  },
  { timestamps: true }
);
SupportTicketSchema.index({ status: 1, updatedAt: -1 });
SupportTicketSchema.index({ userId: 1, updatedAt: -1 });
SupportTicketSchema.index({ courseId: 1, status: 1 });

const SupportMessageSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['learner', 'admin'], required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true }
);
SupportMessageSchema.index({ ticketId: 1, createdAt: 1 });

const LeadSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 140 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', trim: true, maxlength: 50 },
    company: { type: String, default: '', trim: true, maxlength: 160 },
    interestType: {
      type: String,
      enum: ['service', 'product', 'course', 'consultation', 'general'],
      default: 'general',
      index: true,
    },
    interestSlug: { type: String, default: '', trim: true },
    interestName: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, required: true, maxlength: 4000 },
    budgetRange: { type: String, default: '', trim: true, maxlength: 100 },
    preferredContact: {
      type: String,
      enum: ['Email', 'Phone', 'WhatsApp'],
      default: 'Email',
    },
    consentGiven: { type: Boolean, required: true },
    consentTimestamp: { type: Date, default: Date.now },
    source: { type: String, default: 'direct', trim: true, index: true },
    landingPage: { type: String, default: '', trim: true },
    referringUrl: { type: String, default: '', trim: true },
    utmSource: { type: String, default: '', trim: true },
    utmMedium: { type: String, default: '', trim: true },
    utmCampaign: { type: String, default: '', trim: true },
    utmTerm: { type: String, default: '', trim: true },
    utmContent: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Interested', 'Qualified', 'Proposal Sent', 'Negotiation', 'Converted', 'Lost'],
      default: 'New',
      index: true,
    },
    outcomeReason: { type: String, default: '', trim: true, maxlength: 500 },
    followUpDate: { type: Date, index: true },
    fingerprint: { type: String, index: true },
  },
  { timestamps: true }
);
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1, createdAt: -1 });

const LeadActivitySchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adminName: { type: String, required: true },
    type: {
      type: String,
      enum: ['note', 'call', 'email', 'whatsapp', 'meeting', 'status_change'],
      default: 'note',
    },
    content: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);
LeadActivitySchema.index({ leadId: 1, createdAt: -1 });

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, default: 'Software Product', trim: true },
    shortDescription: { type: String, required: true, maxlength: 500 },
    fullDescription: { type: String, default: '' },
    features: [{ type: String }],
    benefits: [{ type: String }],
    images: [{ type: String }],
    demoLink: { type: String, default: '' },
    pricingStatus: { type: String, default: 'Contact for Pricing' },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
    focusKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);
ProductSchema.index({ published: 1, order: 1, createdAt: 1 });

const ServiceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    shortDescription: { type: String, required: true, maxlength: 500 },
    overview: { type: String, default: '' },
    problemsAddressed: [{ type: String }],
    deliverables: [{ type: String }],
    ctaLabel: { type: String, default: 'Request Consultation' },
    coverImage: { type: String, default: '' },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
    focusKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);
ServiceSchema.index({ published: 1, order: 1, createdAt: 1 });

const ArticleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    excerpt: { type: String, default: '', maxlength: 500 },
    content: { type: String, required: true },
    featuredImage: { type: String, default: '' },
    category: { type: String, default: 'Engineering', trim: true, index: true },
    tags: [{ type: String }],
    authorName: { type: String, default: 'NexaFlow Editorial', trim: true },
    publishedAt: { type: Date },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    readingTimeMinutes: { type: Number, default: 1 },
    internalLinks: [
      {
        label: String,
        href: String,
      },
    ],
    ctaLabel: { type: String, default: '' },
    ctaHref: { type: String, default: '' },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
    focusKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);
ArticleSchema.index({ status: 1, publishedAt: -1, createdAt: -1 });
ArticleSchema.index({ status: 1, category: 1, publishedAt: -1 });

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['article', 'product', 'course'], default: 'article' },
  },
  { timestamps: true }
);

const TagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

const SiteSettingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    businessName: { type: String, default: 'NexaFlow Technologies' },
    descriptor: { type: String, default: 'AI, Data & Digital Solutions' },
    tagline: { type: String, default: 'Innovate • Automate • Transform' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    generalLocation: { type: String, default: '' },
    serviceAreas: { type: String, default: '' },
    businessHours: { type: String, default: '' },
    socialLinks: {
      linkedin: { type: String, default: '' },
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      x: { type: String, default: '' },
    },
    googleBusinessProfileUrl: { type: String, default: '' },
    heroHeadline: { type: String, default: '' },
    heroSubheadline: { type: String, default: '' },
    aboutIntro: { type: String, default: '' },
    mission: { type: String, default: '' },
    vision: { type: String, default: '' },
    values: [{ type: String }],
    legalPrivacy: { type: String, default: '' },
    legalTerms: { type: String, default: '' },
    legalCookies: { type: String, default: '' },
    legalRefund: { type: String, default: '' },
    gaMeasurementId: { type: String, default: '' },
    gscVerificationTag: { type: String, default: '' },
    retentionDays: { type: Number, default: 730 },
    seoSiteTitle: {
      type: String,
      default: 'NexaFlow Technologies | AI, Data & Digital Solutions',
    },
    seoTitleSuffix: { type: String, default: 'NexaFlow Technologies' },
    seoDefaultDescription: {
      type: String,
      default:
        'NexaFlow Technologies delivers AI automation, custom web development, data analytics, applied machine learning, and practical online training.',
    },
    seoDefaultKeywords: {
      type: String,
      default: 'AI automation, web development, data analytics, machine learning, NexaFlow Technologies',
    },
    seoOgTitle: {
      type: String,
      default: 'NexaFlow Technologies | AI, Data & Digital Solutions',
    },
    seoOgDescription: {
      type: String,
      default:
        'Intelligent systems, reliable data, and practical digital engineering powered by NexaFlow Technologies.',
    },
    seoOgImage: { type: String, default: '/og-image.png' },
    seoTwitterCard: {
      type: String,
      enum: ['summary_large_image', 'summary'],
      default: 'summary_large_image',
    },
    seoTwitterSite: { type: String, default: '' },
    seoCanonicalBaseUrl: { type: String, default: '' },
    seoRobotsDefault: {
      type: String,
      enum: ['index, follow', 'noindex, nofollow'],
      default: 'index, follow',
    },
    seoStructuredDataEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SEOSettingsSchema = new Schema(
  {
    pageKey: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },
    ogTitle: { type: String, default: '' },
    ogDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
    focusKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    targetRole: { type: String, enum: ['learner', 'admin'], required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);
NotificationSchema.index({ targetRole: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, targetRole: 1, createdAt: -1 });

const AdminActivitySchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: '' },
    details: { type: String, default: '' },
  },
  { timestamps: true }
);
AdminActivitySchema.index({ createdAt: -1 });

const AnalyticsEventSchema = new Schema(
  {
    eventType: { type: String, required: true, index: true },
    path: { type: String, default: '/' },
    entitySlug: { type: String, default: '' },
    referrer: { type: String, default: '' },
    utmSource: { type: String, default: '' },
  },
  { timestamps: true }
);
AnalyticsEventSchema.index({ createdAt: -1 });
AnalyticsEventSchema.index({ eventType: 1, createdAt: -1 });
AnalyticsEventSchema.index({ eventType: 1, path: 1 });

const WorkShowcaseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    clientName: { type: String, default: '', trim: true, maxlength: 140 },
    industry: { type: String, default: '', trim: true, maxlength: 100 },
    category: { type: String, default: 'AI Automation', trim: true, maxlength: 100 },
    summary: { type: String, required: true, maxlength: 12000 },
    outcomes: [{ type: String }],
    technologies: [{ type: String }],
    imageUrl: { type: String, default: '' },
    projectUrl: { type: String, default: '' },
    featured: { type: Boolean, default: true, index: true },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
WorkShowcaseSchema.index({ published: 1, featured: -1, order: 1, createdAt: -1 });

const TestimonialSchema = new Schema(
  {
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    authorRole: { type: String, default: '', trim: true, maxlength: 120 },
    company: { type: String, default: '', trim: true, maxlength: 140 },
    quote: { type: String, required: true, maxlength: 1500 },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    workTitle: { type: String, default: '', trim: true, maxlength: 160 },
    featured: { type: Boolean, default: true, index: true },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);
TestimonialSchema.index({ published: 1, featured: -1, order: 1, createdAt: -1 });

const CourseReviewSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', trim: true, maxlength: 140 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    completedCourse: { type: Boolean, default: false },
    status: { type: String, enum: ['published', 'hidden'], default: 'published', index: true },
  },
  { timestamps: true }
);
CourseReviewSchema.index({ courseId: 1, userId: 1 }, { unique: true });
CourseReviewSchema.index({ courseId: 1, status: 1, createdAt: -1 });
CourseReviewSchema.index({ status: 1, createdAt: -1 });

const OAuthPollResultSchema = new Schema(
  {
    nonce: { type: String, required: true, unique: true, index: true },
    ok: { type: Boolean, required: true },
    exchangeToken: { type: String, default: '' },
    portal: { type: String, enum: ['admin', 'learner'], default: 'learner' },
    error: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
OAuthPollResultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
export const Course = mongoose.models.Course || mongoose.model('Course', CourseSchema);
export const Module = mongoose.models.Module || mongoose.model('Module', ModuleSchema);
export const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
export const Enrolment = mongoose.models.Enrolment || mongoose.model('Enrolment', EnrolmentSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
export const LessonProgress =
  mongoose.models.LessonProgress || mongoose.model('LessonProgress', LessonProgressSchema);
export const SupportTicket =
  mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema);
export const SupportMessage =
  mongoose.models.SupportMessage || mongoose.model('SupportMessage', SupportMessageSchema);
export const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
export const LeadActivity =
  mongoose.models.LeadActivity || mongoose.model('LeadActivity', LeadActivitySchema);
export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
export const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);
export const Article = mongoose.models.Article || mongoose.model('Article', ArticleSchema);
export const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
export const Tag = mongoose.models.Tag || mongoose.model('Tag', TagSchema);
export const SiteSettings =
  mongoose.models.SiteSettings || mongoose.model('SiteSettings', SiteSettingsSchema);
export const SEOSettings =
  mongoose.models.SEOSettings || mongoose.model('SEOSettings', SEOSettingsSchema);
export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const AdminActivity =
  mongoose.models.AdminActivity || mongoose.model('AdminActivity', AdminActivitySchema);
export const AnalyticsEvent =
  mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', AnalyticsEventSchema);
export const WorkShowcase =
  mongoose.models.WorkShowcase || mongoose.model('WorkShowcase', WorkShowcaseSchema);
export const Testimonial =
  mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);
const CouponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, default: '', trim: true, maxlength: 240 },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    maxUses: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
CouponSchema.index({ active: 1, expiresAt: 1 });

export const CourseReview =
  mongoose.models.CourseReview || mongoose.model('CourseReview', CourseReviewSchema);
export const OAuthPollResult =
  mongoose.models.OAuthPollResult || mongoose.model('OAuthPollResult', OAuthPollResultSchema);
export const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);

