
"use strict";

(() => {
    const API_BASE = "/api/debtors";
    const params = new URLSearchParams(window.location.search);
    const debtorId = Number(params.get("id"));

    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7));

    let activePeriod = "monthly";
    let periodContainer = null;
    let requestNumber = 0;
    let businessCurrency = "KES";
    let currencyLoaded = false;

    const notebookContent = document.getElementById("notebookContent");

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function money(value) {
        const amount = Number(value) || 0;

        try {
            return new Intl.NumberFormat("en-KE", {
                style: "currency",
                currency: businessCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch {
            return `${businessCurrency} ${amount.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }
    }

    function formatDate(value) {
        if (!value) return "--";

        const parts = String(value).split("-");

        return parts.length === 3
            ? `${parts[2]}/${parts[1]}/${parts[0]}`
            : escapeHTML(value);
    }

    async function request(url) {
        const response = await fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (response.status === 401) {
            window.location.href = "/login.html";
            throw new Error("Your session has expired. Please log in again.");
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Could not load notebook data.");
        }

        return data;
    }

    async function loadBusinessCurrency() {
        if (currencyLoaded) return;

        currencyLoaded = true;

        try {
            const data = await request("/api/auth/me");

            const user = data.user || {};
            const business = user.business || data.business || {};
            const settings = data.settings || business.settings || {};

            const currency =
                business.currency ||
                user.business_currency ||
                user.currency ||
                data.business_currency ||
                data.currency ||
                settings.currency ||
                "KES";

            const normalized = String(currency).trim().toUpperCase();

            if (/^[A-Z]{3}$/.test(normalized)) {
                businessCurrency = normalized;
            }
        } catch (error) {
            console.error("Business currency loading error:", error);
        }
    }

    function createInterface() {
        if (!notebookContent || periodContainer) return;

        periodContainer = document.createElement("section");
        periodContainer.id = "periodNotebookContent";
        periodContainer.style.display = "none";

        periodContainer.innerHTML = `
            <style>
                #periodNotebookContent .period-controls {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 14px;
                    margin: 10px 0 20px;
                }

                #periodNotebookContent .period-controls label {
                    display: block;
                    margin-bottom: 7px;
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--win-navy);
                }

                #periodNotebookContent .period-controls select {
                    min-width: 145px;
                    padding: 10px;
                    border: 1px solid var(--win-border);
                    border-radius: 8px;
                    background: white;
                    color: var(--win-text);
                }

                #periodNotebookContent .period-summary {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 22px;
                }

                #periodNotebookContent .period-summary-card {
                    padding: 16px;
                    border: 1px solid var(--win-border);
                    border-radius: 10px;
                    background: #fff;
                }

                #periodNotebookContent .period-summary-card p {
                    margin: 0;
                    color: var(--win-muted);
                    font-size: 12px;
                }

                #periodNotebookContent .period-summary-card h3 {
                    margin: 9px 0 0;
                    color: var(--win-navy);
                    font-size: 17px;
                    overflow-wrap: anywhere;
                }

                #periodNotebookContent .period-status {
                    margin: 0 0 15px;
                    font-size: 13px;
                    color: var(--win-muted);
                }

                #periodNotebookContent .period-table-wrap {
                    width: 100%;
                    overflow-x: auto;
                }

                #periodNotebookContent table {
                    width: 100%;
                    min-width: 650px;
                    border-collapse: collapse;
                }

                #periodNotebookContent th,
                #periodNotebookContent td {
                    padding: 12px 10px;
                    border-bottom: 1px solid var(--win-border);
                    text-align: left;
                    font-size: 13px;
                }

                #periodNotebookContent th {
                    background: #f7faff;
                    color: var(--win-muted);
                    font-size: 11px;
                    text-transform: uppercase;
                }

                #periodNotebookContent .period-empty {
                    padding: 22px;
                    text-align: center;
                    color: var(--win-muted);
                }

                #periodNotebookContent .period-error {
                    color: #b42318;
                    padding: 15px 0;
                }

                #periodNotebookContent .period-section-title {
                    margin: 24px 0 12px;
                    color: var(--win-navy);
                    font-size: 17px;
                }

                @media (max-width: 850px) {
                    #periodNotebookContent .period-summary {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }

                @media (max-width: 480px) {
                    #periodNotebookContent .period-summary {
                        grid-template-columns: 1fr 1fr;
                    }

                    #periodNotebookContent .period-summary-card {
                        padding: 12px;
                    }

                    #periodNotebookContent .period-summary-card h3 {
                        font-size: 14px;
                    }
                }
            </style>

            <div class="period-controls">
                <div id="periodMonthGroup">
                    <label for="periodMonth">Select month</label>
                    <select id="periodMonth">
                        ${Array.from({ length: 12 }, (_, index) => {
                            const month = index + 1;

                            return `
                                <option
                                    value="${month}"
                                    ${month === currentMonth ? "selected" : ""}
                                >
                                    ${new Date(2000, index, 1).toLocaleString(
                                        "en",
                                        { month: "long" }
                                    )}
                                </option>
                            `;
                        }).join("")}
                    </select>
                </div>

                <div>
                    <label for="periodYear">Select year</label>
                    <select id="periodYear"></select>
                </div>
            </div>

            <div id="periodSummary"></div>

            <div
                id="periodStatus"
                class="period-status"
                aria-live="polite"
            ></div>

            <div id="periodTable"></div>

            <div
                id="periodError"
                class="period-error"
                aria-live="polite"
            ></div>
        `;

        notebookContent.parentNode.insertBefore(
            periodContainer,
            notebookContent.nextSibling
        );

        const yearSelect = periodContainer.querySelector("#periodYear");
        const years = [];

        for (let year = currentYear; year >= 2000; year--) {
            years.push(year);
        }

        yearSelect.innerHTML = years.map(year => `
            <option
                value="${year}"
                ${year === currentYear ? "selected" : ""}
            >
                ${year}
            </option>
        `).join("");

        periodContainer.querySelector("#periodMonth")
            .addEventListener("change", () => {
                if (activePeriod === "monthly") {
                    loadMonthly();
                }
            });

        yearSelect.addEventListener("change", () => {
            if (activePeriod === "monthly") {
                loadMonthly();
            } else if (activePeriod === "yearly") {
                loadYearly();
            }
        });
    }

    function summaryCards(summary) {
        const values = summary || {};

        return `
            <div class="period-summary">
                <div class="period-summary-card">
                    <p>Opening Balance</p>
                    <h3>${escapeHTML(money(values.opening_balance))}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Goods Taken</p>
                    <h3>${escapeHTML(money(values.debt_added))}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Payments Received</p>
                    <h3>${escapeHTML(money(values.payments_received))}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Closing Balance</p>
                    <h3>${escapeHTML(money(values.closing_balance))}</h3>
                </div>
            </div>
        `;
    }

    function combinedRecords(history) {
        const transactions = (history.transactions || []).map(item => ({
            date: item.transaction_date,
            type: "Goods taken",
            description: (item.items || []).map(product =>
                `${escapeHTML(product.product_name)} × ${escapeHTML(product.quantity)}`
            ).join(", ") || escapeHTML(item.notes || "Credit transaction"),
            amount: Number(item.total_amount) || 0,
            kind: "goods"
        }));

        const payments = (history.payments || []).map(item => ({
            date: item.payment_date,
            type: "Payment received",
            description: [
                escapeHTML(item.payment_method || "Payment"),
                item.reference
                    ? `Reference: ${escapeHTML(item.reference)}`
                    : ""
            ].filter(Boolean).join(" · "),
            amount: Number(item.amount) || 0,
            kind: "payment"
        }));

        return [...transactions, ...payments].sort((a, b) => {
            const comparison = String(b.date || "").localeCompare(
                String(a.date || "")
            );

            if (comparison !== 0) return comparison;

            return a.kind === "goods" ? -1 : 1;
        });
    }

    function renderPeriodRecords(records) {
        if (!records.length) {
            return `
                <div class="period-empty">
                    No goods or payments were recorded in this period.
                </div>
            `;
        }

        return `
            <div class="period-table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Record</th>
                            <th>Description</th>
                            <th>Amount</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${records.map(record => `
                            <tr>
                                <td>${formatDate(record.date)}</td>
                                <td>${record.type}</td>
                                <td>${record.description}</td>
                                <td>
                                    <strong>
                                        ${record.kind === "payment" ? "-" : "+"}${escapeHTML(money(record.amount))}
                                    </strong>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadHistory() {
        return request(`${API_BASE}/${debtorId}/history`);
    }

    function getElements() {
        return {
            summary: periodContainer.querySelector("#periodSummary"),
            status: periodContainer.querySelector("#periodStatus"),
            table: periodContainer.querySelector("#periodTable"),
            error: periodContainer.querySelector("#periodError")
        };
    }

    function showLoading(message) {
        const elements = getElements();

        elements.error.textContent = "";
        elements.summary.innerHTML = escapeHTML(message);
        elements.status.textContent = "";
        elements.table.innerHTML = "";
    }

    function showError(error, requestId) {
        if (requestId !== requestNumber) return;

        const elements = getElements();

        elements.summary.innerHTML = "";
        elements.status.textContent = "";
        elements.table.innerHTML = "";
        elements.error.textContent =
            error.message || "Could not load notebook data.";

        console.error("Period notebook error:", error);
    }

    async function loadMonthly() {
        if (!periodContainer || !Number.isInteger(debtorId) || debtorId <= 0) {
            return;
        }

        activePeriod = "monthly";

        const month = Number(
            periodContainer.querySelector("#periodMonth").value
        );

        const year = Number(
            periodContainer.querySelector("#periodYear").value
        );

        if (
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12 ||
            !Number.isInteger(year) ||
            year < 2000 ||
            year > currentYear
        ) {
            return;
        }

        const requestId = ++requestNumber;
        showLoading("Loading monthly notebook...");

        try {
            await loadBusinessCurrency();

            const [monthlyData, historyData] = await Promise.all([
                request(
                    `${API_BASE}/${debtorId}/notebooks/monthly?year=${year}&month=${month}`
                ),
                loadHistory()
            ]);

            if (requestId !== requestNumber) return;

            if (!monthlyData.notebook) {
                throw new Error("Monthly notebook information was not returned.");
            }

            const notebook = monthlyData.notebook;
            const elements = getElements();

            elements.summary.innerHTML = summaryCards(notebook);

            elements.status.textContent =
                `Notebook status: ${String(notebook.status || "open").toUpperCase()}`;

            const monthKey = `${year}-${String(month).padStart(2, "0")}`;

            const monthRecords = combinedRecords(historyData).filter(record =>
                String(record.date || "").startsWith(monthKey)
            );

            elements.table.innerHTML = `
                <h3 class="period-section-title">Monthly Records</h3>
                ${renderPeriodRecords(monthRecords)}
            `;
        } catch (error) {
            showError(error, requestId);
        }
    }

    async function loadYearly() {
        if (!periodContainer || !Number.isInteger(debtorId) || debtorId <= 0) {
            return;
        }

        activePeriod = "yearly";

        const year = Number(
            periodContainer.querySelector("#periodYear").value
        );

        if (
            !Number.isInteger(year) ||
            year < 2000 ||
            year > currentYear
        ) {
            return;
        }

        const requestId = ++requestNumber;
        showLoading("Loading yearly history...");

        try {
            await loadBusinessCurrency();

            const [yearlyData, historyData] = await Promise.all([
                request(
                    `${API_BASE}/${debtorId}/notebooks/yearly?year=${year}`
                ),
                loadHistory()
            ]);

            if (requestId !== requestNumber) return;

            if (!yearlyData.summary) {
                throw new Error("Yearly summary information was not returned.");
            }

            const elements = getElements();

            elements.summary.innerHTML = summaryCards(yearlyData.summary);
            elements.status.textContent = `Yearly account summary for ${year}`;

            const monthNames = [
                "January", "February", "March", "April",
                "May", "June", "July", "August",
                "September", "October", "November", "December"
            ];

            const months = Array.isArray(yearlyData.months)
                ? yearlyData.months
                : [];

            const rows = months.map(month => {
                const monthNumber = Number(month.month);
                const monthName = monthNames[monthNumber - 1] || "Unknown";

                return `
                    <tr>
                        <td>${monthName}</td>
                        <td>${escapeHTML(money(month.opening_balance))}</td>
                        <td>${escapeHTML(money(month.debt_added))}</td>
                        <td>${escapeHTML(money(month.payments_received))}</td>
                        <td><strong>${escapeHTML(money(month.closing_balance))}</strong></td>
                        <td>${escapeHTML(month.status || "open")}</td>
                    </tr>
                `;
            }).join("");

            const yearKey = String(year);

            const yearRecords = combinedRecords(historyData).filter(record =>
                String(record.date || "").startsWith(yearKey)
            );

            elements.table.innerHTML = `
                <h3 class="period-section-title">
                    Monthly Breakdown — ${year}
                </h3>

                <div class="period-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Opening Balance</th>
                                <th>Goods Taken</th>
                                <th>Payments</th>
                                <th>Closing Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows || `
                                <tr>
                                    <td colspan="6" class="period-empty">
                                        No monthly notebook records for ${year}.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <h3 class="period-section-title">
                    All Records — ${year}
                </h3>

                ${renderPeriodRecords(yearRecords)}
            `;
        } catch (error) {
            showError(error, requestId);
        }
    }

    function updateRegularNotebookVisibility(show) {
        if (notebookContent) {
            notebookContent.style.display = show ? "" : "none";
        }

        const dailySummary = document.getElementById("dailyNotebookSummary");

        if (dailySummary) {
            const dailyTab = document.getElementById("dailyRecordsTab");
            const shouldShowDailySummary =
                show &&
                dailyTab &&
                dailyTab.classList.contains("active");

            dailySummary.style.display = shouldShowDailySummary ? "grid" : "none";
        }
    }

    function activatePeriodView(period) {
        if (!periodContainer) return;

        activePeriod = period;

        const isPeriodView =
            period === "monthly" || period === "yearly";

        updateRegularNotebookVisibility(!isPeriodView);

        periodContainer.style.display = isPeriodView ? "block" : "none";

        if (!isPeriodView) {
            requestNumber++;
            return;
        }

        const monthGroup =
            periodContainer.querySelector("#periodMonthGroup");

        monthGroup.style.display =
            period === "monthly" ? "block" : "none";

        if (period === "monthly") {
            loadMonthly();
        } else {
            loadYearly();
        }
    }

    function initialize() {
        if (!Number.isInteger(debtorId) || debtorId <= 0) return;

        if (!notebookContent || !notebookContent.parentNode) {
            console.error("Notebook content element was not found.");
            return;
        }

        createInterface();

        const monthlyTab = document.getElementById("monthlyRecordsTab");
        const yearlyTab = document.getElementById("yearlyRecordsTab");

        if (monthlyTab) {
            monthlyTab.addEventListener("click", () => {
                activatePeriodView("monthly");
            });
        }

        if (yearlyTab) {
            yearlyTab.addEventListener("click", () => {
                activatePeriodView("yearly");
            });
        }

        ["allRecordsTab", "dailyRecordsTab"].forEach(id => {
            const button = document.getElementById(id);

            if (button) {
                button.addEventListener("click", () => {
                    activatePeriodView("other");
                });
            }
        });

        loadBusinessCurrency();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
