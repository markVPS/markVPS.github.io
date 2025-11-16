// content.js
(() => {
  'use strict';
  const browserApi =
    (typeof browser !== 'undefined' && browser) ||
    (typeof chrome  !== 'undefined' && chrome)  || null;
  if (!browserApi) return;

  if (window.__aesth_lists_injected__) return;
  window.__aesth_lists_injected__ = true;

  const ready = () => init();
  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', ready, { once: true })
    : ready();

  function init() {
    const container =
      document.querySelector('#p-views .page-header__actions') ||
      document.querySelector('#p-views') ||
      document.querySelector('.page-header__actions') ||
      document.querySelector('#content') ||
      document.body;

    const btn = document.createElement('a');
    btn.href = '#';
    btn.id = 'ca-download-lists';
    btn.className = 'wds-button wds-is-text page-header__action-button has-label';
    btn.textContent = 'Download lists (TSV + JSON)';
    const ve = document.querySelector('#ca-ve-edit');
    if (ve && ve.parentNode === container) container.insertBefore(btn, ve);
    else container.appendChild(btn);

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const original = btn.textContent;
      btn.textContent = 'Scanning…';

      const listUrl   = findExactHref('https://aesthetics.fandom.com/wiki/List_of_Aesthetics');
      const sortingUrl= findExactHref('https://aesthetics.fandom.com/wiki/Category:Sorting');

      if (!listUrl && !sortingUrl) {
        btn.textContent = 'Target links not found';
        setTimeout(() => (btn.textContent = original), 2500);
        return;
      }

      try {
        await browserApi.runtime.sendMessage({
          type: 'HARVEST_LISTS_ONLY',
          listUrl,
          sortingUrl
        });
        btn.textContent = 'Working… (check Downloads)';
      } catch (err) {
        console.error(err);
        btn.textContent = 'Error — see console';
      } finally {
        setTimeout(() => (btn.textContent = original), 2500);
      }
    });
  }

  function findExactHref(target) {
    const as = Array.from(document.querySelectorAll('a[href]'));
    for (const a of as) {
      try {
        const abs = new URL(a.getAttribute('href'), location.origin).toString();
        if (abs === target) return abs;
      } catch {}
    }
    return null;
  }
})();
