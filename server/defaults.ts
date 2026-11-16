export const DEFAULT_SERVICES = [
  {
    name: 'AI Automation',
    slug: 'ai-automation',
    shortDescription:
      'Design and deploy practical AI agents, automated operational workflows, and connected business processes that reduce repetitive manual work.',
    overview:
      'NexaFlow Technologies builds structured AI automation systems tailored to real operational bottlenecks. Rather than bolting disconnected scripts onto legacy processes, we map how work moves through your organisation and implement reliable, observable workflows with human review checkpoints where decisions carry risk.',
    problemsAddressed: [
      'Manual data re-entry across email, spreadsheets, CRM, and billing tools',
      'Slow enquiry triage and inconsistent lead or support routing',
      'Repetitive document classification, summarisation, and intake workflows',
      'Disconnected SaaS tools requiring manual handoffs between teams',
    ],
    deliverables: [
      'Workflow audit and automation architecture specification',
      'Custom AI agent and API orchestration pipelines',
      'Error handling, audit logging, and human-in-the-loop approval gates',
      'Team handover documentation and operational runbooks',
    ],
    ctaLabel: 'Request AI Automation Consultation',
    published: true,
    order: 1,
    coverImage: '/assets/images/service_ai_automation.jpg',
    seoTitle: 'AI Automation Services | NexaFlow Technologies',
    seoDescription:
      'AI agents, workflow automation, and business process automation engineered for reliability and measurable operational clarity.',
  },
  {
    name: 'Web Development',
    slug: 'web-development',
    shortDescription:
      'Custom business websites, full-stack web applications, client portals, and scalable digital platforms built for speed, security, and maintainability.',
    overview:
      'We engineer modern web platforms from the ground up—combining responsive interfaces, clean database architecture, role-based access control, payment integrations, and technical SEO. Every platform is structured so your team can manage content and grow without proprietary lock-in.',
    problemsAddressed: [
      'Slow, template-bound websites that fail to convert enquiries or rank cleanly',
      'Spreadsheet-based operations that need secure portals or customer dashboards',
      'Fragmented booking, enrolment, payment, and CRM workflows',
      'Technical debt and security gaps in legacy web applications',
    ],
    deliverables: [
      'Responsive frontend architecture with accessibility and dark/light support',
      'Server-side APIs, database modeling, and role-based authentication',
      'Payment gateway, CRM, and analytics integrations',
      'Technical SEO setup including sitemaps, canonicals, and structured data',
    ],
    ctaLabel: 'Discuss Your Web Platform',
    published: true,
    order: 2,
    coverImage: '/assets/images/hero_nexaflow_architecture.jpg',
    seoTitle: 'Web Development & Digital Platforms | NexaFlow Technologies',
    seoDescription:
      'Custom business websites, portals, and full-stack web applications engineered by NexaFlow Technologies.',
  },
  {
    name: 'Data Analytics',
    slug: 'data-analytics',
    shortDescription:
      'Structured data cleaning, automated ETL processing, executive dashboards, business intelligence, and actionable reporting systems.',
    overview:
      'Reliable decisions require clean, consistent data. NexaFlow Technologies helps organisations transform fragmented operational exports and spreadsheets into structured datasets, validated pipelines, and clear business intelligence dashboards.',
    problemsAddressed: [
      'Inconsistent, duplicated, or incomplete records across spreadsheets and systems',
      'Hours spent manually assembling weekly or monthly performance reports',
      'Lack of visibility into lead conversion, revenue, or operational bottlenecks',
      'Metrics defined differently across departments without a single source of truth',
    ],
    deliverables: [
      'Data audit, cleaning pipelines, and schema standardisation',
      'Automated reporting workflows and interactive BI dashboards',
      'KPI framework definition aligned to operational decisions',
      'Predictive trend reporting where historical data volume supports it',
    ],
    ctaLabel: 'Explore Data Analytics Solutions',
    published: true,
    order: 3,
    coverImage: '/assets/images/service_data_analytics.jpg',
    seoTitle: 'Data Analytics & Business Intelligence | NexaFlow Technologies',
    seoDescription:
      'Data cleaning, processing pipelines, executive dashboards, and business intelligence by NexaFlow Technologies.',
  },
  {
    name: 'AI and Machine Learning',
    slug: 'ai-machine-learning',
    shortDescription:
      'Applied machine learning, predictive modelling, demand forecasting, and classification systems grounded in your actual data.',
    overview:
      'We design and evaluate machine learning solutions only where historical data quality and business objectives justify predictive modelling. From forecasting and anomaly detection to classification and intelligent retrieval, we prioritise transparent evaluation metrics and maintainable deployment.',
    problemsAddressed: [
      'Manual forecasting that struggles to adapt to seasonal or operational shifts',
      'High-volume classification, scoring, or anomaly detection tasks',
      'Uncertainty around whether an organisation’s data is ready for machine learning',
      'Models stuck in notebooks without secure APIs or monitoring',
    ],
    deliverables: [
      'Data readiness and feasibility assessment',
      'Feature engineering, model training, and validation benchmarks',
      'Production inference APIs and integration with existing applications',
      'Monitoring strategy for drift and model performance over time',
    ],
    ctaLabel: 'Scope an AI & ML Project',
    published: true,
    order: 4,
    coverImage: '/assets/images/product_gridmind_ai.jpg',
    seoTitle: 'AI & Machine Learning Engineering | NexaFlow Technologies',
    seoDescription:
      'Predictive modelling, forecasting, and applied machine learning solutions built with clear evaluation and maintainable infrastructure.',
  },
];

