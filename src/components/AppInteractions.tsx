'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { recoverFromStaleClientRuntime } from '@/libs/ClientRuntimeRecovery';

const clickableSelector = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(',');

const isModifiedClick = (event: MouseEvent | PointerEvent) =>
  event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isInternalRoute = (anchor: HTMLAnchorElement) => {
  if (anchor.target || anchor.hasAttribute('download')) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) {
    return false;
  }

  return `${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`;
};

const isSamePageAnchor = (anchor: HTMLAnchorElement) => {
  const url = new URL(anchor.href, window.location.href);

  return (
    url.origin === window.location.origin
    && url.pathname === window.location.pathname
    && url.search === window.location.search
    && url.hash.length > 1
  );
};

const easeInOutCubic = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

const scrollToAnchor = (anchor: HTMLAnchorElement) => {
  const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)));

  if (!target) {
    return;
  }

  if (prefersReducedMotion()) {
    target.scrollIntoView();
    return;
  }

  const startY = window.scrollY;
  const targetY = Math.max(0, target.getBoundingClientRect().top + startY - 96);
  const distance = targetY - startY;
  const duration = Math.min(1200, Math.max(720, Math.abs(distance) * 0.55));
  const startTime = performance.now();

  const animate = (time: number) => {
    const progress = Math.min(1, (time - startTime) / duration);

    window.scrollTo({
      top: startY + distance * easeInOutCubic(progress),
      left: 0,
      behavior: 'instant',
    });

    if (progress < 1) {
      window.requestAnimationFrame(animate);
      return;
    }

    window.history.replaceState(null, '', anchor.hash);
  };

  window.requestAnimationFrame(animate);
};

const createRipple = (target: HTMLElement, event: PointerEvent) => {
  if (prefersReducedMotion()) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');

  ripple.className = 'app-press-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

  target.querySelectorAll('.app-press-ripple').forEach(item => item.remove());
  target.append(ripple);
};

const shouldRegisterServiceWorker = () => {
  return 'serviceWorker' in navigator
    && window.location.protocol === 'https:'
    && !window.location.hostname.includes('localhost')
    && !window.location.hostname.startsWith('127.');
};

export const AppInteractions = () => {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.removeAttribute('data-route-transition');
  }, [pathname]);

  useEffect(() => {
    if (!shouldRegisterServiceWorker()) {
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    let transitionTimeout: number | undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (isModifiedClick(event)) {
        return;
      }

      const target = (event.target as Element | null)?.closest<HTMLElement>(clickableSelector);

      if (!target || target.matches(':disabled, [aria-disabled="true"]')) {
        return;
      }

      target.classList.add('app-action-pressable');
      createRipple(target, event);

      if (target instanceof HTMLAnchorElement && isInternalRoute(target)) {
        document.documentElement.setAttribute('data-route-transition', 'true');
      }
    };

    const handleSubmit = () => {
      document.documentElement.setAttribute('data-route-transition', 'true');
    };

    const handleClick = (event: MouseEvent) => {
      if (isModifiedClick(event)) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');

      if (!anchor || !isSamePageAnchor(anchor)) {
        return;
      }

      event.preventDefault();
      scrollToAnchor(anchor);
    };

    const clearTransition = () => {
      transitionTimeout = window.setTimeout(() => {
        document.documentElement.removeAttribute('data-route-transition');
      }, 900);
    };

    const handleRuntimeError = (event: ErrorEvent) => {
      if (recoverFromStaleClientRuntime(event.error ?? event.message)) {
        event.preventDefault();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (recoverFromStaleClientRuntime(event.reason)) {
        event.preventDefault();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('submit', handleSubmit, { capture: true });
    window.addEventListener('error', handleRuntimeError);
    window.addEventListener('pageshow', clearTransition);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      if (transitionTimeout) {
        window.clearTimeout(transitionTimeout);
      }

      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('submit', handleSubmit, { capture: true });
      window.removeEventListener('error', handleRuntimeError);
      window.removeEventListener('pageshow', clearTransition);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
};
