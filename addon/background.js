// background.js — Firefox MV2 safe, with clear reply to sender
const api = (typeof browser !== 'undefined') ? browser : chrome;

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'SCRAPE_RESULT') return;

  try {
    const { data } = msg;                  // [{ text, href }, ...]
    const keys = ['text', 'href'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [keys.join(',')].concat(
      (data || []).map(o => keys.map(k => esc(o[k])).join(','))
    );
    const csv = rows.join('\n');
    const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);

    // Start download
    const opts = {
      url,
      filename: 'markVPS.github.io/links.csv', // under Downloads/
      saveAs: false,
      conflictAction: 'overwrite'
    };

    const done = (res) => sendResponse({ ok: true, id: res });
    const fail = (err) => {
      console.error('downloads.download error:', err);
      sendResponse({ ok: false, error: String(err) });
    };

    // Promise in Firefox, callback in Chrome; handle both
    const ret = api.downloads.download(opts, (id) => {
      // If callback form is used, this fires in Chrome
      if (api.runtime && api.runtime.lastError) {
        fail(api.runtime.lastError.message || api.runtime.lastError);
      } else {
        done(id);
      }
    });
    // If Promise form is used (Firefox), attach then/catch
    if (ret && typeof ret.then === 'function') ret.then(done, fail);
  } catch (e) {
    console.error('background exception:', e);
    sendResponse({ ok: false, error: String(e) });
  }

  // Keep the message channel open for async response
  return true;
});
git