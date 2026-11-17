import React, { useId, useRef, useState } from 'react';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { FieldError } from './FieldError';
import { useApp } from '../context/AppContext';
import { getLeadAttribution, trackEvent } from '../utils/analytics';
import {
  fieldBorderClass,
  type FieldErrors,
  leadFormSchema,
  validateWithSchema,
} from '../utils/formValidation';

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
  const uid = useId();

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formStartedAtRef = useRef<number>(Date.now());

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (errorMsg) setErrorMsg('');
  };

  const cleanWhatsapp = (settings?.whatsapp || '').replace(/[^0-9]/g, '');
  const whatsappLink = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
        `Hello NexaFlow Technologies, I would like to enquire about ${interestName}.`
      )}`
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setFieldErrors({});

    const attr = getLeadAttribution();
    const payload = {
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
      consentGiven: consentGiven === true,
      website_hp: honeypot,
      formStartedAt: formStartedAtRef.current,
      ...attr,
    };

    const validated = validateWithSchema(leadFormSchema, payload);
    if (!validated.ok) {
      setFieldErrors(validated.fieldErrors);
      setErrorMsg(validated.message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === 'object') {
          setFieldErrors(data.fieldErrors as FieldErrors);
        }
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
                formStartedAtRef.current = Date.now();
              }}
              className="mt-4 min-h-[44px] inline-flex items-center text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
            >
              Send another enquiry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-8">
      {heading && (
        <h3 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">{heading}</h3>
      )}
      {subheading && (
        <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4]">{subheading}</p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        {/* Honeypot anti-bot field */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor={`${uid}-hp`}>Website</label>
          <input
            id={`${uid}-hp`}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${uid}-name`}
              className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
            >
              Full Name *
            </label>
            <input
              id={`${uid}-name`}
              type="text"
              required
              autoComplete="name"
              aria-invalid={Boolean(fieldErrors.fullName)}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearFieldError('fullName');
              }}
              placeholder="Your full name"
              className={fieldBorderClass(
                'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]',
                fieldErrors.fullName
              )}
            />
            <FieldError error={fieldErrors.fullName} />
          </div>

          <div>
            <label
              htmlFor={`${uid}-email`}
              className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
            >
              Email Address *
            </label>
            <input
              id={`${uid}-email`}
              type="email"
              required
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              placeholder="you@organisation.com"
              className={fieldBorderClass(
                'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]',
                fieldErrors.email
              )}
            />
            <FieldError error={fieldErrors.email} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${uid}-phone`}
              className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
            >
              Phone / WhatsApp Number
            </label>
            <input
              id={`${uid}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(fieldErrors.phone)}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clearFieldError('phone');
              }}
              placeholder="Include country code"
              className={fieldBorderClass(
                'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]',
                fieldErrors.phone
              )}
            />
            <FieldError error={fieldErrors.phone} />
          </div>

          {showCompany && (
            <div>
              <label
                htmlFor={`${uid}-company`}
                className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
              >
                Company / Organisation
              </label>
              <input
                id={`${uid}-company`}
                type="text"
                autoComplete="organization"
                aria-invalid={Boolean(fieldErrors.company)}
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  clearFieldError('company');
                }}
                placeholder="Organisation name (optional)"
                className={fieldBorderClass(
                  'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]',
                  fieldErrors.company
                )}
              />
              <FieldError error={fieldErrors.company} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={`${uid}-preferred`}
              className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
            >
              Preferred Contact Method
            </label>
            <select
              id={`${uid}-preferred`}
              value={preferredContact}
              onChange={(e) =>
                setPreferredContact(e.target.value as 'Email' | 'Phone' | 'WhatsApp')
              }
              className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
            >
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
          </div>

          {showBudget && (
            <div>
              <label
                htmlFor={`${uid}-budget`}
                className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
              >
                Estimated Budget Range (Optional)
              </label>
              <select
                id={`${uid}-budget`}
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
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
          <label
            htmlFor={`${uid}-desc`}
            className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
          >
            Project Requirements / Question *
          </label>
          <textarea
            id={`${uid}-desc`}
            required
            rows={4}
            aria-invalid={Boolean(fieldErrors.description)}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearFieldError('description');
            }}
            placeholder={`Tell us what you want to achieve with ${interestName}...`}
            className={fieldBorderClass(
              'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50 focus:outline-none focus:border-[#176BFF]',
              fieldErrors.description
            )}
          />
          <FieldError error={fieldErrors.description} />
        </div>

        <div>
          <label
            htmlFor={`${uid}-consent`}
            className="flex items-start gap-2.5 py-1 text-xs text-[#4A5578] dark:text-[#AEB8D4] cursor-pointer"
          >
            <input
              id={`${uid}-consent`}
              type="checkbox"
              aria-invalid={Boolean(fieldErrors.consentGiven)}
              checked={consentGiven}
              onChange={(e) => {
                setConsentGiven(e.target.checked);
                clearFieldError('consentGiven');
              }}
              className="mt-0.5 h-4 w-4 rounded border-[#DCE3F2] dark:border-[#1A2550] text-[#176BFF] focus:ring-[#176BFF] shrink-0"
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
          <FieldError error={fieldErrors.consentGiven} />
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap"
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
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2.5 text-sm font-medium text-[#070B24] dark:text-[#F7F8FF] hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] transition-colors whitespace-nowrap"
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
