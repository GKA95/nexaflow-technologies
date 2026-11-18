import { z } from 'zod';

export const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
export const PAYSTACK_REF_RE = /^[A-Za-z0-9._-]{6,100}$/;
export const YOUTUBE_URL_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;

export function stripHtmlForValidation(input: string): string {
  return String(input || '').replace(/<[^>]*>/g, '').trim();
}

export function isSafeUrlOrPath(val: string): boolean {
  const s = val.trim();
  if (!s) return true;
  if (/^(javascript|data|vbscript|file):/i.test(s)) return false;
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidPhoneNumber(val: string): boolean {
  const s = val.trim();
  if (!s) return true;
  if (!/^[+\d()\s.-]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 16;
}

export function isStrongPassword(val: string, minLength = 8): boolean {
  if (val.length < minLength || val.length > 128) return false;
  return /[A-Z]/.test(val) && /[a-z]/.test(val) && /\d/.test(val);
}

export const validObjectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_RE, 'Invalid resource identifier.');

export const safeUrlOrPathSchema = z
  .string()
  .trim()
  .max(500, 'URL cannot exceed 500 characters.')
  .refine(isSafeUrlOrPath, 'Enter a valid http(s) URL or site path starting with /.');

export const safeExternalHttpUrlSchema = z
  .string()
  .trim()
  .max(500, 'URL cannot exceed 500 characters.')
  .refine((val) => {
    if (!val) return true;
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a valid URL starting with https:// or http://.');

export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(40, 'Phone number is too long.')
  .refine(isValidPhoneNumber, 'Enter a valid phone number (7 to 16 digits).');

export const learnerPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password cannot exceed 128 characters.')
  .refine(
    (v) => isStrongPassword(v, 8),
    'Password must include at least one uppercase letter, lowercase letter, and number.'
  );

export const adminPasswordSchema = z
  .string()
  .min(10, 'Administrator password must be at least 10 characters.')
  .max(128, 'Password cannot exceed 128 characters.')
  .refine(
    (v) => isStrongPassword(v, 10),
    'Administrator password must include uppercase, lowercase, and numeric characters.'
  );

export const optionalDateStringSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => {
    if (!v) return true;
    const d = new Date(v);
    return !Number.isNaN(d.getTime());
  }, 'Please enter a valid date.');

// --- Auth & Account Schemas ---
export const loginFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(180),
  password: z.string().min(1, 'Password is required.').max(128),
});

export const registerFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
    email: z.string().trim().email('Enter a valid email address.').max(180),
    phone: optionalPhoneSchema.optional().default(''),
    organization: z.string().trim().max(150, 'Organization name is too long.').optional().default(''),
    password: learnerPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(180),
  portal: z.enum(['admin', 'learner']).optional().default('learner'),
});

export const resetPasswordFormSchema = z
  .object({
    token: z.string().trim().min(16, 'Invalid or missing reset token.').max(256),
    newPassword: learnerPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export const adminSetupFormSchema = z.object({
  setupToken: z.string().max(256).optional().default(''),
  name: z.string().trim().min(2, 'Administrator name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Enter a valid administrator email.').max(180),
  secondaryEmails: z
    .array(z.string().trim().email('Each secondary email must be valid.').max(180))
    .max(10)
    .optional()
    .default([]),
  password: adminPasswordSchema,
});

export const adminRecoveryFormSchema = z.object({
  setupToken: z.string().min(1, 'Server setup token is required.').max(256),
  email: z.string().trim().email('Enter a valid administrator email.').max(180),
  newPassword: adminPasswordSchema,
});

export const learnerProfileSchema = z.object({
  name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  phone: optionalPhoneSchema.optional().default(''),
  organization: z.string().trim().max(150, 'Organization name is too long.').optional().default(''),
});

export const accountEmailsSchema = z.object({
  name: z.string().trim().min(2, 'Display name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Enter a valid primary email address.').max(180),
  secondaryEmails: z
    .array(z.string().trim().email('All additional emails must be valid email addresses.').max(180))
    .max(10, 'Maximum of 10 secondary emails allowed.')
    .optional()
    .default([]),
});

export function buildChangePasswordSchema(isAdminRole: boolean) {
  return z
    .object({
      currentPassword: z.string().max(128).optional().default(''),
      newPassword: isAdminRole ? adminPasswordSchema : learnerPasswordSchema,
      confirmPassword: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.confirmPassword !== undefined && data.newPassword !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmPassword'],
          message: 'Passwords do not match.',
        });
      }
    });
}

