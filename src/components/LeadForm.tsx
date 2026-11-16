import React, { useState } from 'react';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLeadAttribution, trackEvent } from '../utils/analytics';

interface LeadFormProps {
  interestType: 'service' | 'product' | 'course' | 'consultation' | 'general';
  interestSlug?: string;
  interestName: string;
  showBudget?: boolean;
  showCompany?: boolean;
  heading?: string;
  subheading?: string;
  submitLabel?: string;
}

export function LeadForm({
  interestType,
  interestSlug = '',
  interestName,
  showBudget = false,
  showCompany = true,
  heading,
  subheading,
  submitLabel = 'Submit Enquiry',
}: LeadFormProps) {
  const { settings, consent, navigate, showToast } = useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [preferredContact, setPreferredContact] = useState<'Email' | 'Phone' | 'WhatsApp'>('Email');
  const [description, setDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const cleanWhatsapp = (settings?.whatsapp || '').replace(/[^0-9]/g, '');
  const whatsappLink = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
        `Hello NexaFlow Technologies, I would like to enquire about ${interestName}.`
      )}`
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!consentGiven) {
      setErrorMsg('Please confirm your consent so we can respond to your enquiry.');
      return;
    }

    setSubmitting(true);
    try {
      const attr = getLeadAttribution();
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          company,
          interestType,
          interestSlug,
          interestName,
          description,
          budgetRange,
          preferredContact,
          consentGiven,
          website_hp: honeypot,
          ...attr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not submit enquiry.');
        return;
      }

      setSubmitted(true);
      showToast('Enquiry received successfully.', 'success');
      trackEvent(
        interestType === 'consultation' ? 'consultation_request' : 'lead_submission',
        {
          entitySlug: interestSlug || interestName,
          consentAccepted: consent === 'accepted',
        }
      );
    } catch {
      setErrorMsg('Network error submitting your enquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-[#176BFF]/30 bg-white dark:bg-[#080D2B] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-[#00D4FF] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
              Enquiry Received
            </h3>
            <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              Thank you for contacting NexaFlow Technologies regarding{' '}
              <span className="font-medium text-[#070B24] dark:text-[#F7F8FF]">{interestName}</span>.
              Your details have been recorded in our enquiry queue.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setDescription('');
              }}
              className="mt-4 text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
            >
              Send another enquiry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 sm:p-8">
      {heading && (
        <h3 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">{heading}</h3>
      )}
      {subheading && (
        <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4]">{subheading}</p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {/* Honeypot anti-bot field */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor={`hp-${interestSlug}`}>Website</label>
          <input
            id={`hp-${interestSlug}`}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organisation.com"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
              Phone / WhatsApp Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Include country code"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]"
            />
          </div>

          {showCompany && (
            <div>
              <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
                Company / Organisation
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Organisation name (optional)"
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
              Preferred Contact Method
            </label>
            <select
              value={preferredContact}
              onChange={(e) =>
                setPreferredContact(e.target.value as 'Email' | 'Phone' | 'WhatsApp')
              }
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
            >
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
          </div>

          {showBudget && (
            <div>
              <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
                Estimated Budget Range (Optional)
              </label>
              <select
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value)}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
              >
                <option value="">Prefer to discuss</option>
                <option value="Under GHS 5,000">Under GHS 5,000</option>
                <option value="GHS 5,000 - 15,000">GHS 5,000 – 15,000</option>
                <option value="GHS 15,000 - 40,000">GHS 15,000 – 40,000</option>
                <option value="GHS 40,000+">GHS 40,000+</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
            Project Requirements / Question *
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`Tell us what you want to achieve with ${interestName}...`}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]"
          />
        </div>

        <label className="flex items-start gap-2.5 text-xs text-[#4A5578] dark:text-[#AEB8D4] cursor-pointer">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-0.5 rounded border-[#DCE3F2] dark:border-[#1A2550] text-[#176BFF] focus:ring-[#176BFF]"
          />
          <span>
            I consent to NexaFlow Technologies storing and processing this enquiry to contact me
            in accordance with the{' '}
            <button
              type="button"
              onClick={() => navigate('/legal/privacy')}
              className="text-[#176BFF] dark:text-[#00D4FF] underline"
            >
              Privacy Policy
            </button>
            .
          </span>
        </label>

        {errorMsg && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : submitLabel}
          </button>

          {whatsappLink && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEvent('whatsapp_click', {
                  entitySlug: interestSlug || interestName,
                  consentAccepted: consent === 'accepted',
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2.5 text-sm font-medium text-[#070B24] dark:text-[#F7F8FF] hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] transition-colors whitespace-nowrap"
            >
              <MessageSquare className="w-4 h-4 text-[#00D4FF]" />
              Enquire via WhatsApp
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
