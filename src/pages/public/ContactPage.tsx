import { useState } from 'react';
import { Clock, Globe, Mail, MessageSquare, Phone } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';

export function ContactPage() {
  const { settings, seoPages, searchParams } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'contact');

  const initialType = searchParams.get('type');
  const [formTab, setFormTab] = useState<'consultation' | 'general'>(
    initialType === 'consultation' ? 'consultation' : 'general'
  );

  const cleanWhatsapp = (settings?.whatsapp || '').replace(/[^0-9]/g, '');

  return (
    <>
      <SEOHead
        title={seo?.title}
        description={seo?.description}
        canonicalUrl={seo?.canonicalUrl}
        ogTitle={seo?.ogTitle}
        ogDescription={seo?.ogDescription}
        ogImage={seo?.ogImage}
        keywords={seo?.focusKeyword}
        noIndex={seo?.noIndex}
      />

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
            Contact &amp; Consultations
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight">
            Get in Touch With NexaFlow Technologies
          </h1>
          <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
            Reach out for project consultations, technical partnerships, product enquiries, or team training programmes.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 sm:p-8 space-y-5">
              <h2 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                Business Contact Information
              </h2>
              <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                NexaFlow Technologies operates online and serves clients digitally. No walk-in public office address is published.
              </p>

              <div className="space-y-4 text-sm">
                {settings?.email ? (
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-[#00D4FF] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">Email</p>
                      <a
                        href={`mailto:${settings.email}`}
                        className="font-medium text-[#070B24] dark:text-[#F7F8FF] hover:text-[#176BFF]"
                      >
                        {settings.email}
                      </a>
                    </div>
                  </div>
                ) : null}

                {settings?.phone ? (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-[#00D4FF] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">Telephone</p>
                      <a
                        href={`tel:${settings.phone}`}
                        className="font-medium text-[#070B24] dark:text-[#F7F8FF] hover:text-[#176BFF]"
                      >
                        {settings.phone}
                      </a>
                    </div>
                  </div>
                ) : null}

                {cleanWhatsapp ? (
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-4 h-4 text-[#00D4FF] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">WhatsApp</p>
                      <a
                        href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
                          'Hello NexaFlow Technologies, I would like to make an enquiry.'
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                      >
                        Message on WhatsApp
                      </a>
                    </div>
                  </div>
                ) : null}

                {settings?.generalLocation ? (
                  <div className="flex items-start gap-3">
                    <Globe className="w-4 h-4 text-[#00D4FF] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">Location &amp; Service Areas</p>
                      <p className="font-medium text-[#070B24] dark:text-[#F7F8FF]">
                        {settings.generalLocation}
                      </p>
                      {settings.serviceAreas && (
                        <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] mt-0.5">
                          {settings.serviceAreas}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                {settings?.businessHours ? (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-[#00D4FF] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">Operating Hours</p>
                      <p className="font-medium text-[#070B24] dark:text-[#F7F8FF]">
                        {settings.businessHours}
                      </p>
                    </div>
                  </div>
                ) : null}

                {!settings?.email && !settings?.phone && !cleanWhatsapp && (
                  <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] border-t border-[#DCE3F2] dark:border-[#1A2550] pt-4">
                    Direct phone/email details will appear here once configured in Business Settings. All enquiries submitted via the form are stored securely in the CRM.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-1">
              <button
                type="button"
                onClick={() => setFormTab('general')}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
                  formTab === 'general'
                    ? 'bg-[#176BFF] text-white'
                    : 'text-[#4A5578] dark:text-[#AEB8D4]'
                }`}
              >
                General Business Enquiry
              </button>
              <button
                type="button"
                onClick={() => setFormTab('consultation')}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
                  formTab === 'consultation'
                    ? 'bg-[#176BFF] text-white'
                    : 'text-[#4A5578] dark:text-[#AEB8D4]'
                }`}
              >
                Request a Consultation
              </button>
            </div>

            {formTab === 'consultation' ? (
              <LeadForm
                interestType="consultation"
                interestSlug="consultation-request"
                interestName="Project Consultation"
                showBudget
                heading="Request a Technical Consultation"
                subheading="Share your scope, timeline, and preferred channel."
                submitLabel="Request Consultation"
              />
            ) : (
              <LeadForm
                interestType="general"
                interestSlug="general-enquiry"
                interestName="General Business Enquiry"
                heading="Send a General Enquiry"
                subheading="Ask a question or request information from our team."
                submitLabel="Send Enquiry"
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
