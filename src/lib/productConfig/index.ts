export type ProductType = 'catering' | 'vending' | 'gigs' | 'venues' | 'services'

export interface NavItem {
  id: string
  label: string
}

export interface ProductNavigation {
  red: NavItem[]
  blue: NavItem[]
}

export interface ProductLabels {
  command_center: string
  calendar: string
  coordinator: string
  check_in: string
  check_out: string
  times_logged: string
  interest_list: string
  estimated_hours: string
  footer_ask_ai: string
  footer_community: string
  sign_in_heading: string
  sign_in: string
  signing_in: string
  email: string
  password: string
  password_reset_note: string
  signed_in_success: string
  error_invalid_credentials: string
  error_network: string
  confirm: string
  coming_soon: string
  upcoming_events: string
  needs_attention: string
  fully_staffed: string
  month_view: string
  week_view: string
  today: string
  show_cancelled: string
  postponed_hold: string
  previous_period: string
  next_period: string
  this_week_and_next: string
}

export interface ProductColors {
  brand_navy: string
  brand_red: string
  status_green: string
  status_amber: string
  status_red: string
  status_blue: string
  brand_light_blue: string
  brand_mid_blue: string
  text_body: string
}

export interface ProductFeatures {
  ai_grid_generation: boolean
  beo_upload: boolean
  competing_events: boolean
  captain_portal: boolean
  sms_relay: boolean
  expert_mode: boolean
  rating_system: boolean
  temp_agency: boolean
  invoice_reconciliation: boolean
  incentives: boolean
  transport: boolean
}

export interface EventType {
  value: string
  label: string
  color: string
}

export interface ProductConfig {
  product_type: ProductType
  product_name: string
  brand_name: string
  trial_days: number
  navigation: ProductNavigation
  labels: ProductLabels
  colors: ProductColors
  features: ProductFeatures
  roles: string[]
  event_types: EventType[]
  grid_departments: string[]
  buffer_options: number[]
  rating_floors: number[]
}

export { default } from './catering.config'
