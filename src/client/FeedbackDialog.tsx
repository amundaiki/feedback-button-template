'use client'

import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPES,
  type FeedbackSubmitPayload,
  type FeedbackType,
} from '../shared/feedback-types'

export type FeedbackDialogTexts = {
  title: string
  description: string
  typeLabel: string
  titleLabel: string
  titlePlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  contextHint: string
  cancel: string
  submit: string
  submitting: string
  sentTitle: string
  sentDescription: string
  close: string
  genericError: string
  networkError: string
}

export type FeedbackDialogClasses = {
  overlay?: string
  dialog?: string
  form?: string
  field?: string
  label?: string
  input?: string
  select?: string
  textarea?: string
  hint?: string
  actions?: string
  error?: string
  button?: string
}

export type FeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint?: string
  defaultType?: FeedbackType
  defaultTitle?: string
  defaultDescription?: string
  texts?: Partial<FeedbackDialogTexts>
  classes?: FeedbackDialogClasses
  getPage?: () => string | undefined
  includeUserAgent?: boolean
  onSent?: () => void
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'error'

const DEFAULT_TEXTS: FeedbackDialogTexts = {
  title: 'Send tilbakemelding',
  description: 'Fant du en feil, eller har du et forslag? Beskriv det her.',
  typeLabel: 'Hva gjelder det?',
  titleLabel: 'Kort oppsummering',
  titlePlaceholder: 'F.eks. Lagersiden viser feil antall',
  descriptionLabel: 'Beskrivelse',
  descriptionPlaceholder: 'Hva gjorde du, hva skjedde, og hva forventet du?',
  contextHint: 'Siden du står på logges automatisk.',
  cancel: 'Avbryt',
  submit: 'Send tilbakemelding',
  submitting: 'Sender...',
  sentTitle: 'Takk for tilbakemeldingen',
  sentDescription: 'Den er registrert og blir fulgt opp.',
  close: 'Lukk',
  genericError: 'Kunne ikke sende tilbakemeldingen. Prøv igjen om litt.',
  networkError: 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.',
}

function defaultGetPage(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}

export function FeedbackDialog({
  open,
  onOpenChange,
  endpoint = '/api/feedback',
  defaultType = 'bug',
  defaultTitle = '',
  defaultDescription = '',
  texts,
  classes,
  getPage = defaultGetPage,
  includeUserAgent = false,
  onSent,
}: FeedbackDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const mergedTexts = { ...DEFAULT_TEXTS, ...texts }
  const [type, setType] = useState<FeedbackType>(defaultType)
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState(defaultDescription)
  const [status, setStatus] = useState<SendStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (!open) return null

  function resetForm() {
    setType(defaultType)
    setTitle(defaultTitle)
    setDescription(defaultDescription)
    setStatus('idle')
    setErrorMessage('')
  }

  function closeDialog(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen && status === 'sent') resetForm()
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const payload: FeedbackSubmitPayload = { type, title, description }
    const page = getPage()
    if (page) payload.page = page
    if (includeUserAgent && typeof navigator !== 'undefined') {
      payload.userAgent = navigator.userAgent
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setStatus('sent')
        onSent?.()
        return
      }

      const data = (await response.json().catch(() => null)) as { feil?: string; error?: string } | null
      setErrorMessage(data?.feil ?? data?.error ?? mergedTexts.genericError)
      setStatus('error')
    } catch {
      setErrorMessage(mergedTexts.networkError)
      setStatus('error')
    }
  }

  return (
    <div data-feedback-overlay="" className={classes?.overlay}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-feedback-dialog=""
        className={classes?.dialog}
      >
        {status === 'sent' ? (
          <div data-feedback-sent="">
            <h2 id={titleId}>{mergedTexts.sentTitle}</h2>
            <p id={descriptionId}>{mergedTexts.sentDescription}</p>
            <div data-feedback-actions="" className={classes?.actions}>
              <button
                type="button"
                data-feedback-close=""
                className={classes?.button}
                onClick={() => closeDialog(false)}
              >
                {mergedTexts.close}
              </button>
            </div>
          </div>
        ) : (
          <form data-feedback-form="" className={classes?.form} onSubmit={send}>
            <header>
              <h2 id={titleId}>{mergedTexts.title}</h2>
              <p id={descriptionId}>{mergedTexts.description}</p>
            </header>

            <div data-feedback-field="" className={classes?.field}>
              <label htmlFor="feedback-type" className={classes?.label}>
                {mergedTexts.typeLabel}
              </label>
              <select
                id="feedback-type"
                data-feedback-select=""
                className={classes?.select}
                value={type}
                onChange={(event) => setType(event.target.value as FeedbackType)}
              >
                {FEEDBACK_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {FEEDBACK_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div data-feedback-field="" className={classes?.field}>
              <label htmlFor="feedback-title" className={classes?.label}>
                {mergedTexts.titleLabel}
              </label>
              <input
                id="feedback-title"
                data-feedback-input=""
                className={classes?.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mergedTexts.titlePlaceholder}
                maxLength={200}
                minLength={3}
                required
              />
            </div>

            <div data-feedback-field="" className={classes?.field}>
              <label htmlFor="feedback-description" className={classes?.label}>
                {mergedTexts.descriptionLabel}
              </label>
              <textarea
                id="feedback-description"
                data-feedback-textarea=""
                className={classes?.textarea}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={mergedTexts.descriptionPlaceholder}
                rows={5}
                maxLength={5000}
                minLength={3}
                required
              />
              <p data-feedback-hint="" className={classes?.hint}>
                {mergedTexts.contextHint}
              </p>
            </div>

            {status === 'error' ? (
              <p data-feedback-error="" className={classes?.error} role="alert" aria-live="polite">
                {errorMessage}
              </p>
            ) : null}

            <div data-feedback-actions="" className={classes?.actions}>
              <button
                type="button"
                data-feedback-cancel=""
                className={classes?.button}
                onClick={() => closeDialog(false)}
                disabled={status === 'sending'}
              >
                {mergedTexts.cancel}
              </button>
              <button
                type="submit"
                data-feedback-submit=""
                className={classes?.button}
                disabled={status === 'sending'}
              >
                {status === 'sending' ? mergedTexts.submitting : mergedTexts.submit}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