// --- Public Schemas ---
export const leadFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(140),
  email: z.string().trim().email('Enter a valid email address.').max(180),
  phone: optionalPhoneSchema.optional().default(''),
  company: z.string().trim().max(160).optional().default(''),
  interestType: z.enum(['service', 'product', 'course', 'consultation', 'general']),
  interestSlug: z.string().trim().max(120).optional().default(''),
  interestName: z.string().trim().min(2, 'Subject or area of interest is required.').max(180),
  description: z
    .string()
    .trim()
    .min(10, 'Please describe your goals or requirements (at least 10 characters).')
    .max(4000, 'Description cannot exceed 4000 characters.'),
  budgetRange: z.string().trim().max(100).optional().default(''),
  preferredContact: z.enum(['Email', 'Phone', 'WhatsApp']).default('Email'),
  consentGiven: z.literal(true, {
    message: 'Please confirm consent so our team can respond to your enquiry.',
  }),
  source: z.string().trim().max(120).optional().default('website'),
  landingPage: z.string().trim().max(500).optional().default(''),
  referringUrl: z.string().trim().max(500).optional().default(''),
  utmSource: z.string().trim().max(120).optional().default(''),
  utmMedium: z.string().trim().max(120).optional().default(''),
  utmCampaign: z.string().trim().max(120).optional().default(''),
  utmTerm: z.string().trim().max(120).optional().default(''),
  utmContent: z.string().trim().max(120).optional().default(''),
  website_hp: z.string().max(200).optional().default(''),
  formStartedAt: z.number().finite().optional(),
});

export const couponValidateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Enter a valid coupon code.')
    .max(40, 'Coupon code cannot exceed 40 characters.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may only contain letters, numbers, hyphens, or underscores.'),
  courseId: validObjectIdSchema.optional(),
});

// --- Learner Schemas ---
export const courseReviewFormSchema = z.object({
  rating: z.number().int('Rating must be a whole star value.').min(1, 'Select at least 1 star.').max(5),
  title: z.string().trim().max(140, 'Headline cannot exceed 140 characters.').optional().default(''),
  comment: z
    .string()
    .trim()
    .min(3, 'Please write a short review (at least 3 characters).')
    .max(2000, 'Review comment cannot exceed 2000 characters.'),
});

export const supportTicketCreateSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters.').max(200),
  category: z.enum([
    'Course Question',
    'Topic Clarification',
    'Technical Issue',
    'Complaint',
    'Feedback',
  ]),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(4000),
  courseId: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || OBJECT_ID_RE.test(v), 'Invalid course selection.'),
});

export const supportReplySchema = z.object({
  message: z.string().trim().min(2, 'Reply message cannot be empty.').max(4000),
});

export const lessonProgressSchema = z.object({
  courseId: validObjectIdSchema,
  lessonId: validObjectIdSchema,
  completed: z.boolean().optional(),
});

// --- Admin CRUD Schemas ---
export const courseWriteSchema = z.object({
  title: z.string().trim().min(3, 'Course title must be at least 3 characters.').max(180),
  slug: z.string().trim().max(200).optional().default(''),
  shortDescription: z
    .string()
    .trim()
    .min(10, 'Short description must be at least 10 characters.')
    .max(500),
  fullDescription: z.string().trim().max(60000).optional().default(''),
  coverImage: safeUrlOrPathSchema.optional().default(''),
  price: z.number().finite('Enter a valid numeric price.').min(0, 'Price cannot be negative.').max(1000000),
  currency: z.enum(['GHS', 'USD', 'NGN', 'KES', 'EUR', 'GBP']).default('GHS'),
  objectives: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  outcomes: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  published: z.boolean().optional().default(false),
  ratingsEnabled: z.boolean().optional().default(true),
  order: z.number().int().min(0).max(9999).optional().default(0),
  seoTitle: z.string().trim().max(180).optional().default(''),
  seoDescription: z.string().trim().max(400).optional().default(''),
  canonicalUrl: safeUrlOrPathSchema.optional().default(''),
  ogImage: safeUrlOrPathSchema.optional().default(''),
  noIndex: z.boolean().optional().default(false),
  focusKeyword: z.string().trim().max(120).optional().default(''),
});