export const DEFAULT_PRODUCTS = [
  {
    name: 'GridMind AI',
    slug: 'gridmind-ai',
    category: 'AI Platform',
    shortDescription:
      'An upcoming NexaFlow Technologies software product. Product specifications, capabilities, pricing, and availability can be configured and published directly from the administrator portal.',
    fullDescription:
      'GridMind AI is an initial product entry in the NexaFlow Technologies catalogue. Detailed capabilities, release status, documentation links, and commercial pricing are intentionally left to be published directly by the NexaFlow administrator once finalised.',
    features: [] as string[],
    benefits: [] as string[],
    images: ['/assets/images/product_gridmind_ai.jpg'],
    demoLink: '',
    pricingStatus: 'Configuration Pending — Enquire for Updates',
    published: true,
    order: 1,
    seoTitle: 'GridMind AI | NexaFlow Technologies',
    seoDescription:
      'GridMind AI product overview and enquiry portal at NexaFlow Technologies.',
  },
];

export const DEFAULT_SITE_SETTINGS = {
  key: 'main',
  businessName: 'NexaFlow Technologies',
  descriptor: 'AI, Data & Digital Solutions',
  tagline: 'Innovate • Automate • Transform',
  email: '',
  phone: '',
  whatsapp: '',
  generalLocation: '',
  serviceAreas: '',
  businessHours: '',
  socialLinks: {
    linkedin: '',
    facebook: '',
    instagram: '',
    youtube: '',
    x: '',
  },
  googleBusinessProfileUrl: '',
  heroHeadline: 'Intelligent systems, reliable data, and practical digital engineering.',
  heroSubheadline:
    'NexaFlow Technologies partners with organisations to build AI automation, custom web platforms, data analytics, applied machine learning, and structured technical training.',
  aboutIntro:
    'NexaFlow Technologies is a technology business focused on AI, data engineering, digital platforms, and practical technical education. We work directly with organisations and learners to turn complex technical concepts into dependable, maintainable systems.',
  mission:
    'To design and deliver honest, well-engineered AI, data, and web solutions—alongside structured learning programmes—that solve real operational problems without unnecessary complexity.',
  vision:
    'To be a trusted technical partner for organisations adopting automation, analytics, and modern digital infrastructure, and a clear learning pathway for practitioners building real-world skills.',
  values: [
    'Engineering honesty over hype: we recommend solutions grounded in your data and operational reality.',
    'Security and privacy by default: customer data, learner records, and payment flows are protected server-side.',
    'Maintainable architecture: clean codebases and clear documentation without artificial lock-in.',
    'Measurable execution: every platform, pipeline, and course is built around concrete outcomes.',
  ],
  legalPrivacy: `Privacy Policy Template (Editable in Admin Portal)

Notice: This template is provided as a structured starting draft and does not constitute formal legal advice. Please review and adapt it with qualified legal counsel to reflect your jurisdiction and business practices before commercial launch.

1. Information We Collect
When you submit an enquiry, register for a learner account, or purchase a course on NexaFlow Technologies, we collect the details you provide (such as your name, email address, phone or WhatsApp number, organisation name, and enquiry description) as well as attribution parameters (such as referring URL or UTM tags) when present.

2. How We Use Information
- To respond to consultation, service, product, and training enquiries.
- To create and manage learner accounts, course enrolments, progress tracking, and support tickets.
- To verify course payments through our payment gateway provider (Paystack). We do not store payment card numbers on our servers.

3. Analytics and Cookies
Essential session cookies are used for secure authentication. Optional analytics tracking (such as Google Analytics 4) is only activated after you grant consent.

4. Data Security and Retention
Access to enquiry and learner records is restricted by server-side authentication and role-based access control. You may request access, correction, or deletion of your personal records using our official business contact details once published.`,
  legalTerms: `Terms of Service Template (Editable in Admin Portal)

Notice: This template is a starting draft and does not constitute legal advice. Review and update it in the Admin Portal prior to commercial launch.

1. Acceptance of Terms
By accessing the NexaFlow Technologies website, submitting enquiries, or enrolling in NexaFlow Learn courses, you agree to comply with these Terms of Service.

2. Services & Products
Project deliverables, timelines, and commercial terms for AI Automation, Web Development, Data Analytics, Machine Learning, and products such as GridMind AI are governed by separate written agreements executed with clients.

3. Learner Accounts & Course Access
- Learner accounts are for individual use and must not be shared.
- Course access is activated only after confirmed payment verification from the payment provider.
- Course videos are hosted via Unlisted YouTube embeds inside the authenticated learner portal; learners agree not to redistribute private course links or materials.

4. Intellectual Property
All trademarks, NexaFlow Technologies branding, course materials, and software assets remain the property of NexaFlow Technologies unless otherwise agreed in writing.`,
  legalCookies: `Cookie & Analytics Notice Template (Editable in Admin Portal)

Notice: This template is a customizable starting draft and does not constitute legal advice.

1. Essential Cookies
NexaFlow Technologies uses strictly necessary HTTP-only session cookies to authenticate learners and administrators securely and to prevent cross-site request forgery.

2. Optional Analytics Cookies
If configured by the administrator, Google Analytics 4 and internal conversion tracking are used to understand page performance, course interest, and enquiry submissions. Optional analytics tracking is disabled until you select Accept in the cookie notice.

3. Managing Preferences
You can update or withdraw your analytics consent at any time using the Cookie Preferences link in the website footer.`,
  legalRefund: `Course & Refund Policy Template (Editable in Admin Portal)

Notice: This template is a starting draft and does not constitute legal advice. Please set your exact refund window and eligibility terms in the Admin Portal before accepting live payments.

1. Enrolment Activation
Course enrolments are activated automatically once Paystack confirms a successful payment server-side. If a payment shows as pending or failed, no enrolment is activated until verification succeeds.

2. Refund Requests
Learners experiencing technical issues or billing discrepancies may submit a support ticket directly from their Learner Dashboard with their Paystack transaction reference. Verified duplicate charges will be investigated and resolved promptly.

3. Support & Resolution
Questions regarding course content, billing, or complaints can be logged through the Learner Support system for tracked resolution.`,
  gaMeasurementId: process.env.GA_MEASUREMENT_ID || '',
  gscVerificationTag: process.env.GSC_VERIFICATION_TAG || '',
  retentionDays: 730,
  seoSiteTitle: 'NexaFlow Technologies | AI, Data & Digital Solutions',
  seoTitleSuffix: 'NexaFlow Technologies',
  seoDefaultDescription:
    'NexaFlow Technologies delivers AI automation, custom web development, data analytics, applied machine learning, and practical online training.',
  seoDefaultKeywords:
    'AI automation, web development, data analytics, machine learning, NexaFlow Technologies',
  seoOgTitle: 'NexaFlow Technologies | AI, Data & Digital Solutions',
  seoOgDescription:
    'Intelligent systems, reliable data, and practical digital engineering powered by NexaFlow Technologies.',
  seoOgImage: '/og-image.png',
  seoTwitterCard: 'summary_large_image' as const,
  seoTwitterSite: '',
  seoCanonicalBaseUrl: '',
  seoRobotsDefault: 'index, follow' as const,
  seoStructuredDataEnabled: true,
};

