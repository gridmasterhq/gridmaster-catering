import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { IconCircleCheck } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import {
  recordCheckOut,
  validateCheckoutCode,
} from '../../services/checkoutService'

type CheckoutState = 'idle' | 'submitting' | 'success' | 'error'

interface CheckoutCodeEntryProps {
  event_id: string
  staff_phone: string
  organization_id: string
  event_name: string
}

function GridMasterStaffHeader() {
  const { brand_name } = useProductConfig()
  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  return (
    <header
      style={{
        backgroundColor: '#1B3A5C',
        padding: '14px 16px',
        textAlign: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600 }}>
        {gridMasterWordmark}
      </span>
      {hqWordmark ? (
        <span style={{ color: '#E74C3C', fontSize: '16px', fontWeight: 600 }}>
          {hqWordmark}
        </span>
      ) : null}
    </header>
  )
}

function LoadingSpinner() {
  return (
    <div
      className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
      role="status"
      aria-label="Loading"
    />
  )
}

export default function CheckoutCodeEntry({
  event_id,
  staff_phone,
  organization_id,
  event_name,
}: CheckoutCodeEntryProps) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [state, setState] = useState<CheckoutState>('idle')
  const [shake, setShake] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const code = digits.join('')
  const canSubmit = code.length === 4 && state !== 'submitting'

  function focusInput(index: number) {
    inputRefs.current[index]?.focus()
  }

  function clearDigits() {
    setDigits(['', '', '', ''])
    focusInput(0)
  }

  useEffect(() => {
    focusInput(0)
  }, [])

  function handleDigitChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    if (state === 'error') {
      setState('idle')
    }

    const value = event.target.value.replace(/\D/g, '').slice(-1)
    const nextDigits = [...digits]
    nextDigits[index] = value
    setDigits(nextDigits)

    if (value && index < 3) {
      focusInput(index + 1)
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return
    }

    setState('submitting')

    const validation = await validateCheckoutCode({
      event_id,
      organization_id,
      entered_code: code,
    })

    if (!validation.valid) {
      setShake(true)
      clearDigits()
      setState('error')
      window.setTimeout(() => setShake(false), 400)
      return
    }

    await recordCheckOut({
      organization_id,
      event_id,
      staff_phone,
      checkout_method: 'code',
    })

    setState('success')
  }

  if (state === 'success') {
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ backgroundColor: '#1B3A5C' }}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-white">
          <IconCircleCheck size={64} stroke={1.5} color="#ffffff" />
          <p style={{ fontSize: '22px', fontWeight: 600, marginTop: '20px' }}>
            Times logged, shift complete.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <style>{`
        @keyframes checkout-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .checkout-shake {
          animation: checkout-shake 0.4s ease-in-out;
        }
      `}</style>

      <GridMasterStaffHeader />

      <main className="flex flex-1 flex-col px-5 py-8">
        <div className="mb-10 text-center">
          <p
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#1B3A5C',
            }}
          >
            {event_name}
          </p>
          <p style={{ fontSize: '15px', color: '#444444', marginTop: '8px' }}>
            Enter your 4-digit check-out code
          </p>
        </div>

        {state === 'submitting' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <div
              className={shake ? 'checkout-shake' : ''}
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputRefs.current[index] = element
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(event) => handleDigitChange(index, event)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  style={{
                    width: '56px',
                    height: '64px',
                    borderRadius: '10px',
                    border: '2px solid #d1d5db',
                    textAlign: 'center',
                    fontSize: '28px',
                    fontWeight: 600,
                    color: '#1B3A5C',
                  }}
                  aria-label={`Digit ${index + 1}`}
                />
              ))}
            </div>

            {state === 'error' ? (
              <p
                role="alert"
                style={{
                  color: '#EF4444',
                  fontSize: '14px',
                  textAlign: 'center',
                  marginTop: '16px',
                }}
              >
                That code doesn&apos;t match. Try again.
              </p>
            ) : null}

            <div className="mt-auto">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                style={{
                  width: '100%',
                  minHeight: '56px',
                  borderRadius: '10px',
                  backgroundColor: canSubmit ? '#1B3A5C' : '#9ca3af',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  marginTop: '32px',
                }}
              >
                Submit
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
