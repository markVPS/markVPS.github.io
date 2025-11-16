// background.js
(() => {
  "use strict";
  const browserApi =
    (typeof browser !== "undefined" && browser) ||
    (typeof chrome !== "undefined" && chrome) ||
    null;
  if (!browserApi) return;

  browserApi.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== "HARVEST_GROUPS_AND_LIST") return;
    (async () => {
      const { listUrl, sortingUrl } = msg;
      const currentWindowId = sender?.tab?.windowId;
      let workerTabId = null;

      try {
        // --- 1) List_of_Aesthetics: collect mainspace pages (no “Category:” here) ---
        if (listUrl) {
          workerTabId = await ensureWorkerTab(workerTabId, listUrl, currentWindowId);
          await waitForComplete(workerTabId);
          const listLinks = await exec(workerTabId, scrapeListOfAesthetics.toString(), listUrl);
          await saveText(
            oneColTsv(["url"], listLinks),
            "markVPS.github.io/tsv/aesthetics_list.tsv"
          );
        }

        // --- 2) Category:Sorting → collect ONLY Category:* links into one TSV ---
        if (sortingUrl) {
          workerTabId = await ensureWorkerTab(workerTabId, sortingUrl, currentWindowId);
          await waitForComplete(workerTabId);
          const groupLinks = await exec(workerTabId, scrapeSortingCategoriesOnly.toString(), sortingUrl);
          await saveText(
            oneColTsv(["url"], groupLinks),
            "markVPS.github.io/tsv/groups.tsv"   // <-- single file, no groups/ folder
          );
        }
      } catch (e) {
        console.error("[harvest] error:", e);
      } finally {
        if (workerTabId) {
          try { await browserApi.tabs.remove(workerTabId); } catch {}
        }
      }
    })();
  });

  // ---------- helpers ----------
  async function ensureWorkerTab(tabId, url, windowId) {
    if (!tabId) {
      const tab = await browserApi.tabs.create({ url, active: false, ...(windowId ? { windowId } : {}) });
      return tab.id;
    } else {
      await browserApi.tabs.update(tabId, { url, active: false });
      return tabId;
    }
  }

  function waitForComplete(tabId) {
    return new Promise((resolve) => {
      const listener = (id, info) => {
        if (id === tabId && info.status === "complete") {
          browserApi.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browserApi.tabs.onUpdated.addListener(listener);
      // safety timeout
      setTimeout(() => {
        try { browserApi.tabs.onUpdated.removeListener(listener); } catch {}
        resolve();
      }, 20000);
    });
  }

  async function exec(tabId, fnString, urlArg) {
    const results = await browserApi.tabs.executeScript(tabId, {
      runAt: "document_idle",
      code: `(${fnString})(${JSON.stringify(urlArg)})`,
    });
    return Array.isArray(results) ? results[0] || [] : results || [];
  }

  function oneColTsv(headers, rows) {
    const lines = [];
    lines.push(headers.join('\t'));
    const seen = new Set();
    for (const r of rows) {
      const v = String(r || '').replace(/[\r\n]+/g, ' ').trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      lines.push(v);
    }
    return lines.join('\n') + '\n';
  }

  async function saveText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = (self.URL || URL).createObjectURL(blob);
    await browserApi.downloads.download({
      url,
      filename,             // e.g., markVPS.github.io/tsv/groups.tsv
      saveAs: false,
      conflictAction: "overwrite",
    });
  }

  function normAbs(href, base) {
    try { return new URL(href, base).toString(); } catch { return null; }
  }

  // ---------- in-page scrapers ----------

  // A) List_of_Aesthetics: grab mainspace pages (no colon in the /wiki/<Title>)
  function scrapeListOfAesthetics(baseUrl) {
    const out = [];
    const root = document.querySelector("div.twocolumn") || document.querySelector("#mw-content-text") || document.body;
    if (root) {
      for (const a of root.querySelectorAll("a[href]")) {
        const abs = (function(h){ try { return new URL(h, baseUrl).toString(); } catch { return null; } })(a.getAttribute("href"));
        if (!abs) continue;
        if (!abs.startsWith("https://aesthetics.fandom.com/wiki/")) continue;
        // exclude special namespaces ONLY here; List pages are mainspace
        const after = abs.split("/wiki/")[1] || "";
        if (!after || after.includes(":")) continue;     // keep mainspace only
        out.push(abs);
      }
    }
    const seen = new Set(), unique = [];
    for (const u of out) if (!seen.has(u)) { seen.add(u); unique.push(u); }
    return unique;
  }

  // B) Category:Sorting → collect ONLY Category:* links
  function scrapeSortingCategoriesOnly(baseUrl) {
    const out = [];
    const root = document.querySelector("#mw-content-text") || document.body;
    if (root) {
      // select anchors with the right class AND whose title begins with "Category:"
      for (const a of root.querySelectorAll('a.category-page__member-link[href][title^="Category:"]')) {
        const abs = (function(h){ try { return new URL(h, baseUrl).toString(); } catch { return null; } })(a.getAttribute("href"));
        if (!abs) continue;
        // Sanity: make sure they are actually /wiki/Category:*
        if (!/\/wiki\/Category:/.test(abs)) continue;
        out.push(abs);
      }
    }
    const seen = new Set(), unique = [];
    for (const u of out) if (!seen.has(u)) { seen.add(u); unique.push(u); }
    return unique;
  }
})();
