// content.js
(() => {
  'use strict';

  // Cross-browser shim
  const browserApi = (typeof window !== 'undefined' && (window.browser || window.chrome)) || browser || chrome;

  if (window.__twocolumn_scraper_injected__) return;
  window.__twocolumn_scraper_injected__ = true;

  // Wait for DOM if needed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    // Find the p-views menu's <ul>
    const pViewsUl = document.querySelector('#p-views ul');
    if (!pViewsUl) return;

    // Create <li><a>Download data</a></li> styled like other action tabs
    const li = document.createElement('li');
    li.id = 'ca-download-links';

    const a = document.createElement('a');
    a.href = '#';
    a.textContent = 'Download data';
    a.style.cursor = 'pointer';
    li.appendChild(a);

    // Insert before VisualEditor tab if present, otherwise append at end
    const veLi = document.querySelector('#ca-ve-edit');
    if (veLi && veLi.parentNode === pViewsUl) {
      pViewsUl.insertBefore(li, veLi);
    } else {
      pViewsUl.appendChild(li);
    }

    a.addEventListener('click', async (ev) => {
      ev.preventDefault();

      // Simple UI feedback
      const originalText = a.textContent;
      a.textContent = 'Saving…';
      a.style.opacity = '0.7';

      // Collect links inside div.twocolumn
      const anchors = Array.from(document.querySelectorAll('div.twocolumn a[href]'));
      const seen = new Set();
      const rows = [];

      for (const el of anchors) {
        const href = el.href;
        if (!href) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        rows.push({
          text: (el.innerText || el.textContent || '').trim(),
          href
        });
      }

      try {
        await browserApi.runtime.sendMessage({
          type: 'SCRAPE_RESULT',
          data: rows
        });
        a.textContent = 'Done ✓';
      } catch (e) {
        console.error('Download sendMessage failed:', e);
        a.textContent = 'Error — see console';
      } finally {
        a.style.opacity = '1';
        setTimeout(() => {
          a.textContent = originalText;
        }, 1200);
      }
    });
  }
})();
