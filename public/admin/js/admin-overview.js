
"use strict";

(() => {
    const API_URL = "/api/admin/overview";
    const REFRESH_INTERVAL = 30000;

    const elements = {
        totalCustomers: document.getElementById("totalCustomers"),
        activeSubscriptions: document.getElementById("activeSubscriptions"),
        trialCustomers: document.getElementById("trialCustomers"),
        pendingPayments: document.getElementById("pendingPayments"),
        pageError: document.getElementById("pageError")
    };

    let requestInProgress = false;

    const numberFormatter = new Intl.NumberFormat("en-KE", {
        maximumFractionDigits: 0
    });

    function showError(message) {
        if (!elements.pageError) return;

        elements.pageError.textContent = message;
        elements.pageError.hidden = false;
    }

    function clearError() {
        if (!elements.pageError) return;

        elements.pageError.textContent = "";
        elements.pageError.hidden = true;
    }

    function validCount(value) {
        const count = Number(value);

        if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error("The server returned an invalid statistic.");
        }

        return numberFormatter.format(count);
    }

    function displayStatistics(stats) {
        if (!stats || typeof stats !== "object") {
            throw new Error("The server returned incomplete statistics.");
        }

        const values = {
            totalCustomers: validCount(stats.totalCustomers),
            activeSubscriptions: validCount(stats.activeSubscriptions),
            trialCustomers: validCount(stats.trialCustomers),
            pendingPayments: validCount(stats.pendingPayments)
        };

        elements.totalCustomers.textContent = values.totalCustomers;
        elements.activeSubscriptions.textContent = values.activeSubscriptions;
        elements.trialCustomers.textContent = values.trialCustomers;
        elements.pendingPayments.textContent = values.pendingPayments;
    }

    async function loadOverview() {
        if (requestInProgress || document.hidden) return;

        requestInProgress = true;

        try {
            const response = await fetch(API_URL, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            });

            const result = await response.json().catch(() => null);

            if (response.status === 401) {
                window.location.replace("/admin/login.html");
                return;
            }

            if (response.status === 403) {
                throw new Error(
                    "Your administrator account does not have permission to view platform statistics."
                );
            }

            if (!response.ok || !result || !result.success) {
                throw new Error(
                    result?.message || "Could not load platform statistics."
                );
            }

            displayStatistics(result.stats);
            clearError();

        } catch (error) {
            console.error("WIN Admin Overview error:", error);

            showError(
                error.message ||
                "Platform statistics are temporarily unavailable. Please try again."
            );

        } finally {
            requestInProgress = false;
        }
    }

    // Load real platform statistics immediately.
    loadOverview();

    // Refresh statistics every 30 seconds.
    window.setInterval(() => {
        loadOverview();
    }, REFRESH_INTERVAL);

    // Refresh when the administrator returns to this browser tab.
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            loadOverview();
        }
    });
})();
