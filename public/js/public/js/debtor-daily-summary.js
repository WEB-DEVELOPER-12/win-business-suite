"use strict";

(() => {
    const params = new URLSearchParams(window.location.search);
    const debtorId = Number(params.get("id"));

    const dateInput = document.getElementById("dailyNotebookDate");
    const dailyTab = document.getElementById("dailyRecordsTab");
    const notebookContent = document.getElementById("notebookContent");
    const recordsBody = document.getElementById("customerRecordsBody");

    if (!dateInput || !dailyTab || !notebookContent) return;

    let requestNumber = 0;

    function formatMoney(value) {
        return "KSh " + (Number(value) || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function createSummaryContainer() {
        let container = document.getElementById("dailyNotebookSummary");

        if (container) return container;

        container = document.createElement("section");
        container.id = "dailyNotebookSummary";
        container.style.cssText = `
            display: none;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 20px;
        `;

        container.innerHTML = `
            <div class="stat-card">
                <p>Goods Taken Today</p>
                <h2 id="dailyGoodsTotal">KSh 0.00</h2>
            </div>

            <div class="stat-card">
                <p>Payments Received Today</p>
                <h2 id="dailyPaymentsTotal">KSh 0.00</h2>
            </div>

            <div class="stat-card">
                <p>Closing Balance</p>
                <h2 id="dailyClosingBalance">KSh 0.00</h2>
                <p id="dailyBalanceLabel" aria-live="polite"></p>
            </div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            @media (max-width: 700px) {
                #dailyNotebookSummary {
                    grid-template-columns: 1fr !important;
                }
            }

            #dailyNotebookSummary .stat-card h2 {
                overflow-wrap: anywhere;
            }

            #dailyBalanceLabel {
                margin-top: 7px;
                font-size: 12px;
            }
        `;

        document.head.appendChild(style);
        notebookContent.parentNode.insertBefore(container, notebookContent);

        return container;
    }

    function showSummaryMessage(message) {
        const container = createSummaryContainer();

        container.style.display = "block";
        container.innerHTML = `
            <div class="stat-card" style="grid-column:1/-1;">
                <p>${message}</p>
            </div>
        `;
    }

    async function loadDailySummary() {
        if (!Number.isInteger(debtorId) || debtorId <= 0) return;

        const date = dateInput.value;
        if (!date) return;

        const thisRequest = ++requestNumber;

        showSummaryMessage("Loading daily notebook summary...");

        try {
            const response = await fetch(
                `/api/debtors/${debtorId}/notebooks/daily?date=${encodeURIComponent(date)}`,
                {
                    method: "GET",
                    credentials: "same-origin"
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

            if (!response.ok || !data.success || !data.notebook) {
                throw new Error(
                    data.message || "Could not load the daily summary."
                );
            }

            if (thisRequest !== requestNumber) return;

            const notebook = data.notebook;
            const closingBalance = Number(notebook.closing_balance) || 0;

            const container = createSummaryContainer();

            container.innerHTML = `
                <div class="stat-card">
                    <p>Goods Taken</p>
                    <h2>${formatMoney(notebook.debt_added)}</h2>
                </div>

                <div class="stat-card">
                    <p>Payments Received</p>
                    <h2>${formatMoney(notebook.payments_received)}</h2>
                </div>

                <div class="stat-card">
                    <p>Closing Balance</p>
                    <h2>${formatMoney(closingBalance)}</h2>
                    <p id="dailyBalanceLabel">
                        ${
                            closingBalance < 0
                                ? "Customer credit"
                                : closingBalance > 0
                                    ? "Outstanding balance"
                                    : "Account settled"
                        }
                    </p>
                </div>
            `;

            container.style.display = "grid";

        } catch (error) {
            if (thisRequest !== requestNumber) return;

            console.error("Daily summary error:", error);

            showSummaryMessage(
                "Daily summary unavailable: " + error.message
            );
        }
    }

    function isDailyTabActive() {
        return dailyTab.classList.contains("active");
    }

    function refreshIfDaily() {
        if (isDailyTabActive()) {
            loadDailySummary();
        }
    }

    function initialize() {
        createSummaryContainer();

        dailyTab.addEventListener("click", refreshIfDaily);
        dateInput.addEventListener("change", refreshIfDaily);

        if (recordsBody) {
            const observer = new MutationObserver(() => {
                refreshIfDaily();
            });

            observer.observe(recordsBody, {
                childList: true,
                subtree: true
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();