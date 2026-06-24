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
  coordinator: string
  check_in: string
  check_out: string
  times_logged: string
  interest_list: string
  estimated_hours: string
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