export const moduleWriteSchema = z.object({
  title: z.string().trim().min(2, 'Module title must be at least 2 characters.').max(180),
  description: z.string().trim().max(2000).optional().default(''),
  order: z.number().int().min(0).max(9999).optional(),
});

export const lessonWriteSchema = z.object({
  title: z.string().trim().min(2, 'Lesson title must be at least 2 characters.').max(200),
  notes: z.string().trim().max(40000).optional().default(''),
  youtubeUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default('')
    .refine(
      (v) => !v || YOUTUBE_URL_RE.test(v),
      'Enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).'
    ),
  duration: z.string().trim().max(40).optional().default(''),
  order: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional().default(true),
});

export const bulkLessonsWriteSchema = z.object({
  moduleId: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => !v || OBJECT_ID_RE.test(v), 'Invalid module identifier.'),
  lessons: z
    .array(
      z.object({
        title: z.string().trim().min(2, 'Lesson title is required.').max(200),
        youtubeUrl: z
          .string()
          .trim()
          .min(1, 'YouTube URL is required.')
          .refine(
            (v) => YOUTUBE_URL_RE.test(v),
            'Enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).'
          ),
        duration: z.string().trim().max(40).optional().default(''),
        notes: z.string().trim().max(15000).optional().default(''),
        published: z.boolean().optional().default(true),
      })
    )
    .min(1, 'Add at least one video lesson.')
    .max(50, 'Cannot add more than 50 lessons in one batch.'),
});

export const productWriteSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters.').max(160),
  slug: z.string().trim().max(200).optional().default(''),
  category: z.string().trim().min(2, 'Category is required.').max(100).default('Software Product'),
  shortDescription: z.string().trim().min(10, 'Short description is required (min 10 chars).').max(500),
  fullDescription: z.string().trim().max(60000).optional().default(''),
  features: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  benefits: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  images: z.array(safeUrlOrPathSchema).max(20).optional().default([]),
  demoLink: safeUrlOrPathSchema.optional().default(''),
  pricingStatus: z.string().trim().max(120).optional().default('Contact for Pricing'),
  published: z.boolean().optional().default(true),
  order: z.number().int().min(0).max(9999).optional().default(0),
});

export const serviceWriteSchema = z.object({
  name: z.string().trim().min(2, 'Service name must be at least 2 characters.').max(160),
  slug: z.string().trim().max(200).optional().default(''),
  shortDescription: z.string().trim().min(10, 'Short description is required (min 10 chars).').max(500),
  overview: z.string().trim().max(60000).optional().default(''),
  problemsAddressed: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  deliverables: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  ctaLabel: z.string().trim().max(80).optional().default('Request Consultation'),
  coverImage: safeUrlOrPathSchema.optional().default(''),
  published: z.boolean().optional().default(true),
  order: z.number().int().min(0).max(9999).optional().default(0),
});

export const articleWriteSchema = z.object({
  title: z.string().trim().min(3, 'Article title must be at least 3 characters.').max(200),
  slug: z.string().trim().max(220).optional().default(''),
  excerpt: z.string().trim().max(500).optional().default(''),
  content: z
    .string()
    .trim()
    .max(150000, 'Article content cannot exceed 150,000 characters.')
    .refine(
      (v) => stripHtmlForValidation(v).length >= 20,
      'Article content must contain at least 20 characters of readable text.'
    ),
  featuredImage: safeUrlOrPathSchema.optional().default(''),
  category: z.string().trim().min(2, 'Category is required.').max(80).default('Engineering'),
  tags: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  authorName: z.string().trim().min(2).max(120).optional().default('NexaFlow Editorial'),
  status: z.enum(['draft', 'published']).default('draft'),
  ctaLabel: z.string().trim().max(100).optional().default(''),
  ctaHref: safeUrlOrPathSchema.optional().default(''),
});

