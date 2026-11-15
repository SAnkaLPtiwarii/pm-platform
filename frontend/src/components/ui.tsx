import { forwardRef, useState } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format'
import type { ProjectStatus, TaskPriority, TaskStatus } from '../lib/types'

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function PageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[35vh] place-content-center justify-items-center px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
        <div className="relative mx-auto grid h-14 w-14 place-items-center">
          <span className="absolute inset-0 rounded-full border-2 border-slate-200" />
          <Spinner className="relative h-10 w-10 text-indigo-700" />
          <span className="absolute h-2 w-2 rounded-full bg-indigo-700" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700">{label}</p>
        <div aria-hidden="true" className="mt-3 flex justify-center gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-700" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-700 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-700 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800',
  secondary: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100',
  danger: 'border-red-700 bg-white text-red-700 hover:bg-red-50',
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

const baseField =
  'block min-h-11 w-full rounded border bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-700 disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm'
const fieldClass = (invalid: boolean) => `${baseField} ${invalid ? 'border-red-500' : 'border-slate-300'}`

interface FieldProps {
  label: string
  error?: string
}

function FieldShell({ label, htmlFor, error, children }: FieldProps & { htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, error, className = '', id, type, ...rest }, ref) {
    const [passwordVisible, setPasswordVisible] = useState(false)
    const inputId = id ?? rest.name
    const isPassword = type === 'password'
    return (
      <FieldShell label={label} htmlFor={inputId} error={error}>
        <div className={isPassword ? 'relative' : undefined}>
          <input
            ref={ref}
            id={inputId}
            type={isPassword && passwordVisible ? 'text' : type}
            aria-invalid={error ? true : undefined}
            className={`${fieldClass(!!error)} ${isPassword ? 'pr-12' : ''} ${className}`}
            {...rest}
          />
          {isPassword && (
            <button
              type="button"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              aria-pressed={passwordVisible}
              aria-controls={inputId}
              onClick={() => setPasswordVisible((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {!passwordVisible && <path d="m3 3 18 18" />}
              </svg>
            </button>
          )}
        </div>
      </FieldShell>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(
  function Textarea({ label, error, className = '', id, ...rest }, ref) {
    const inputId = id ?? rest.name
    return (
      <FieldShell label={label} htmlFor={inputId} error={error}>
        <textarea
          ref={ref}
          id={inputId}
          rows={3}
          aria-invalid={error ? true : undefined}
          className={`${fieldClass(!!error)} ${className}`}
          {...rest}
        />
      </FieldShell>
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(
  function Select({ label, error, className = '', id, children, ...rest }, ref) {
    const inputId = id ?? rest.name
    return (
      <FieldShell label={label} htmlFor={inputId} error={error}>
        <select
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`${fieldClass(!!error)} ${className}`}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    )
  },
)

interface Option<T extends string> {
  value: T
  label: string
}

/** Filter buttons that wrap onto several lines. Replaces a dropdown with a single tap. */
export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`min-h-10 rounded border px-3 text-sm ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A joined group of equal-width buttons, for choosing one of a few values (e.g. a task status). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid auto-cols-fr grid-flow-col overflow-hidden rounded border border-slate-300 bg-white ${className}`}
    >
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(option.value)
            }}
            className={`min-h-10 px-2 text-xs font-medium leading-tight transition-colors duration-200 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm ${
              index > 0 ? 'border-l border-slate-300' : ''
            } ${active ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-slate-200 bg-white p-4 ${className}`}>{children}</div>
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="border border-dashed border-slate-300 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  action,
}: {
  title?: string
  message: string
  onRetry?: () => void
  action?: ReactNode
}) {
  return (
    <div role="alert" className="border border-red-300 bg-red-50 px-6 py-10 text-center">
      <h3 className="text-lg font-semibold text-red-900">{title}</h3>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {action}
      </div>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  return (
    <nav className="flex items-center justify-between gap-3 pt-4 text-sm text-slate-600" aria-label="Pagination">
      <span>
        Page {page} of {pages} | {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}

const TAG =
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide'

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'border-slate-300 text-slate-600',
  in_progress: 'border-amber-400 bg-amber-50 text-amber-800',
  completed: 'border-green-600/40 bg-green-50 text-green-800',
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'border-slate-300 text-slate-500',
  medium: 'border-slate-400 text-slate-700',
  high: 'border-red-400 bg-red-50 text-red-700',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`${TAG} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`${TAG} ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`${TAG} ${
        status === 'active' ? 'border-green-600/40 bg-green-50 text-green-800' : 'border-slate-300 text-slate-500'
      }`}
    >
      {status === 'active' ? 'Active' : 'Archived'}
    </span>
  )
}
