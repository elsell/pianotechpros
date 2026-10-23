import type { MessageKey } from '@pianotechpros/i18n';
import type { DealerProfileInput } from '@pianotechpros/api-client';
type Field = { key: Exclude<keyof DealerProfileInput, 'showroom_published'>; label: MessageKey; max: number; multiline?: boolean; keyboard?: 'email-address' | 'phone-pad' | 'url'; literal?: boolean };
export const dealerFieldGroups: { label: MessageKey; fields: Field[] }[] = [
  { label: 'dealer.contact', fields: [
    { key: 'name', label: 'dealer.name', max: 200 },
    { key: 'slug', label: 'dealer.slug', max: 80, literal: true },
    { key: 'email', label: 'dealer.email', max: 320, keyboard: 'email-address', literal: true },
    { key: 'phone', label: 'dealer.phone', max: 32, keyboard: 'phone-pad' },
    { key: 'website_url', label: 'dealer.website', max: 2048, keyboard: 'url', literal: true },
    { key: 'tagline', label: 'dealer.tagline', max: 240 },
    { key: 'description', label: 'dealer.description', max: 4000, multiline: true },
  ] },
  { label: 'dealer.address', fields: [
    { key: 'street_address_1', label: 'dealer.street1', max: 200 },
    { key: 'street_address_2', label: 'dealer.street2', max: 200 },
    { key: 'city', label: 'dealer.city', max: 100 },
    { key: 'region', label: 'dealer.region', max: 64 },
    { key: 'postal_code', label: 'dealer.postal', max: 20 },
  ] },
  { label: 'dealer.showroom', fields: [
    { key: 'accent_color', label: 'dealer.accent', max: 7, literal: true },
    { key: 'banner_alt_text', label: 'dealer.bannerAlt', max: 240 },
  ] },
  { label: 'dealer.notes', fields: [
    { key: 'appointment_note', label: 'dealer.appointment', max: 2000, multiline: true },
    { key: 'delivery_note', label: 'dealer.delivery', max: 2000, multiline: true },
    { key: 'warranty_note', label: 'dealer.warranty', max: 2000, multiline: true },
    { key: 'service_note', label: 'dealer.service', max: 2000, multiline: true },
  ] },
];
