import type { SupportedLocale } from '@pianotechpros/i18n';

declare global {
  namespace App {
    interface Locals {
      locale: SupportedLocale;
    }
  }
}

export {};
