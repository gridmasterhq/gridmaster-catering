import { type FormEvent, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

function LoginPage() {
  const { brand_name, product_name, labels } = useProductConfig()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        const message = authError.message.toLowerCase()

        if (
          message.includes('invalid login credentials') ||
          message.includes('invalid email or password')
        ) {
          setError(labels.error_invalid_credentials)
        } else if (
          message.includes('fetch') ||
          message.includes('network') ||
          authError.status === 0
        ) {
          setError(labels.error_network)
        } else {
          setError(authError.message)
        }
        return
      }

      console.log(data.session)
      setSuccess(true)
    } catch {
      setError(labels.error_network)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-1 items-center justify-center bg-brand-light-blue p-4">
      <div className="w-full max-w-[400px] rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <div className="leading-tight">
            <span className="text-xl font-bold text-brand-navy">
              {gridMasterWordmark}
            </span>
            {hqWordmark ? (
              <span className="text-xl font-bold text-brand-red">
                {hqWordmark}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-text-body">{product_name}</p>
        </div>

        <h1 className="mb-6 text-center text-lg font-medium text-text-body">
          {labels.sign_in_heading}
        </h1>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-text-body"
            >
              {labels.email}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-text-body focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-text-body"
            >
              {labels.password}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-text-body focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded bg-brand-navy px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? labels.signing_in : labels.sign_in}
          </button>
        </form>

        {error ? (
          <p className="mt-4 text-center text-sm text-status-red" role="alert">
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            className="mt-4 text-center text-sm text-status-green"
            role="status"
          >
            {labels.signed_in_success}
          </p>
        ) : null}

        <p className="mt-6 text-center text-xs text-gray-500">
          {labels.password_reset_note}
        </p>
      </div>
    </div>
  )
}

export default LoginPage
