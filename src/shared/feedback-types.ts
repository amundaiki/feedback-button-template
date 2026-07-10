export const FEEDBACK_TYPES = ['bug', 'forbedring'] as const

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: 'Feil (noe virker ikke)',
  forbedring: 'Forbedringsforslag',
}

export type FeedbackSubmitPayload = {
  type: FeedbackType
  title: string
  description: string
  page?: string
  imageUrl?: string
  userAgent?: string
}
