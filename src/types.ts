export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'learner' | 'admin' | 'super_admin';
}

export interface SiteSettings {
  businessName: string;
  descriptor: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  generalLocation: string;
  serviceAreas: string;
  businessHours: string;
  socialLinks: {
    linkedin: string;
    facebook: string;
    instagram: string;
    youtube: string;
    x: string;
  };
  googleBusinessProfileUrl: string;
  heroHeadline: string;
  heroSubheadline: string;
  aboutIntro: string;
  mission: string;
  vision: string;
  values: string[];
  legalPrivacy: string;
  legalTerms: string;
  legalCookies: string;
  legalRefund: string;
  gaMeasurementId: string;
  gscVerificationTag: string;
  retentionDays: number;
  seoSiteTitle?: string;
  seoTitleSuffix?: string;
  seoDefaultDescription?: string;
  seoDefaultKeywords?: string;
  seoOgTitle?: string;
  seoOgDescription?: string;
  seoOgImage?: string;
  seoTwitterCard?: 'summary_large_image' | 'summary';
  seoTwitterSite?: string;
  seoCanonicalBaseUrl?: string;
  seoRobotsDefault?: 'index, follow' | 'noindex, nofollow';
  seoStructuredDataEnabled?: boolean;
}

export interface ServiceItem {
  _id?: string;
  name: string;
  slug: string;
  shortDescription: string;
  overview: string;
  problemsAddressed: string[];
  deliverables: string[];
  ctaLabel: string;
  coverImage?: string;
  published: boolean;
  order: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
  focusKeyword?: string;
}

export interface ProductItem {
  _id?: string;
  name: string;
  slug: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  features: string[];
  benefits: string[];
  images: string[];
  demoLink: string;
  pricingStatus: string;
  published: boolean;
  order: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
  focusKeyword?: string;
}

export interface LessonItem {
  _id: string;
  courseId: string;
  moduleId: string;
  title: string;
  notes?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string | null;
  hasVideo?: boolean;
  duration?: string;
  order: number;
  published?: boolean;
  completed?: boolean;
}

export interface ModuleItem {
  _id: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  lessons: LessonItem[];
}

export interface CourseItem {
  _id: string;
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;
  coverImage?: string;
  price: number;
  currency: string;
  objectives: string[];
  outcomes: string[];
  published: boolean;
  order: number;
  moduleCount?: number;
  lessonCount?: number;
  enrolmentsCount?: number;
  averageRating?: number;
  reviewCount?: number;
  modules?: ModuleItem[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
  focusKeyword?: string;
}

export interface WorkShowcaseItem {
  _id: string;
  title: string;
  clientName: string;
  industry: string;
  category: string;
  summary: string;
  outcomes: string[];
  technologies: string[];
  imageUrl?: string;
  projectUrl?: string;
  featured: boolean;
  published: boolean;
  order: number;
}

export interface TestimonialItem {
  _id: string;
  authorName: string;
  authorRole: string;
  company: string;
  quote: string;
  rating: number;
  workTitle?: string;
  featured: boolean;
  published: boolean;
  order: number;
}

export interface CourseReviewItem {
  _id: string;
  courseId: string | { _id: string; title: string; slug: string };
  userId?: string | { _id: string; name: string; email?: string };
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  completedCourse: boolean;
  status: 'published' | 'hidden';
  createdAt: string;
  updatedAt?: string;
}

export interface ArticleItem {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  featuredImage?: string;
  category: string;
  tags: string[];
  authorName: string;
  publishedAt?: string;
  status: 'draft' | 'published';
  readingTimeMinutes: number;
  internalLinks?: Array<{ label: string; href: string }>;
  ctaLabel?: string;
  ctaHref?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
  focusKeyword?: string;
}

export interface SEOPageItem {
  pageKey: string;
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
  focusKeyword?: string;
}

export interface SupportTicketItem {
  _id: string;
  referenceNumber: string;
  subject: string;
  category: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Answered' | 'Closed';
  courseId?: { _id: string; title: string; slug: string };
  userId?: { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface LeadItem {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  interestType: 'service' | 'product' | 'course' | 'consultation' | 'general';
  interestSlug: string;
  interestName: string;
  description: string;
  budgetRange: string;
  preferredContact: 'Email' | 'Phone' | 'WhatsApp';
  source: string;
  landingPage: string;
  referringUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  status:
    | 'New'
    | 'Contacted'
    | 'Interested'
    | 'Qualified'
    | 'Proposal Sent'
    | 'Negotiation'
    | 'Converted'
    | 'Lost';
  outcomeReason?: string;
  followUpDate?: string;
  createdAt: string;
}

export interface PageMetaConfig {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  keywords?: string[] | string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface ResolvedMetaTags {
  title: string;
  description: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: 'website' | 'article';
  twitterCard: 'summary_large_image' | 'summary';
  twitterSite: string;
  siteName: string;
  keywords: string;
  noIndex: boolean;
  structuredData: Record<string, unknown> | Array<Record<string, unknown>> | null;
}
