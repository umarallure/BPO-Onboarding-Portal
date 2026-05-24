import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  User,
  Users,
} from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCenters } from '@/hooks/useCenters';
import { supabase } from '@/integrations/supabase/client';
import {
  COUNTRY_CALLING_CODE_OPTIONS,
  DEFAULT_COUNTRY_CALLING_CODE,
  findCountryCodeByDialCode,
  getDialCodeForCountry,
} from '@/lib/countryCallingCodes';

/* ── Constants ── */

const LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Mandarin',
  'Cantonese',
  'Japanese',
  'Korean',
  'Russian',
  'Arabic',
  'Hindi',
  'Bengali',
  'Urdu',
  'Punjabi',
  'Vietnamese',
  'Tagalog',
  'Turkish',
  'Polish',
  'Dutch',
  'Greek',
  'Hebrew',
  'Thai',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Czech',
  'Romanian',
  'Hungarian',
  'Indonesian',
  'Malay',
  'Persian',
  'Ukrainian',
  'Albanian',
  'Croatian',
  'Serbian',
  'Slovak',
  'Slovenian',
  'Bulgarian',
];
const PUBLISHER_ROLES = [
  { value: 'publisher_closer', label: 'Publisher Closer' },
  { value: 'publisher_admin', label: 'Publisher Admin' },
] as const;

const POSITION_OPTIONS = [
  { value: 'accounting', label: 'Accounting' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'invoicing', label: 'Invoicing' },
  { value: 'intake_team', label: 'Intake Team' },
  { value: 'other', label: 'Other' },
] as const;

const SHIFT_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'full_day', label: 'Full Day' },
] as const;

const CENTER_MODEL_OPTIONS = [
  { value: 'cpi', label: 'CPI' },
  { value: 'cpl', label: 'CPL' },
  { value: 'cpq', label: 'CPQ' },
  { value: 'signed_retainer', label: 'Signed Retainer' },
  { value: 'seat', label: 'Seat' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'other', label: 'Other' },
] as const;

type PublisherRole = (typeof PUBLISHER_ROLES)[number]['value'];
type PositionValue = (typeof POSITION_OPTIONS)[number]['value'];
type ShiftValue = (typeof SHIFT_OPTIONS)[number]['value'];
type CenterModelValue = (typeof CENTER_MODEL_OPTIONS)[number]['value'];
type OnboardingMode = 'center' | 'publisher';
type EdgeErrorPayload = {
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const DASH_SELECT_TRIGGER_CLASS =
  'h-9 border-[var(--dash-border)] bg-background/80 text-[13px] text-[var(--dash-text)] backdrop-blur-sm focus:ring-[#AE4010]/30 hover:border-[var(--dash-border-hover)]';
const DASH_SELECT_CONTENT_CLASS =
  'border-[var(--dash-border)] bg-background/95 text-[var(--dash-text)] shadow-xl backdrop-blur-xl';
const DASH_MULTISELECT_CLASS =
  'border-[var(--dash-border)] bg-background/80 text-[13px] text-[var(--dash-text)] backdrop-blur-sm hover:border-[var(--dash-border-hover)]';
const DASH_MULTISELECT_COMPACT_CLASS = `${DASH_MULTISELECT_CLASS} min-h-9 h-9`;

const parsePhoneWithCountryCode = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { countryCode: DEFAULT_COUNTRY_CALLING_CODE, localNumber: '' };
  }

  const matchedCountryCode = findCountryCodeByDialCode(trimmed);

  if (!matchedCountryCode) {
    return { countryCode: DEFAULT_COUNTRY_CALLING_CODE, localNumber: trimmed };
  }

  const dialCode = getDialCodeForCountry(matchedCountryCode);

  return {
    countryCode: matchedCountryCode,
    localNumber: trimmed.slice(dialCode.length).replace(/^[\s().-]+/, '').trim(),
  };
};

const buildPhoneWithCountryCode = (countryCode: string, localNumber: string) => {
  const trimmed = localNumber.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  return `${getDialCodeForCountry(countryCode)} ${trimmed}`;
};

