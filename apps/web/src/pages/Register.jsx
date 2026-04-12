import { useState } from 'react';

const DISABILITY_CATEGORIES = [
  'ADHD / Attention',
  'Anxiety / Stress',
  'Autism Spectrum',
  'Brain Injury / Concussion',
  'Chronic Pain / Fatigue',
  'Deaf / Hard of Hearing',
  'Depression / Mood',
  'Learning Disability',
  'Low Vision / Blind',
  'Mental Health',
  'Mobility / Physical',
  'Other',
];

const STUDENT_STATUS_OPTIONS = [
  { value: 'domestic',        label: 'Domestic student' },
  { value: 'international',   label: 'International student' },
  { value: 'first_gen',       label: 'First-generation student' },
  { value: 'mature',          label: 'Mature student' },
  { value: 'part_time',       label: 'Part-time student' },
];

const ACCOMMODATION_OPTIONS = [
  'Extended test time (1.5×)',
  'Extended test time (2×)',
  'Reduced-distraction environment',
  'Reader / scribe',
  'Assistive technology',
  'Preferential seating',
  'Frequent breaks',
  'Note-taking support',
  'Alternative format materials',
  'Sign language interpreter',
  'Other',
];

// ── Step components ────────────────────────────────────────────────────────────

function StepIdentity({ data, onChange }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={e => onChange('firstName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={e => onChange('lastName', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          University email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={data.email}
          onChange={e => onChange('email', e.target.value)}
          placeholder="you@dal.ca"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600"
          required
        />
        <p className="text-xs text-gray-400 mt-1">
          Use your institutional email address.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Student number
          </label>
          <input
            type="text"
            value={data.studentNumber}
            onChange={e => onChange('studentNumber', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone number
          </label>
          <input
            type="tel"
            value={data.phone}
            onChange={e => onChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Student status (select all that apply)
        </label>
        <div className="space-y-2">
          {STUDENT_STATUS_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.studentStatusFlags.includes(opt.value)}
                onChange={e => {
                  const flags = e.target.checked
                    ? [...data.studentStatusFlags, opt.value]
                    : data.studentStatusFlags.filter(f => f !== opt.value);
                  onChange('studentStatusFlags', flags);
                }}
                className="rounded border-gray-300 text-brand-600"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDisability({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Disability / condition categories <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Select all that apply. This helps us connect you with the right support.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DISABILITY_CATEGORIES.map(cat => (
            <label key={cat} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.disabilityCategories.includes(cat)}
                onChange={e => {
                  const cats = e.target.checked
                    ? [...data.disabilityCategories, cat]
                    : data.disabilityCategories.filter(c => c !== cat);
                  onChange('disabilityCategories', cats);
                }}
                className="rounded border-gray-300 text-brand-600"
              />
              <span className="text-sm text-gray-700">{cat}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          How does your disability affect your academics?
        </label>
        <textarea
          value={data.academicImpact}
          onChange={e => onChange('academicImpact', e.target.value)}
          rows={4}
          placeholder="Describe how your condition affects your ability to participate in academic activities, take exams, etc."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.onMedication}
            onChange={e => onChange('onMedication', e.target.checked)}
            className="rounded border-gray-300 text-brand-600"
          />
          <span className="text-sm font-medium text-gray-700">
            I am currently taking medication related to my disability
          </span>
        </label>
      </div>

      {data.onMedication && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Medication details (optional)
          </label>
          <textarea
            value={data.medicationDetails}
            onChange={e => onChange('medicationDetails', e.target.value)}
            rows={3}
            placeholder="You may briefly describe the medication and any relevant effects on your academic performance."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>
      )}
    </div>
  );
}

function StepAccommodations({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Requested accommodations
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Select any accommodations you are requesting. Your counsellor will review and confirm which apply.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {ACCOMMODATION_OPTIONS.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.requestedAccommodations.includes(opt)}
                onChange={e => {
                  const accs = e.target.checked
                    ? [...data.requestedAccommodations, opt]
                    : data.requestedAccommodations.filter(a => a !== opt);
                  onChange('requestedAccommodations', accs);
                }}
                className="rounded border-gray-300 text-brand-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Previous accommodations (if any)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          List any accommodations you have received at this or other institutions.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {ACCOMMODATION_OPTIONS.map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.pastAccommodations.includes(opt)}
                onChange={e => {
                  const accs = e.target.checked
                    ? [...data.pastAccommodations, opt]
                    : data.pastAccommodations.filter(a => a !== opt);
                  onChange('pastAccommodations', accs);
                }}
                className="rounded border-gray-300 text-brand-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-medium text-gray-700 mb-1">
          Medical provider information (optional)
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          If you have a doctor, psychologist, or specialist supporting your registration,
          we may contact them to request documentation.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider name
            </label>
            <input
              type="text"
              value={data.providerName}
              onChange={e => onChange('providerName', e.target.value)}
              placeholder="Dr. Jane Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider phone
            </label>
            <input
              type="tel"
              value={data.providerPhone}
              onChange={e => onChange('providerPhone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const STEPS = ['Identity', 'Disability info', 'Accommodations'];

export default function Register() {
  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]   = useState('');

  const [form, setForm] = useState({
    // Step 1
    firstName:            '',
    lastName:             '',
    email:                '',
    studentNumber:        '',
    phone:                '',
    studentStatusFlags:   [],
    // Step 2
    disabilityCategories: [],
    academicImpact:       '',
    onMedication:         false,
    medicationDetails:    '',
    // Step 3
    requestedAccommodations: [],
    pastAccommodations:      [],
    providerName:            '',
    providerPhone:           '',
  });

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function validateStep() {
    if (step === 0) {
      if (!form.firstName.trim()) return 'First name is required.';
      if (!form.lastName.trim())  return 'Last name is required.';
      if (!form.email.trim())     return 'Email is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email address.';
    }
    if (step === 1) {
      if (form.disabilityCategories.length === 0)
        return 'Please select at least one disability / condition category.';
    }
    return null;
  }

  function handleNext() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Submission failed');
      setSubmitted(true);

      // Dev convenience: log claim URL
      if (data._dev_claimUrl) {
        console.log('[REGISTRATION] Claim URL:', data._dev_claimUrl);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Registration submitted</h2>
          <p className="text-sm text-gray-500">
            We've received your registration. A counsellor will review it shortly.
            Check your email for a link to activate your Clearpath account.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block text-sm text-brand-600 hover:text-brand-800"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="w-full max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Clearpath</h1>
          <p className="text-sm text-gray-500 mt-1">
            Accessibility Centre — student registration
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0
                ${i < step  ? 'bg-brand-600 text-white'
                : i === step ? 'bg-brand-600 text-white ring-2 ring-brand-200'
                             : 'bg-gray-200 text-gray-500'}`}>
                {i < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-brand-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-5">
            {STEPS[step]}
          </h2>

          <form onSubmit={step === STEPS.length - 1 ? handleSubmit : e => { e.preventDefault(); handleNext(); }}>
            {step === 0 && <StepIdentity      data={form} onChange={handleChange} />}
            {step === 1 && <StepDisability    data={form} onChange={handleChange} />}
            {step === 2 && <StepAccommodations data={form} onChange={handleChange} />}

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => { setError(''); setStep(s => s - 1); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
              ) : (
                <a href="/login" className="text-sm text-gray-400 hover:text-gray-600">
                  Already have an account?
                </a>
              )}

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                           font-medium rounded-lg transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === STEPS.length - 1
                  ? (loading ? 'Submitting…' : 'Submit registration')
                  : 'Continue'}
              </button>
            </div>
          </form>
        </div>

        <p className="text-xs text-center text-gray-400 mt-4">
          Your information is kept confidential and only accessible to accessibility centre staff.
        </p>
      </div>
    </div>
  );
}