export const workShowcaseWriteSchema = z.object({
  title: z.string().trim().min(3, 'Project title must be at least 3 characters.').max(180),
  clientName: z.string().trim().max(140).optional().default(''),
  industry: z.string().trim().max(100).optional().default(''),
  category: z.string().trim().min(2, 'Category is required.').max(100).default('AI Automation'),
  summary: z
    .string()
    .trim()
    .max(12000, 'Project summary is too long.')
    .refine(
      (v) => stripHtmlForValidation(v).length >= 10,
      'Project summary must contain at least 10 readable characters.'
    ),
  outcomes: z.array(z.string().trim().max(300)).max(20).optional().default([]),
  technologies: z.array(z.string().trim().max(80)).max(25).optional().default([]),
  imageUrl: safeUrlOrPathSchema.optional().default(''),
  projectUrl: safeUrlOrPathSchema.optional().default(''),
  featured: z.boolean().optional().default(true),
  published: z.boolean().optional().default(true),
  order: z.number().int().min(0).max(9999).optional().default(0),
});

export const testimonialWriteSchema = z.object({
  authorName: z.string().trim().min(2, 'Author name must be at least 2 characters.').max(120),
  authorRole: z.string().trim().max(120).optional().default(''),
  company: z.string().trim().max(140).optional().default(''),
  quote: z.string().trim().min(10, 'Testimonial quote must be at least 10 characters.').max(1500),
  rating: z.number().int().min(1, 'Rating must be 1 to 5 stars.').max(5).default(5),
  workTitle: z.string().trim().max(160).optional().default(''),
  featured: z.boolean().optional().default(true),
  published: z.boolean().optional().default(true),
  order: z.number().int().min(0).max(9999).optional().default(0),
});

export const courseReviewUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(140).optional(),
  comment: z.string().trim().min(3, 'Review comment cannot be under 3 characters.').max(2000).optional(),
  status: z.enum(['published', 'hidden']).optional(),
});

export const couponWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Coupon code must be at least 2 characters.')
    .max(40, 'Coupon code cannot exceed 40 characters.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, hyphens (-), and underscores (_) are allowed.'),
  description: z.string().trim().max(240).optional().default(''),
  discountPercent: z
    .number()
    .finite('Enter a valid discount percentage.')
    .min(1, 'Discount must be at least 1%.')
    .max(100, 'Discount cannot exceed 100%.'),
  courseId: z
    .string()
    .trim()
    .nullable()
    .optional()
    .default(null)
    .refine((v) => !v || OBJECT_ID_RE.test(v), 'Invalid course selection.'),
  maxUses: z.number().int().min(0, 'Max uses cannot be negative.').max(1000000).optional().default(0),
  expiresAt: optionalDateStringSchema.default(null),
  active: z.boolean().optional().default(true),
});

export const leadUpdateSchema = z.object({
  status: z
    .enum(['New', 'Contacted', 'Interested', 'Qualified', 'Proposal Sent', 'Negotiation', 'Converted', 'Lost'])
    .optional(),
  followUpDate: optionalDateStringSchema,
  outcomeReason: z.string().trim().max(500).optional(),
});

export const leadActivityWriteSchema = z.object({
  type: z.enum(['note', 'call', 'email', 'whatsapp', 'meeting']).default('note'),
  content: z.string().trim().min(2, 'Activity note must be at least 2 characters.').max(2000),
});

export const ticketStatusUpdateSchema = z.object({
  status: z.enum(['Open', 'In Progress', 'Answered', 'Closed']),
});

export const seoPageUpdateSchema = z.object({
  title: z.string().trim().max(180).optional().default(''),
  description: z.string().trim().max(400).optional().default(''),
  canonicalUrl: safeUrlOrPathSchema.optional().default(''),
  ogTitle: z.string().trim().max(180).optional().default(''),
  ogDescription: z.string().trim().max(400).optional().default(''),
  ogImage: safeUrlOrPathSchema.optional().default(''),
  focusKeyword: z.string().trim().max(120).optional().default(''),
  noIndex: z.boolean().optional().default(false),
});

