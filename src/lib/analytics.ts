// Тонкая обёртка над gtag для отправки пользовательских событий в Google
// Analytics (GA4). Сам gtag.js подключается в app/layout.tsx (см.
// NEXT_PUBLIC_GA_ID) — если аналитика не настроена или скрипт ещё не успел
// загрузиться, window.gtag просто отсутствует, и trackEvent тихо ничего не
// делает (никаких ошибок в консоли и на localhost/dev).
type GtagEventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const trackEvent = (action: string, params?: GtagEventParams): void => {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', action, params);
};