
"use strict";

// WIN Business Suite PWA Registration

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register(
                "/service-worker.js",
                { scope: "/" }
            );

            console.info(
                "WIN PWA service worker registered:",
                registration.scope
            );
        } catch (error) {
            console.error(
                "WIN PWA service worker registration failed:",
                error
            );
        }
    });
}