export const siteSettingsWriteSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required.').max(140).optional(),
  descriptor: z.string().trim().max(180).optional(),
  tagline: z.string().trim().max(180).optional(),
  email: z
    .string()
    .trim()
    .max(180)
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid business email.'),
  phone: optionalPhoneSchema.optional(),
  whatsapp: optionalPhoneSchema.optional(),
  generalLocation: z.string().trim().max(240).optional(),
  serviceAreas: z.string().trim().max(400).optional(),
  businessHours: z.string().trim().max(240).optional(),
  socialLinks: z
    .object({
      linkedin: safeExternalHttpUrlSchema.optional().default(''),
      facebook: safeExternalHttpUrlSchema.optional().default(''),
      instagram: safeExternalHttpUrlSchema.optional().default(''),
      youtube: safeExternalHttpUrlSchema.optional().default(''),
      x: safeExternalHttpUrlSchema.optional().default(''),
    })
    .optional(),
  googleBusinessProfileUrl: safeExternalHttpUrlSchema.optional(),
  heroHeadline: z.string().trim().max(240).optional(),
  heroSubheadline: z.string().trim().max(600).optional(),
  aboutIntro: z.string().trim().max(25000).optional(),
  mission: z.string().trim().max(20000).optional(),
  vision: z.string().trim().max(20000).optional(),
  values: z.array(z.string().trim().max(240)).max(20).optional(),
  legalPrivacy: z.string().trim().max(150000).optional(),
  legalTerms: z.string().trim().max(150000).optional(),
  legalCookies: z.string().trim().max(150000).optional(),
  legalRefund: z.string().trim().max(150000).optional(),
  gaMeasurementId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .refine((v) => !v || /^G-[A-Z0-9]{4,20}$/i.test(v), 'GA4 ID should look like G-XXXXXXXXXX.'),
  gscVerificationTag: z.string().trim().max(120).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
  seoSiteTitle: z.string().trim().max(180).optional(),
  seoTitleSuffix: z.string().trim().max(120).optional(),
  seoDefaultDescription: z.string().trim().max(400).optional(),
  seoDefaultKeywords: z.string().trim().max(500).optional(),
  seoOgTitle: z.string().trim().max(180).optional(),
  seoOgDescription: z.string().trim().max(400).optional(),
  seoOgImage: safeUrlOrPathSchema.optional(),
  seoTwitterCard: z.enum(['summary_large_image', 'summary']).optional(),
  seoTwitterSite: z.string().trim().max(80).optional(),
  seoCanonicalBaseUrl: safeExternalHttpUrlSchema.optional(),
  seoRobotsDefault: z.enum(['index, follow', 'noindex, nofollow']).optional(),
  seoStructuredDataEnabled: z.boolean().optional(),
});

export const adminCreateSchema = z.object({
  name: z.string().trim().max(120).optional().default(''),
  email: z.string().trim().email('Valid email address is required.').max(180),
  secondaryEmails: z
    .array(z.string().trim().email('All additional emails must be valid.').max(180))
    .max(10)
    .optional()
    .default([]),
  password: z
    .string()
    .max(128)
    .optional()
    .default('')
    .refine(
      (v) => !v || isStrongPassword(v, 10),
      'Administrator password must be at least 10 characters with uppercase, lowercase, and a number.'
    ),
  role: z.enum(['admin', 'super_admin']).default('admin'),
});

export const adminUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120).optional(),
  email: z.string().trim().email('Valid primary email is required.').max(180).optional(),
  secondaryEmails: z
    .array(z.string().trim().email('All additional emails must be valid.').max(180))
    .max(10)
    .optional(),
  role: z.enum(['admin', 'super_admin']).optional(),
  active: z.boolean().optional(),
  newPassword: z
    .string()
    .max(128)
    .optional()
    .refine(
      (v) => !v || isStrongPassword(v, 10),
      'Administrator password must be at least 10 characters with uppercase, lowercase, and a number.'
    ),
});

export const learnerEnrolAssignSchema = z.object({
  courseId: validObjectIdSchema,
});

export const paymentRefundSchema = z.object({
  reason: z.string().trim().min(5, 'Provide a refund reason (at least 5 characters).').max(500),
  amount: z
    .number()
    .finite('Refund amount must be a valid number.')
    .positive('Refund amount must be greater than 0.')
    .optional(),
});

export function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const pathKey = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!fieldErrors[pathKey]) {
      fieldErrors[pathKey] = issue.message;
    }
  }
  return fieldErrors;
}
