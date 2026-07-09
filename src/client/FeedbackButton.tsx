'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

import { FeedbackDialog, type FeedbackDialogProps } from './FeedbackDialog'

export type FeedbackButtonProps = Omit<FeedbackDialogProps, 'open' | 'onOpenChange'> & {
  buttonLabel?: string
  buttonContent?: ReactNode
  className?: string
}

export function FeedbackButton({
  buttonLabel = 'Tilbakemelding',
  buttonContent,
  className,
  ...dialogProps
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        data-feedback-button=""
        className={className}
        onClick={() => setOpen(true)}
      >
        {buttonContent ?? buttonLabel}
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} {...dialogProps} />
    </>
  )
}
