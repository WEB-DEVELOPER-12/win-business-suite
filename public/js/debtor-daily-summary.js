
"use strict";

(() => {
    const API_BASE = "/api";

    const params = new URLSearchParams(window.location.search);
    const debtorId = Number(params.get("id"));

    const dateInput = document.getElementById("dailyNotebookDate");
    const dailyTab = document.getElementById("dailyRecordsTab");
    const notebookContent = document.getElementById("notebookContent");
    const recordsBody = document.getElementById("customerRecordsBody");

    if (!dateInput || !dailyTab || !notebookContent) return;

    let requestNumber = 0;
    let activeDate = "";
    let businessCurrency = "KES";
    let currencyPromise = null;
    let observer = null;
    let refreshScheduled = false;

    function getNairobiDate() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Nairobi",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());

        const values = {};

        parts.forEach(part => {
            values[part.type] = part.value;
        });

        return `${values.year}-${values.month}-${values.day}`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => {
            const replacements = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return replacements[character];
        });
    }

    function formatMoney(value) {
        const amount = Number(value) || 0;

        try {
            return new Intl.NumberFormat("en", {
                style: "currency",
                currency: businessCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch {
            return `${businessCurrency} ${amount.toLocaleString("en", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }
    }

    async function loadBusinessCurrency() {
        if (currencyPromise) return currencyPromise;

        currencyPromise = (async () => {
            try {
                const response = await fetch(`${API_BASE}/auth/me`, {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                });

                if (response.status === 401) {
                    window.location.href = "/login.html";
                    return;
                }

                if (!response.ok) return;

                const data = await response.json();
                const user = data.user || {};
                const business = user.business || data.business || {};

                const currency =
                    business.currency ||
                    user.currency ||
                    data.currency ||
                    "KES";

                const normalized = String(currency).trim().toUpperCase();

                if (/^[A-Z]{3}$/.test(normalized)) {
                    businessCurrency = normalized;
                }
            } catch (error) {
                console.error("Business currency loading error:", error);
            }
        })();

        return currencyPromise;
    }

    function createSummaryContainer() {
        let container = document.getElementById("dailyNotebookSummary");

        if (container) return container;

        container = document.createElement("section");
        container.id = "dailyNotebookSummary";
        container.setAttribute("aria-label", "Daily notebook summary");

        container.style.cssText = `
            display: none;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 20px;
        `;

        const style = document.createElement("style");
        style.id = "dailyNotebookSummaryStyles";

        style.textContent = `
            @media (max-width: 700px) {
                #dailyNotebookSummary {
                    grid-template-columns: 1fr !important;
                }
            }

            #dailyNotebookSummary .stat-card h2 {
                overflow-wrap: anywhere;
            }

            #dailyNotebookSummary .stat-card p {
                overflow-wrap: anywhere;
            }

            #dailyBalanceLabel {
                margin-top: 7px;
                font-size: 12px;
            }
        `;

        if (!document.getElementById(style.id)) {
            document.head.appendChild(style);
        }

        notebookContent.parentNode.insertBefore(container, notebookContent);

        return container;
    }

    function showSummaryMessage(message) {
        const container = createSummaryContainer();

        container.innerHTML = `
            <div class="stat-card" style="grid-column: 1 / -1;">
                <p>${escapeHTML(message)}</p>
            </div>
        `;

        container.style.display = "grid";
    }

    function renderSummary(notebook) {
        const goodsTaken = Number(notebook.debt_added) || 0;
        const paymentsReceived = Number(notebook.payments_received) || 0;
        const closingBalance = Number(notebook.closing_balance) || 0;

        let balanceLabel = "Account settled";

        if (closingBalance > 0) {
            balanceLabel = "Outstanding balance";
        } else if (closingBalance < 0) {
            balanceLabel = "Customer credit";
        }

        const container = createSummaryContainer();

        container.innerHTML = `
            <div class="stat-card">
                <p>Goods Taken</p>
                <h2>${escapeHTML(formatMoney(goodsTaken))}</h2>
            </div>

            <div class="stat-card">
                <p>Payments Received</p>
                <h2>${escapeHTML(formatMoney(paymentsReceived))}</h2>
            </div>

            <div class="stat-card">
                <p>Closing Balance</p>
                <h2>${escapeHTML(formatMoney(closingBalance))}</h2>
                <p id="dailyBalanceLabel" aria-live="polite">
                    ${escapeHTML(balanceLabel)}
                </p>
            </div>
        `;

        container.style.display = "grid";
    }

    function isValidDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));

        return (
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
        );
    }

    async function loadDailySummary() {
        if (!Number.isInteger(debtorId) || debtorId <= 0) return;

        const date = dateInput.value;
        const today = getNairobiDate();

        if (!isValidDate(date)) {
            showSummaryMessage("Please select a valid notebook date.");
            return;
        }

        if (date > today) {
            dateInput.value = today;
            activeDate = today;
            showSummaryMessage("Future notebook dates are not available.");
            return;
        }

        activeDate = date;

        const thisRequest = ++requestNumber;

        showSummaryMessage("Loading daily notebook summary...");

        try {
            await loadBusinessCurrency();

            if (thisRequest !== requestNumber) return;

            const response = await fetch(
                `${API_BASE}/debtors/${debtorId}/notebooks/daily?date=${encodeURIComponent(date)}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            let data;

            try {
                data = await response.json();
            } catch {
                throw new Error("The server returned an invalid response.");
            }

            if (response.status === 401) {
                window.location.href = "/login.html";
                return;
            }

            if (!response.ok || data.success === false || !data.notebook) {
                throw new Error(
                    data.message || "Could not load the daily summary."
                );
            }

            if (thisRequest !== requestNumber) return;

            renderSummary(data.notebook);
        } catch (error) {
            if (thisRequest !== requestNumber) return;

            console.error("Daily summary error:", error);

            showSummaryMessage(
                `Daily summary unavailable: ${error.message || "Please try again."}`
            );
        }
    }

    function isDailyTabActive() {
        return dailyTab.classList.contains("active");
    }

    function refreshIfDaily() {
        if (!isDailyTabActive()) return;

        loadDailySummary();
    }

    function scheduleRefresh() {
        if (refreshScheduled) return;

        refreshScheduled = true;

        queueMicrotask(() => {
            refreshScheduled = false;
            refreshIfDaily();
        });
    }

    function initialize() {
        if (!Number.isInteger(debtorId) || debtorId <= 0) return;

        createSummaryContainer();

        const today = getNairobiDate();

        dateInput.max = today;

        if (!dateInput.value || !isValidDate(dateInput.value) || dateInput.value > today) {
            dateInput.value = today;
        }

        activeDate = dateInput.value;

        dailyTab.addEventListener("click", () => {
            if (isDailyTabActive()) {
                loadDailySummary();
            }
        });

        dateInput.addEventListener("change", () => {
            const selectedDate = dateInput.value;

            if (!isValidDate(selectedDate)) {
                dateInput.value = activeDate || today;
                return;
            }

            if (selectedDate > getNairobiDate()) {
                dateInput.value = today;
                activeDate = today;
                showSummaryMessage("Future notebook dates are not available.");
                return;
            }

            activeDate = selectedDate;
            loadDailySummary();
        });

        if (recordsBody) {
            observer = new MutationObserver(() => {
                scheduleRefresh();
            });

            observer.observe(recordsBody, {
                childList: true,
                subtree: true
            });
        }

        loadBusinessCurrency();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
