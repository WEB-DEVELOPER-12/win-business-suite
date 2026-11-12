
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
    let periodContainer;
    let historyData = {
        transactions: [],
        payments: []
    };

    function money(value) {
        return "KSh " + (Number(value) || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
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
            credentials: "same-origin"
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (response.status === 401) {
            window.location.href = "/login.html";
            throw new Error("Your session has expired.");
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Could not load notebook data.");
        }

        return data;
    }

    function createInterface() {
        const notebookContent = document.getElementById("notebookContent");

        if (!notebookContent) return;

        periodContainer = document.createElement("div");
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
                <div>
                    <label for="periodMonth">Select month</label>
                    <select id="periodMonth">
                        ${Array.from({ length: 12 }, (_, index) => {
                            const month = index + 1;
                            return `<option value="${month}" ${month === currentMonth ? "selected" : ""}>
                                ${new Date(2000, index, 1).toLocaleString("en", { month: "long" })}
                            </option>`;
                        }).join("")}
                    </select>
                </div>

                <div>
                    <label for="periodYear">Select year</label>
                    <select id="periodYear"></select>
                </div>
            </div>

            <div id="periodSummary"></div>
            <div id="periodStatus" class="period-status"></div>
            <div id="periodTable"></div>
            <div id="periodError" class="period-error" aria-live="polite"></div>
        `;

        notebookContent.parentNode.insertBefore(
            periodContainer,
            notebookContent.nextSibling
        );

        const yearSelect = periodContainer.querySelector("#periodYear");

        const years = [];
        for (let year = currentYear; year >= 2020; year--) {
            years.push(year);
        }

        yearSelect.innerHTML = years.map(year => `
            <option value="${year}" ${year === currentYear ? "selected" : ""}>
                ${year}
            </option>
        `).join("");

        periodContainer.querySelector("#periodMonth")
            .addEventListener("change", loadMonthly);

        yearSelect.addEventListener("change", async () => {
            if (activePeriod === "monthly") {
                await loadMonthly();
            } else {
                await loadYearly();
            }
        });
    }

    function summaryCards(summary) {
        return `
            <div class="period-summary">
                <div class="period-summary-card">
                    <p>Opening Balance</p>
                    <h3>${money(summary.opening_balance)}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Goods Taken</p>
                    <h3>${money(summary.debt_added)}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Payments Received</p>
                    <h3>${money(summary.payments_received)}</h3>
                </div>

                <div class="period-summary-card">
                    <p>Closing Balance</p>
                    <h3>${money(summary.closing_balance)}</h3>
                </div>
            </div>
        `;
    }

    function combinedRecords() {
        const transactions = (historyData.transactions || []).map(item => ({
            date: item.transaction_date,
            type: "Goods taken",
            description: (item.items || []).map(product =>
                `${escapeHTML(product.product_name)} × ${escapeHTML(product.quantity)}`
            ).join(", ") || escapeHTML(item.notes || "Credit transaction"),
            amount: Number(item.total_amount) || 0,
            kind: "goods"
        }));

        const payments = (historyData.payments || []).map(item => ({
            date: item.payment_date,
            type: "Payment received",
            description: [
                escapeHTML(item.payment_method || "Payment"),
                item.reference ? `Reference: ${escapeHTML(item.reference)}` : ""
            ].filter(Boolean).join(" · "),
            amount: Number(item.amount) || 0,
            kind: "payment"
        }));

        return [...transactions, ...payments].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );
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
                                        ${record.kind === "payment" ? "-" : "+"}${money(record.amount)}
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
        const data = await request(`${API_BASE}/${debtorId}/history`);

        historyData = {
            transactions: Array.isArray(data.transactions)
                ? data.transactions
                : [],
            payments: Array.isArray(data.payments)
                ? data.payments
                : []
        };
    }

    function showError(error) {
        periodContainer.querySelector("#periodError").textContent =
            error.message || "Could not load notebook.";
    }

    async function loadMonthly() {
        if (!periodContainer || !debtorId) return;

        const month = Number(
            periodContainer.querySelector("#periodMonth").value
        );

        const year = Number(
            periodContainer.querySelector("#periodYear").value
        );

        const summaryElement = periodContainer.querySelector("#periodSummary");
        const statusElement = periodContainer.querySelector("#periodStatus");
        const tableElement = periodContainer.querySelector("#periodTable");
        const errorElement = periodContainer.querySelector("#periodError");

        errorElement.textContent = "";
        summaryElement.innerHTML = "Loading monthly notebook...";
        tableElement.innerHTML = "";

        try {
            const [monthlyData] = await Promise.all([
                request(
                    `${API_BASE}/${debtorId}/notebooks/monthly?year=${year}&month=${month}`
                ),
                loadHistory()
            ]);

            const notebook = monthlyData.notebook;

            summaryElement.innerHTML = summaryCards(notebook);

            statusElement.textContent =
                `Notebook status: ${notebook.status.toUpperCase()}`;

            const monthRecords = combinedRecords().filter(record =>
                String(record.date || "").startsWith(
                    `${year}-${String(month).padStart(2, "0")}`
                )
            );

            tableElement.innerHTML = `
                <h3 class="period-section-title">Monthly Records</h3>
                ${renderPeriodRecords(monthRecords)}
            `;
        } catch (error) {
            summaryElement.innerHTML = "";
            statusElement.textContent = "";
            tableElement.innerHTML = "";
            showError(error);
        }
    }

    async function loadYearly() {
        if (!periodContainer || !debtorId) return;

        const year = Number(
            periodContainer.querySelector("#periodYear").value
        );

        const summaryElement = periodContainer.querySelector("#periodSummary");
        const statusElement = periodContainer.querySelector("#periodStatus");
        const tableElement = periodContainer.querySelector("#periodTable");
        const errorElement = periodContainer.querySelector("#periodError");

        errorElement.textContent = "";
        summaryElement.innerHTML = "Loading yearly history...";
        tableElement.innerHTML = "";

        try {
            const [yearlyData] = await Promise.all([
                request(
                    `${API_BASE}/${debtorId}/notebooks/yearly?year=${year}`
                ),
                loadHistory()
            ]);

            summaryElement.innerHTML = summaryCards(yearlyData.summary);

            statusElement.textContent =
                `Yearly account summary for ${year}`;

            const monthNames = [
                "January", "February", "March", "April",
                "May", "June", "July", "August",
                "September", "October", "November", "December"
            ];

            const monthRows = yearlyData.months || [];

            const rows = monthRows.map(month => `
                <tr>
                    <td>${monthNames[Number(month.month) - 1]}</td>
                    <td>${money(month.opening_balance)}</td>
                    <td>${money(month.debt_added)}</td>
                    <td>${money(month.payments_received)}</td>
                    <td>${money(month.closing_balance)}</td>
                    <td>${escapeHTML(month.status)}</td>
                </tr>
            `).join("");

            tableElement.innerHTML = `
                <h3 class="period-section-title">Monthly Breakdown — ${year}</h3>

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
            `;
        } catch (error) {
            summaryElement.innerHTML = "";
            statusElement.textContent = "";
            tableElement.innerHTML = "";
            showError(error);
        }
    }

    function activatePeriodView(period) {
        activePeriod = period;

        const regularContent = document.getElementById("notebookContent");

        if (period === "monthly" || period === "yearly") {
            regularContent.style.display = "none";
            periodContainer.style.display = "block";

            const monthControl =
                periodContainer.querySelector("#periodMonth");

            monthControl.parentElement.style.display =
                period === "monthly" ? "block" : "none";

            if (period === "monthly") {
                loadMonthly();
            } else {
                loadYearly();
            }
        } else {
            regularContent.style.display = "block";
            periodContainer.style.display = "none";
        }
    }

    function initialize() {
        if (!Number.isInteger(debtorId) || debtorId <= 0) return;

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
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
