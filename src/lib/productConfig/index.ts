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
  cc_action_items: string
  cc_staff_ai_inbox: string
  cc_labor_overview: string
  cc_vendor_alerts: string
  cc_highlights: string
  cc_tools: string
  cc_no_open_action_items: string
  cc_all_clear_subtext: string
  cc_needs_decision: string
  cc_human_required: string
  cc_resolved: string
  cc_no_events_this_week: string
  cc_no_vendor_alerts: string
  cc_no_highlights_yet: string
  cc_no_competing_events_detected: string
  cc_this_week: string
  cc_open: string
  cc_new: string
  cc_alerts: string
  cc_tool_competing_event_search: string
  cc_tool_weather_query: string
  cc_tool_traffic_query: string
  cc_tool_broadcast_all: string
  cc_tool_roster_health: string
  cc_tool_availability_pulse: string
  account_user: string
  my_profile: string
  event_mode: string
  sleep_mode: string
  log_out: string
  nav_section_operations: string
  nav_section_account: string
  nav_section_preferences: string
  nav_section_events: string
  nav_section_people: string
  nav_section_development: string
  nav_section_more: string
  training: string
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
