// background.js
(() => {
  "use strict";

  const browserApi =
    (typeof browser !== "undefined" && browser) ||
    (typeof chrome !== "undefined" && chrome) ||
    null;
  if (!browserApi) {
    console.error("[bg] no browser API");
    return;
  }

  console.log("[bg] loaded");

  browserApi.runtime.onMessage.addListener((msg, sender) => {
    console.log("[bg] message:", msg);
    if (!msg || msg.type !== "HARVEST_GROUPS_AND_LIST") return;

    (async () => {
      const { listUrl, sortingUrl } = msg;
      const currentWindowId = sender?.tab?.windowId;
      let workerTabId = null;

      try {
        // 1) List_of_Aesthetics: ALL .twocolumn sections → mainspace links
        if (listUrl) {
          console.log("[bg] listUrl:", listUrl);
          workerTabId = await ensureWorkerTab(workerTabId, listUrl, currentWindowId);
          await waitForComplete(workerTabId);

          const aestheticsLinks = await exec(
            workerTabId,
            scrapeAllTwocolumnAesthetics.toString(),
            listUrl
          );
          console.log("[bg] aesthetics count:", aestheticsLinks.length);

          await saveText(
            oneColTsv(["url"], aestheticsLinks),
            "markVPS.github.io/tsv/aesthetics_list.tsv"
          );
          await saveJson(
            aestheticsLinks,
            "markVPS.github.io/json/aesthetics_list.json"
          );
        } else {
          console.log("[bg] no listUrl");
        }

        // 2) Category:Sorting: only Category:* via .category-page__member-link + title^="Category:"
        if (sortingUrl) {
          console.log("[bg] sortingUrl:", sortingUrl);
          workerTabId = await ensureWorkerTab(workerTabId, sortingUrl, currentWindowId);
          await waitForComplete(workerTabId);

          const groupLinks = await exec(
            workerTabId,
            scrapeSortingCategoriesOnly.toString(),
            sortingUrl
          );
          console.log("[bg] groups count:", groupLinks.length);

          await saveText(
            oneColTsv(["url"], groupLinks),
            "markVPS.github.io/tsv/groups.tsv"
          );
        } else {
          console.log("[bg] no sortingUrl");
        }

      } catch (e) {
        console.error("[bg] error:", e);

      } finally {
        if (workerTabId) {
          try { await browserApi.tabs.remove(workerTabId); } catch {}
          console.log("[bg] worker tab closed");
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
      setTimeout(() => {
        try { browserApi.tabs.onUpdated.removeListener(listener); } catch {}
        resolve();
      }, 20000);
    });
  }

  async function exec(tabId, fnString, urlArg) {
    try {
      const results = await browserApi.tabs.executeScript(tabId, {
        runAt: "document_idle",
        code: `(${fnString})(${JSON.stringify(urlArg)})`,
      });
      return Array.isArray(results) ? (results[0] || []) : (results || []);
    } catch (e) {
      console.error("[bg] exec error:", e);
      throw e;
    }
  }

  function oneColTsv(headers, rows) {
    const lines = [];
    lines.push(headers.join("\t"));
    const seen = new Set();
    for (const r of rows) {
      const v = String(r || "").replace(/[\r\n]+/g, " ").trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      lines.push(v);
    }
    return lines.join("\n") + "\n";
  }

  async function saveText(text, filename) {
    const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8" });
    const url = (self.URL || URL).createObjectURL(blob);
    await browserApi.downloads.download({
      url,
      filename,              // -> ~/Downloads/markVPS.github.io/tsv/...
      saveAs: false,
      conflictAction: "overwrite",
    });
  }

  async function saveJson(obj, filename) {
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = (self.URL || URL).createObjectURL(blob);
    await browserApi.downloads.download({
      url,
      filename,              // -> ~/Downloads/markVPS.github.io/json/...
      saveAs: false,
      conflictAction: "overwrite",
    });
  }

  // ---------- in-page scrapers ----------

  // A) ALL .twocolumn blocks on List_of_Aesthetics → mainspace /wiki/... only
  function scrapeAllTwocolumnAesthetics(baseUrl) {
    const toAbs = (h) => { try { return new URL(h, baseUrl).toString(); } catch { return null; } };

    const blocks = Array.from(document.querySelectorAll('div.twocolumn'));
    const roots = blocks.length ? blocks : [document.querySelector('#mw-content-text') || document.body];

    const out = [];
    for (const root of roots) {
      for (const a of root.querySelectorAll('a[href]')) {
        const abs = toAbs(a.getAttribute('href'));
        if (!abs) continue;
        if (!abs.startsWith("https://aesthetics.fandom.com/wiki/")) continue;
        const after = abs.split("/wiki/")[1] || "";
        if (!after || after.includes(":")) continue; // skip Category:, File:, Special:, etc.
        out.push(abs);
      }
    }
    const seen = new Set(), unique = [];
    for (const u of out) if (!seen.has(u)) { seen.add(u); unique.push(u); }
    return unique;
  }

  // B) Category:Sorting → ONLY Category:* via class + title
  function scrapeSortingCategoriesOnly(baseUrl) {
    const toAbs = (h) => { try { return new URL(h, baseUrl).toString(); } catch { return null; } };
    const root = document.querySelector('#mw-content-text') || document.body;
    const out = [];
    if (root) {
      for (const a of root.querySelectorAll('a.category-page__member-link[href][title^="Category:"]')) {
        const abs = toAbs(a.getAttribute('href'));
        if (!abs) continue;
        if (!/\/wiki\/Category:/.test(abs)) continue;
        out.push(abs);
      }
    }
    const seen = new Set(), unique = [];
    for (const u of out) if (!seen.has(u)) { seen.add(u); unique.push(u); }
    return unique;
  }
})();