export const DEFAULT_SEO_PAGES = [
  {
    pageKey: 'home',
    title: 'NexaFlow Technologies | AI, Data & Digital Solutions',
    description:
      'NexaFlow Technologies delivers AI automation, custom web development, data analytics, applied machine learning, and practical online training.',
    noIndex: false,
    focusKeyword: 'AI automation and data solutions',
  },
  {
    pageKey: 'about',
    title: 'About | NexaFlow Technologies',
    description:
      'Learn about NexaFlow Technologies, our mission, engineering values, and areas of technical expertise.',
    noIndex: false,
    focusKeyword: 'NexaFlow Technologies',
  },
  {
    pageKey: 'solutions',
    title: 'Solutions & Services | NexaFlow Technologies',
    description:
      'Explore AI Automation, Web Development, Data Analytics, and AI & Machine Learning solutions from NexaFlow Technologies.',
    noIndex: false,
    focusKeyword: 'AI and web development services',
  },
  {
    pageKey: 'products',
    title: 'Products | NexaFlow Technologies',
    description:
      'Explore software products and digital platforms built by NexaFlow Technologies, including GridMind AI.',
    noIndex: false,
    focusKeyword: 'GridMind AI',
  },
  {
    pageKey: 'learn',
    title: 'NexaFlow Learn | Online Courses & Training',
    description:
      'Browse structured online training courses in AI, data analytics, and digital engineering at NexaFlow Learn.',
    noIndex: false,
    focusKeyword: 'NexaFlow Learn courses',
  },
  {
    pageKey: 'insights',
    title: 'Insights & Resources | NexaFlow Technologies',
    description:
      'Technical articles, guides, and insights on AI automation, data analytics, and software architecture.',
    noIndex: false,
    focusKeyword: 'AI and data insights',
  },
  {
    pageKey: 'contact',
    title: 'Contact & Consultations | NexaFlow Technologies',
    description:
      'Get in touch with NexaFlow Technologies or request a consultation for AI, data, web development, or training.',
    noIndex: false,
    focusKeyword: 'contact NexaFlow Technologies',
  },
];