const splitCommaSeparatedValues = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const readFunctionErrorPayload = async (error: unknown): Promise<EdgeErrorPayload | null> => {
  const context =
    typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : null;

  if (!context || typeof (context as { json?: unknown }).json !== 'function') return null;

  try {
    const payload = await (context as Response).json();
    return typeof payload === 'object' && payload !== null ? (payload as EdgeErrorPayload) : null;
  } catch {
    return null;
  }
};

/* ── Reusable UI primitives ── */

function SectionCard({
  icon,
  title,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="group/section dash-animate-in relative isolate overflow-hidden rounded-2xl border border-[#AE4010]/50 bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)] shadow-[var(--dash-shadow)] transition-all duration-300 hover:border-[#AE4010]/65 hover:shadow-[0_14px_30px_rgba(174,64,16,0.14)] focus-within:border-[#AE4010]/75 focus-within:shadow-[0_16px_34px_rgba(174,64,16,0.18)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="relative flex items-center gap-3 px-5 py-3.5 border-b border-[#AE4010]/12 bg-[linear-gradient(90deg,rgba(174,64,16,0.18)_0%,rgba(174,64,16,0.1)_28%,rgba(174,64,16,0.04)_54%,rgba(174,64,16,0)_84%)]">
        <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-gradient-to-r from-[#AE4010] via-[#AE4010]/50 to-transparent" />
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#AE4010]/45 bg-[#AE4010]/10">
          <span className="text-[#AE4010]">{icon}</span>
        </div>
        <h2 className="text-[13px] font-semibold text-[var(--dash-text)]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[12px] font-medium text-[var(--dash-text)] mb-1">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function FieldHelper({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--dash-text-muted)] mt-0.5">{children}</p>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-400 mt-0.5">{message}</p>;
}

function FormInput({
  label,
  required,
  helper,
  error,
  ...props
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input
        className="h-9 border-[var(--dash-border)] bg-transparent text-[13px] text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)]/50 focus:ring-[#AE4010]/30 focus:border-[#AE4010]/40"
        {...props}
      />
      {helper && <FieldHelper>{helper}</FieldHelper>}
      <FieldError message={error} />
    </div>
  );
}

function PhoneWithCountryCodeInput({
  label,
  required,
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  error,
  placeholder = '555 123 4567',
}: {
  label: string;
  required?: boolean;
  countryCode: string;
  localNumber: string;
  onCountryCodeChange: (value: string) => void;
  onLocalNumberChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  const updateLocalNumber = (nextLocalNumber: string) => {
    if (nextLocalNumber.trim().startsWith('+')) {
      const parsed = parsePhoneWithCountryCode(nextLocalNumber);
      onCountryCodeChange(parsed.countryCode);
      onLocalNumberChange(parsed.localNumber);
      return;
    }

    onLocalNumberChange(nextLocalNumber);
  };

  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
        <Select value={countryCode} onValueChange={onCountryCodeChange}>
          <SelectTrigger className={`${DASH_SELECT_TRIGGER_CLASS} w-full`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
            {COUNTRY_CALLING_CODE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="tel"
          inputMode="tel"
          placeholder={placeholder}
          value={localNumber}
          onChange={(ev) => updateLocalNumber(ev.target.value)}
          className="h-9 min-w-0 border-[var(--dash-border)] bg-transparent text-[13px] text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)]/50 focus:ring-[#AE4010]/30 focus:border-[#AE4010]/40"
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function StatusBanner({
  type,
  message,
}: {
  type: 'success' | 'error' | 'warning';
  message: string;
}) {
  const config = {
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      text: 'text-green-400',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  }[type];

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${config.bg} ${config.border} ${config.text}`}>
      {config.icon}
      <span className="text-[12px] font-medium">{message}</span>
    </div>
  );
}

/* ── Mode selector ── */

const MODE_OPTIONS: {
  value: OnboardingMode;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'center',
    title: 'BPO Center Onboarding',
    description: 'Register a new BPO center. The center can later host publisher accounts.',
    icon: Building2,
  },
  {
    value: 'publisher',
    title: 'Publisher Account',
    description: 'Create a publisher account linked to an existing BPO center.',
    icon: Users,
  },
];

function ModeSelector({
  value,
  onChange,
}: {
  value: OnboardingMode;
  onChange: (mode: OnboardingMode) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MODE_OPTIONS.map((opt, idx) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`dash-animate-in group relative isolate overflow-hidden rounded-2xl border bg-[var(--dash-surface)] p-4 text-left backdrop-blur-[var(--dash-blur)] shadow-[var(--dash-shadow)] transition-all duration-300 ${
              active
                ? 'border-[#AE4010] shadow-[0_16px_34px_rgba(174,64,16,0.22)]'
                : 'border-[#AE4010]/30 hover:border-[#AE4010]/60 hover:shadow-[0_14px_30px_rgba(174,64,16,0.14)]'
            }`}
            style={{ animationDelay: `${60 + idx * 40}ms` }}
          >
            {active && (
              <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#AE4010] text-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? 'border-[#AE4010]/60 bg-[#AE4010]/15 text-[#AE4010]'
                    : 'border-[#AE4010]/35 bg-[#AE4010]/8 text-[#AE4010]/85 group-hover:bg-[#AE4010]/12'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--dash-text)]">{opt.title}</div>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--dash-text-muted)]">
                  {opt.description}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Validation schemas (client-side mirror of edge function) ── */

const centerSchema = z
  .object({
    center_name: z.string().trim().min(1, 'Center name is required'),
    location: z.string().trim().optional(),
    website_or_linkedin: z.string().trim().optional(),
    contact_email: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        'Invalid email',
      ),
    contact_phone: z.string().trim().optional(),
    number_of_agents: z.string().trim().optional(),
    languages: z.array(z.string()).optional(),
    operating_hours: z.string().trim().optional(),
    campaigns: z.array(z.string()).optional(),
    buyer_count: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d+$/.test(v), 'Buyers must be a whole number'),
    sales_model: z.enum(['cpi', 'cpl', 'cpq', 'signed_retainer', 'seat', 'hourly', 'other']).optional(),
    sales_model_other: z.string().trim().optional(),
    selling_markets: z.array(z.string()).optional(),
  })
  .refine((data) => data.sales_model !== 'other' || Boolean(data.sales_model_other?.trim()), {
    message: 'Specify the model when Other is selected',
    path: ['sales_model_other'],
  });

const baseAccountSchema = z
  .object({
    center_id: z.string().uuid('A center must be selected'),
    full_name: z.string().trim().min(1, 'Full name is required'),
    email: z.string().trim().email('Valid email required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    role: z.enum(['publisher_admin', 'publisher_closer'], {
      errorMap: () => ({ message: 'Role is required' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/* ══════════════════════════════════════════════════════════
   Main page component
   ══════════════════════════════════════════════════════════ */

export default function OnboardingPortalPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { centers, loading: centersLoading, refetch: refetchCenters } = useCenters();
  const disclaimerPanelId = 'onboarding-important-notes';

  /* ── Mode ── */
  const [mode, setMode] = useState<OnboardingMode>('center');

  /* ── Center form state ── */
  const [centerName, setCenterName] = useState('');
  const [centerLocation, setCenterLocation] = useState('');
  const [centerWebsite, setCenterWebsite] = useState('');
  const [centerContactEmail, setCenterContactEmail] = useState('');
  const [centerWhatsAppCountryCode, setCenterWhatsAppCountryCode] = useState<string>(DEFAULT_COUNTRY_CALLING_CODE);
  const [centerWhatsAppNumber, setCenterWhatsAppNumber] = useState('');
  const [centerNumberOfAgents, setCenterNumberOfAgents] = useState('');
  const [centerLanguages, setCenterLanguages] = useState<string[]>([]);
  const [centerOperatingHours, setCenterOperatingHours] = useState('');
  const [centerCampaigns, setCenterCampaigns] = useState('');
  const [centerBuyerCount, setCenterBuyerCount] = useState('');
  const [centerModel, setCenterModel] = useState<CenterModelValue | ''>('');
  const [centerModelOther, setCenterModelOther] = useState('');
  const [centerSellingMarkets, setCenterSellingMarkets] = useState('');

  /* ── Publisher account form state ── */
  const [pubCenterId, setPubCenterId] = useState('');
  const [pubFullName, setPubFullName] = useState('');
  const [pubEmail, setPubEmail] = useState('');
  const [pubPassword, setPubPassword] = useState('');
  const [pubConfirmPassword, setPubConfirmPassword] = useState('');
  const [pubRole, setPubRole] = useState<PublisherRole | ''>('');
  const [showPassword, setShowPassword] = useState(false);

  /* ── Publisher Closer ── */
  const [closerContactEmail, setCloserContactEmail] = useState('');
  const [closerPhone, setCloserPhone] = useState('');
  const [closerPosition, setCloserPosition] = useState<PositionValue | ''>('');
  const [closerPositionOther, setCloserPositionOther] = useState('');
  const [closerShift, setCloserShift] = useState<ShiftValue | ''>('');

  /* ── UI state ── */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitWarnings, setSubmitWarnings] = useState<string[]>([]);
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);

  const sortedCenters = useMemo(
    () => [...centers].sort((a, b) => a.center_name.localeCompare(b.center_name)),
    [centers],
  );

  const centerContactPhone = buildPhoneWithCountryCode(centerWhatsAppCountryCode, centerWhatsAppNumber);

  const resetMessages = () => {
    setFieldErrors({});
    setSubmitResult(null);
    setSubmitWarnings([]);
  };

  const switchMode = (next: OnboardingMode) => {
    if (submitting) return;
    setMode(next);
    resetMessages();
  };

  /* ── Submit ── */
  const handleSubmit = useCallback(async () => {
    resetMessages();

    if (mode === 'center') {
      const parsed = centerSchema.safeParse({
        center_name: centerName,
        location: centerLocation,
        website_or_linkedin: centerWebsite,
        contact_email: centerContactEmail,
        contact_phone: centerContactPhone,
        number_of_agents: centerNumberOfAgents,
        languages: centerLanguages,
        operating_hours: centerOperatingHours,
        campaigns: splitCommaSeparatedValues(centerCampaigns),
        buyer_count: centerBuyerCount,
        sales_model: centerModel || undefined,
        sales_model_other: centerModel === 'other' ? centerModelOther : undefined,
        selling_markets: splitCommaSeparatedValues(centerSellingMarkets),
      });

      if (!parsed.success) {
        const errors: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          errors[`center.${issue.path.join('.')}`] = issue.message;
        });
        setFieldErrors(errors);
        setSubmitResult({ type: 'error', message: Object.values(errors).join(', ') });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setSubmitting(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('onboard-bpo', {
          method: 'POST',
          body: {
            mode: 'center',
            center: parsed.data,
          },
        });

        if (fnError) {
          const errorPayload = await readFunctionErrorPayload(fnError);
          const message = errorPayload?.error || fnError.message || 'Failed to create center';
          setSubmitResult({ type: 'error', message });
          if (errorPayload?.fieldErrors) setFieldErrors(errorPayload.fieldErrors);
          else if (data?.fieldErrors) setFieldErrors(data.fieldErrors);

          toast({
            title: errorPayload?.code === 'center_exists' ? 'Center already exists' : 'Center creation failed',
            description: message,
            variant: 'destructive',
          });
          return;
        }

        if (data?.error) {
          setSubmitResult({ type: 'error', message: data.error });
          if (data.fieldErrors) setFieldErrors(data.fieldErrors);
          toast({
            title: data.code === 'center_exists' ? 'Center already exists' : 'Center creation failed',
            description: data.error,
            variant: 'destructive',
          });
          return;
        }

        setSubmitResult({
          type: 'success',
          message: `BPO center "${parsed.data.center_name}" created successfully.`,
        });
        toast({
          title: 'Center Created',
          description: `${parsed.data.center_name} has been onboarded.`,
        });

        // Reset center form and refresh centers list so the publisher mode can pick it up.
        setCenterName('');
        setCenterLocation('');
        setCenterWebsite('');
        setCenterContactEmail('');
        setCenterWhatsAppCountryCode(DEFAULT_COUNTRY_CALLING_CODE);
        setCenterWhatsAppNumber('');
        setCenterNumberOfAgents('');
        setCenterLanguages([]);
        setCenterOperatingHours('');
        setCenterCampaigns('');
        setCenterBuyerCount('');
        setCenterModel('');
        setCenterModelOther('');
        setCenterSellingMarkets('');
        await refetchCenters();
      } catch (err) {
        setSubmitResult({ type: 'error', message: (err as Error).message || 'Unexpected error' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    /* ── Publisher mode ── */
    const accountParsed = baseAccountSchema.safeParse({
      center_id: pubCenterId,
      full_name: pubFullName,
      email: pubEmail,
      password: pubPassword,
      confirmPassword: pubConfirmPassword,
      role: pubRole || undefined,
    });

    if (!accountParsed.success) {
      const errors: Record<string, string> = {};
      accountParsed.error.issues.forEach((issue) => {
        errors[`account.${issue.path.join('.')}`] = issue.message;
      });
      setFieldErrors(errors);
      setSubmitResult({ type: 'error', message: Object.values(errors).join(', ') });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    let closerPayload:
      | {
          contact_email?: string;
          contact_phone?: string;
          position: PositionValue;
          position_other?: string;
          shift_availability: ShiftValue;
        }
      | null = null;

    if (accountParsed.data.role === 'publisher_closer') {
      const position: PositionValue = (closerPosition || 'intake_team') as PositionValue;
      if (position === 'other' && !closerPositionOther.trim()) {
        const msg = 'Please specify the position when "Other" is selected.';
        setFieldErrors({ 'closer.position_other': msg });
        setSubmitResult({ type: 'error', message: msg });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      closerPayload = {
        contact_email: closerContactEmail.trim() || undefined,
        contact_phone: closerPhone.trim() || undefined,
        position,
        position_other: position === 'other' ? closerPositionOther.trim() : undefined,
        shift_availability: (closerShift || 'full_day') as ShiftValue,
      };
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        mode: 'publisher',
        account: {
          center_id: accountParsed.data.center_id,
          full_name: accountParsed.data.full_name,
          email: accountParsed.data.email,
          password: accountParsed.data.password,
          role: accountParsed.data.role,
        },
      };

      if (closerPayload) {
        body.closer = closerPayload;
      }

      const { data, error: fnError } = await supabase.functions.invoke('onboard-bpo', {
        method: 'POST',
        body,
      });

      if (fnError) {
        setSubmitResult({ type: 'error', message: fnError.message || 'Failed to create publisher account' });
        if (data?.fieldErrors) setFieldErrors(data.fieldErrors);
        return;
      }

      if (data?.error) {
        setSubmitResult({ type: 'error', message: data.error });
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        return;
      }

      const warnings: string[] = Array.isArray(data?.warnings)
        ? data.warnings.filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
        : [];
      setSubmitWarnings(warnings);

      const createdEmail = accountParsed.data.email;
      setSubmitResult({
        type: 'success',
        message:
          warnings.length > 0
            ? `Publisher account created for ${createdEmail}. Review the notes below.`
            : `Publisher account created for ${createdEmail}.`,
      });
      toast({
        title: warnings.length > 0 ? 'Account Created With Notes' : 'Account Created',
        description:
          warnings.length > 0
            ? warnings[0]
            : `${accountParsed.data.full_name} (${createdEmail}) has been onboarded.`,
      });

    } catch (err) {
      setSubmitResult({ type: 'error', message: (err as Error).message || 'Unexpected error' });
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    centerName,
    centerLocation,
    centerWebsite,
    centerContactEmail,
    centerContactPhone,
    centerNumberOfAgents,
    centerLanguages,
    centerOperatingHours,
    centerCampaigns,
    centerBuyerCount,
    centerModel,
    centerModelOther,
    centerSellingMarkets,
    pubCenterId,
    pubFullName,
    pubEmail,
    pubPassword,
    pubConfirmPassword,
    pubRole,
    closerContactEmail,
    closerPhone,
    closerPosition,
    closerPositionOther,
    closerShift,
    refetchCenters,
    toast,
  ]);

  const e = (key: string) => fieldErrors[key];

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[900px] space-y-5">
        {/* ── Page header ── */}
        <div className="dash-animate-in">
          <h1 className="text-lg font-bold text-[var(--dash-text)]">BPO Onboarding</h1>
          <p className="text-[12px] text-[var(--dash-text-muted)] mt-0.5">
            Create a new BPO center, or onboard a publisher account linked to an existing center.
          </p>
        </div>

        {/* ── Result banner ── */}
        {submitResult && <StatusBanner type={submitResult.type} message={submitResult.message} />}
        {submitWarnings.length > 0 && (
          <div className="space-y-2">
            {submitWarnings.map((warning, index) => (
              <StatusBanner key={`submit-warning-${index}`} type="warning" message={warning} />
            ))}
          </div>
        )}

        {/* ── Mode Selector ── */}
        <ModeSelector value={mode} onChange={switchMode} />

        {/* ── Center form ── */}
        {mode === 'center' && (
          <>
            <SectionCard
              icon={<Building2 className="h-3.5 w-3.5" />}
              title="Identity"
              delay={140}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <FormInput
                    label="Center Name"
                    required
                    placeholder="e.g. Sunrise Outreach"
                    value={centerName}
                    onChange={(ev) => setCenterName(ev.target.value)}
                    helper="The center name will also be used as the lead vendor identifier."
                    error={e('center.center_name')}
                  />
                </div>
                <FormInput
                  label="Location"
                  placeholder="City, Country"
                  value={centerLocation}
                  onChange={(ev) => setCenterLocation(ev.target.value)}
                  error={e('center.location')}
                />
                <FormInput
                  label="Website / LinkedIn"
                  type="url"
                  placeholder="https://..."
                  value={centerWebsite}
                  onChange={(ev) => setCenterWebsite(ev.target.value)}
                  error={e('center.website_or_linkedin')}
                />
                <FormInput
                  label="Contact Email"
                  type="email"
                  placeholder="contact@center.com"
                  value={centerContactEmail}
                  onChange={(ev) => setCenterContactEmail(ev.target.value)}
                  error={e('center.contact_email')}
                />
                <PhoneWithCountryCodeInput
                  label="WhatsApp"
                  placeholder="555 123 4567"
                  countryCode={centerWhatsAppCountryCode}
                  localNumber={centerWhatsAppNumber}
                  onCountryCodeChange={setCenterWhatsAppCountryCode}
                  onLocalNumberChange={setCenterWhatsAppNumber}
                  error={e('center.contact_phone')}
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={<MapPin className="h-3.5 w-3.5" />}
              title="Stats & Capacity"
              delay={200}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput
                  label="Number of Agents"
                  placeholder="e.g. 25"
                  value={centerNumberOfAgents}
                  onChange={(ev) => setCenterNumberOfAgents(ev.target.value)}
                  error={e('center.number_of_agents')}
                />
                <FormInput
                  label="Buyers"
                  placeholder="e.g. 12"
                  value={centerBuyerCount}
                  onChange={(ev) => setCenterBuyerCount(ev.target.value)}
                />
                <FormInput
                  label="Campaigns"
                  placeholder="e.g. Auto, MVA, PI"
                  value={centerCampaigns}
                  onChange={(ev) => setCenterCampaigns(ev.target.value)}
                />
                <div>
                  <FieldLabel>Model</FieldLabel>
                  <Select
                    value={centerModel}
                    onValueChange={(v) => setCenterModel(v as CenterModelValue)}
                  >
                    <SelectTrigger className={DASH_SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
                      {CENTER_MODEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {centerModel === 'other' && (
                  <FormInput
                    label="Specify Model"
                    placeholder="Enter model"
                    value={centerModelOther}
                    onChange={(ev) => setCenterModelOther(ev.target.value)}
                  />
                )}
                <FormInput
                  label="Market Target"
                  placeholder="e.g. US, Canada, UK"
                  value={centerSellingMarkets}
                  onChange={(ev) => setCenterSellingMarkets(ev.target.value)}
                />
                <div>
                  <FieldLabel>Languages</FieldLabel>
                  <MultiSelect
                    options={LANGUAGE_OPTIONS}
                    selected={centerLanguages}
                    onChange={setCenterLanguages}
                    placeholder="Select languages"
                    className={DASH_MULTISELECT_COMPACT_CLASS}
                    showSelectAll={false}
                  />
                  <FieldError message={e('center.languages')} />
                </div>
                <div className="sm:col-span-2">
                  <FormInput
                    label="Operating Hours"
                    placeholder="e.g. Mon-Fri 9am-6pm EST"
                    value={centerOperatingHours}
                    onChange={(ev) => setCenterOperatingHours(ev.target.value)}
                    error={e('center.operating_hours')}
                  />
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Publisher form ── */}
        {mode === 'publisher' && (
          <>
            {/* Account credentials */}
            <SectionCard
              icon={<User className="h-3.5 w-3.5" />}
              title="Publisher Account"
              delay={140}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <FieldLabel required>Center</FieldLabel>
                  <Select value={pubCenterId} onValueChange={setPubCenterId}>
                    <SelectTrigger className={DASH_SELECT_TRIGGER_CLASS}>
                      <SelectValue
                        placeholder={centersLoading ? 'Loading centers…' : 'Select a center'}
                      />
                    </SelectTrigger>
                    <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
                      {sortedCenters.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-[var(--dash-text-muted)]">
                          No centers yet. Create one first using the BPO Center Onboarding option.
                        </div>
                      ) : (
                        sortedCenters.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.center_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FieldError message={e('account.center_id')} />
                </div>

                <FormInput
                  label="Full Name"
                  required
                  placeholder="John Doe"
                  value={pubFullName}
                  onChange={(ev) => setPubFullName(ev.target.value)}
                  error={e('account.full_name')}
                />
                <FormInput
                  label="Email"
                  required
                  type="email"
                  placeholder="publisher@center.com"
                  value={pubEmail}
                  onChange={(ev) => setPubEmail(ev.target.value)}
                  error={e('account.email')}
                />

                <div>
                  <FieldLabel required>Password</FieldLabel>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      className="h-9 pr-9 border-[var(--dash-border)] bg-background/80 text-[13px] text-[var(--dash-text)] backdrop-blur-sm placeholder:text-[var(--dash-text-muted)]/50 focus:ring-[#AE4010]/30"
                      value={pubPassword}
                      onChange={(ev) => setPubPassword(ev.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <FieldError message={e('account.password')} />
                </div>

                <FormInput
                  label="Confirm Password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={pubConfirmPassword}
                  onChange={(ev) => setPubConfirmPassword(ev.target.value)}
                  error={e('account.confirmPassword')}
                />

                <div className="sm:col-span-2">
                  <FieldLabel required>Role</FieldLabel>
                  <Select
                    value={pubRole}
                    onValueChange={(v) => setPubRole(v as PublisherRole)}
                  >
                    <SelectTrigger className={DASH_SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
                      {PUBLISHER_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={e('account.role')} />
                </div>
              </div>
            </SectionCard>

            {/* Publisher Closer: Identity */}
            {pubRole === 'publisher_closer' && (
              <SectionCard
                icon={<Briefcase className="h-3.5 w-3.5" />}
                title="Identity"
                delay={200}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormInput
                    label="Email"
                    type="email"
                    placeholder="contact@center.com"
                    helper="Defaults to the account email if left blank."
                    value={closerContactEmail}
                    onChange={(ev) => setCloserContactEmail(ev.target.value)}
                  />
                  <FormInput
                    label="Phone Contact"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={closerPhone}
                    onChange={(ev) => setCloserPhone(ev.target.value)}
                  />
                  <div>
                    <FieldLabel>Position</FieldLabel>
                    <Select
                      value={closerPosition}
                      onValueChange={(v) => setCloserPosition(v as PositionValue)}
                    >
                      <SelectTrigger className={DASH_SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="Select a position" />
                      </SelectTrigger>
                      <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
                        {POSITION_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Shift Availability</FieldLabel>
                    <Select
                      value={closerShift}
                      onValueChange={(v) => setCloserShift(v as ShiftValue)}
                    >
                      <SelectTrigger className={DASH_SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="Select a shift" />
                      </SelectTrigger>
                      <SelectContent className={DASH_SELECT_CONTENT_CLASS}>
                        {SHIFT_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {closerPosition === 'other' && (
                    <div className="sm:col-span-2">
                      <FormInput
                        label="Specify Position"
                        required
                        placeholder="e.g. Quality Assurance"
                        value={closerPositionOther}
                        onChange={(ev) => setCloserPositionOther(ev.target.value)}
                        error={e('closer.position_other')}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </>
        )}

        {/* ═══ Disclaimer / Notes card ═══ */}
        <div className="dash-animate-in" style={{ animationDelay: '320ms' }}>
          <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.08)_0%,rgba(245,158,11,0.04)_100%)] shadow-[0_10px_24px_rgba(120,53,15,0.08)] backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setDisclaimerOpen(!disclaimerOpen)}
              aria-expanded={disclaimerOpen}
              aria-controls={disclaimerPanelId}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-amber-500/[0.04]"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <span className="block text-[12px] font-semibold text-amber-200">Important Notes</span>
                  <span className="mt-0.5 block text-[11px] text-amber-200/70">
                    A few details to keep in mind before submitting.
                  </span>
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/8">
                {disclaimerOpen ? (
                  <ChevronUp className="h-4 w-4 text-amber-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-400" />
                )}
              </div>
            </button>
            {disclaimerOpen && (
              <div id={disclaimerPanelId} className="border-t border-amber-500/15 px-5 py-4">
                <div className="space-y-3">
                  {mode === 'center' ? (
                    <>
                      <p className="text-[12px] leading-5 text-amber-100/85">
                        This creates a new BPO center. Only the center name is required; identity and capacity details
                        are optional and can be completed later.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] leading-5 text-amber-100/85">
                        This creates a real user account with{' '}
                        <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">
                          {pubRole || 'publisher'}
                        </span>{' '}
                        role linked to the selected BPO center.
                      </p>
                      {pubRole === 'publisher_closer' ? (
                        <p className="text-[12px] leading-5 text-amber-100/80">
                          The closer is registered under the selected center and will appear in
                          that center's team profile.
                        </p>
                      ) : (
                        <p className="text-[12px] leading-5 text-amber-100/80">
                          Publisher admins are created as app users and linked to the selected center.
                        </p>
                      )}
                      <p className="text-[12px] leading-5 text-amber-100/80">
                        The user can log in immediately with the credentials provided.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Submit ═══ */}
        <div className="dash-animate-in flex justify-end gap-3 pb-8" style={{ animationDelay: '380ms' }}>
          <Button
            variant="outline"
            className="border-[var(--dash-border)] text-[var(--dash-text-muted)] hover:bg-white/[0.03]"
            onClick={() => navigate(-1)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#AE4010] text-white hover:bg-[#7c2c0a] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {mode === 'center' ? 'Creating Center…' : 'Creating Account…'}
              </>
            ) : mode === 'center' ? (
              'Create BPO Center'
            ) : (
              'Create Publisher Account'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
