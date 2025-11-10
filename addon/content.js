// content.js
const browserApi = window.browser || window.chrome;

(function init() {
  if (window.__twocolumn_scraper_injected__) return;
  window.__twocolumn_scraper_injected__ = true;

  // Find the parent menu (#p-views ul)
  const pViews = document.querySelector('#p-views ul');
  if (!pViews) return;

  // Create a new <li> element styled like other action tabs
  const li = document.createElement('li');
  li.id = 'ca-download-links';

  const a = document.createElement('a');
  a.href = '#';
  a.textContent = 'Download data';
  a.style.cursor = 'pointer';
  li.appendChild(a);

  // Insert before VisualEditor tab (#ca-ve-edit) if present
  const veEdit = document.querySelector('#ca-ve-edit');
  if (veEdit && veEdit.parentNode === pViews) {
    pViews.insertBefore(li, veEdit);
  } else {
    pViews.appendChild(li); // fallback if VE not found
  }

  a.addEventListener('click', async (e) => {
    e.preventDefault();
    a.textContent = 'Saving…';
    a.style.opacity = '0.6';

    const anchors = Array.from(document.querySelectorAll('div.twocolumn a[href]'));
    const seen = new Set();
    const rows = [];
    for (const el of anchors) {
      const href = el.href;
      if (seen.has(href)) continue;
      seen.add(href);
      rows.push({
        text: (el.innerText || el.textContent || '').trim(),
        href
      });
    }

    await browserApi.runtime.sendMessage({
      type: 'SCRAPE_RESULT',
      data: rows
    });

    a.textContent = 'Done ✓';
    a.style.opacity = '1';
    setTimeout(() => { a.textContent = 'Download data'; }, 1500);
  });
})();
