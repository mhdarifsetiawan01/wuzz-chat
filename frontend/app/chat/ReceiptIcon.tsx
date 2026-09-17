import React from 'react'
import type { Message } from '@/lib/types'

interface ReceiptIconProps {
  status?: Message['status']
  className?: string
  style?: React.CSSProperties
}

/**
 * Flagship SVG-based message receipt indicator (WhatsApp/Telegram standard).
 * High-contrast, sharp vector strokes with neon glow for OLED/Retina displays.
 */
export function ReceiptIcon({ status, className = '', style }: ReceiptIconProps) {
  switch (status) {
    case 'pending':
      return (
        <span
          className={`receipt-icon receipt-pending ${className}`}
          title="Sedang dikirim..."
          style={style}
        >
          🕒
        </span>
      )

    case 'delivered':
      return (
        <span
          className={`receipt-icon receipt-delivered ${className}`}
          title="Tersampaikan"
          style={style}
        >
          <svg
            className="receipt-svg double"
            viewBox="0 0 18 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 6.5L5 10L13 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.5 6.5L9 10L17 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )

    case 'read':
      return (
        <span
          className={`receipt-icon receipt-read ${className}`}
          title="Dibaca"
          style={style}
        >
          <svg
            className="receipt-svg double"
            viewBox="0 0 18 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 6.5L5 10L13 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.5 6.5L9 10L17 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )

    case 'sent':
    default:
      return (
        <span
          className={`receipt-icon receipt-sent ${className}`}
          title="Terkirim ke server"
          style={style}
        >
          <svg
            className="receipt-svg single"
            viewBox="0 0 14 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 6.5L5 10L12.5 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )
  }
}
