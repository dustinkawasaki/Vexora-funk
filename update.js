(() => {
  const APP_VERSION = "1.0.0";
  const VERSION_URL = "./version.json";
  let registration = null;
  let reloading = false;

  const compareVersions = (a, b) => {
    const aa = String(a).split(".").map(Number);
    const bb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const diff = (aa[i] || 0) - (bb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  };

  function showUpdate(versionInfo) {
    if (document.getElementById("vexora-update-banner")) return;
    const banner = document.createElement("section");
    banner.id = "vexora-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText = "position:sticky;top:0;z-index:9999;padding:13px 16px;background:#203a62;color:#fff;border-bottom:1px solid #6d9cff;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;font:14px/1.45 system-ui,sans-serif";
    const info = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = "VEXORA-Update verfügbar";
    const detail = document.createElement("div");
    detail.textContent = "Version " + versionInfo.version + " ist verfügbar. " + (versionInfo.releaseNotes || "Aktualisiere die App, um die neueste Version zu verwenden.");
    info.append(heading, detail);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Jetzt aktualisieren";
    button.style.cssText = "border:0;border-radius:9px;padding:10px 14px;background:#9bbcff;color:#081426;font-weight:800;cursor:pointer";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Aktualisiere …";
      try {
        if ("serviceWorker" in navigator) {
          if (!registration) registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
              return;
            }
            const installing = registration.installing;
            if (installing) {
              await new Promise(resolve => {
                const done = () => {
                  if (installing.state === "installed" || installing.state === "redundant") {
                    installing.removeEventListener("statechange", done);
                    resolve();
                  }
                };
                installing.addEventListener("statechange", done);
                done();
              });
            }
            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
              return;
            }
          }
        }
        const url = new URL(location.href);
        url.searchParams.set("vexora_refresh", String(Date.now()));
        location.replace(url.toString());
      } catch (error) {
        button.disabled = false;
        button.textContent = "Erneut versuchen";
      }
    });
    banner.append(info, button);
    document.body.prepend(banner);
  }

  async function checkVersion() {
    try {
      const response = await fetch(VERSION_URL + "?check=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      const info = await response.json();
      if (info.version && compareVersions(info.version, APP_VERSION) > 0) showUpdate(info);
    } catch (_) {
      // Offline: keep the app usable and try again next time.
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        registration = await navigator.serviceWorker.register("./service-worker.js");
        await checkVersion();
        if (registration.waiting) {
          const response = await fetch(VERSION_URL + "?check=" + Date.now(), { cache: "no-store" });
          if (response.ok) showUpdate(await response.json());
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", async () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              try {
                const response = await fetch(VERSION_URL + "?check=" + Date.now(), { cache: "no-store" });
                if (response.ok) showUpdate(await response.json());
              } catch (_) {}
            }
          });
        });
        window.setInterval(() => {
          registration.update().catch(() => {});
          checkVersion();
        }, 30 * 60 * 1000);
      } catch (_) {}
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  } else {
    window.addEventListener("load", checkVersion);
  }
})();
