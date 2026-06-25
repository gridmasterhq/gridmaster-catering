import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function SMSDeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const role = params.get('role')
    const token = params.get('token')
    const event = params.get('event')

    if (!role || (role !== 'staff' && role !== 'captain')) {
      return
    }

    const redirectParams = new URLSearchParams()
    if (token) redirectParams.set('token', token)
    if (event) redirectParams.set('event', event)

    const query = redirectParams.toString()
    const suffix = query ? `?${query}` : ''

    if (role === 'staff') {
      navigate(`/staff/checkin${suffix}`)
      return
    }

    navigate(`/captain/portal${suffix}`)
  }, [navigate])

  return null
}

export default SMSDeepLinkHandler
