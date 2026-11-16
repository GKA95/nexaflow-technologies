import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import { trackEvent } from '../../utils/analytics';
import { apiFetch } from '../../utils/authSession';

export function PaymentVerifyPage() {
  const { searchParams, navigate, consent } = useApp();
  const reference = searchParams.get('reference') || searchParams.get('trxref') || '';
  const [state, setState] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('Verifying transaction with Paystack server-side...');
  const [courseSlug, setCourseSlug] = useState('');

  useEffect(() => {
    if (!reference) {
      setState('failed');
      setMessage('Missing payment reference.');
      return;
    }

    apiFetch(`/api/payments/verify/${encodeURIComponent(reference)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.verified && data.status === 'success') {
          setState('success');
          setMessage(
            `Payment ${reference} verified. Your enrolment in "${
              data.course?.title || 'your course'
            }" is now active.`
          );
          if (data.course?.slug) setCourseSlug(data.course.slug);
          trackEvent('enrolment_complete', {
            entitySlug: data.course?.slug || reference,
            consentAccepted: consent === 'accepted',
          });
        } else {
          setState('failed');
          setMessage(
            data.error ||
              `Payment status is "${data.status || 'unverified'}". Access is only activated after confirmed Paystack verification.`
          );
        }
      })
      .catch(() => {
        setState('failed');
        setMessage('Network error verifying payment. Please check Payment History in your dashboard.');
      });
  }, [reference, consent]);

  return (
    <>
      <SEOHead title="Verify Payment | NexaFlow Learn" description="Server-side payment verification." noIndex />

      <div className="max-w-lg mx-auto px-4 py-20">
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center">
          {state === 'verifying' && (
            <Loader2 className="w-10 h-10 mx-auto text-[#00D4FF] animate-spin mb-4" />
          )}
          {state === 'success' && (
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-4" />
          )}
          {state === 'failed' && <XCircle className="w-10 h-10 mx-auto text-red-500 mb-4" />}

          <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
            {state === 'verifying'
              ? 'Verifying Payment...'
              : state === 'success'
                ? 'Payment Verified & Enrolment Active'
                : 'Payment Not Verified'}
          </h1>
          <p className="mt-3 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">{message}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {state === 'success' && courseSlug && (
              <button
                type="button"
                onClick={() => navigate(`/learner/courses/${courseSlug}`)}
                className="rounded-lg bg-[#176BFF] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Start Course Now
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/learner')}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-5 py-2.5 text-sm font-medium"
            >
              Go to Learner Dashboard
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
