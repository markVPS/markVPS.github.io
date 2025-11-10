// background.js
(() => {
  'use strict';

  // Cross-browser shim
  const browserApi =
    (typeof self !== 'undefined' && (self.browser || self.chrome)) ||
    (typeof window !== 'undefined' && (window.browser || window.chrome)) ||
    browser || chrome;

  // Listen for scrape results from content.js
  browserApi.runtime.onMessage.addListener(async (msg, _sender, _sendResponse) => {
    if (!msg || msg.type !== 'SCRAPE_RESULT') return;

    try {
      const { data = [] } = msg; // [{ text, href }, ...]
      const csv = toCSV(data);

      // Use an object URL (Blob) for efficiency; data URLs also work if preferred
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = (self.URL || URL).createObjectURL(blob);

      await browserApi.downloads.download({
        url,
        filename: 'links.csv', // under the browser's Downloads directory
        saveAs: false,                            // no dialog; instantaneous
        conflictAction: 'overwrite'               // replace existing file
      });
    } catch (err) {
      console.error('Failed to create/download CSV:', err);
    }
  });

  function toCSV(rows) {
    // Ensure consistent columns even if text is empty
    const keys = ['text', 'href'];

    const esc = (val) => {
      if (val == null) return '';
      const s = String(val);
      // Escape quotes and wrap if contains comma, quote, or newline
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = keys.join(',');
    const body = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
    return [header, ...body].join('\n');
  }
})();
