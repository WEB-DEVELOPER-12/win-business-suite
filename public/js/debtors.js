
document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "/api";

    // Account and existing debtor elements
    const userName = document.getElementById("userName");
    const logoutButton = document.getElementById("logoutButton");

    const debtorForm = document.getElementById("debtorForm");
    const saveDebtorButton = document.getElementById("saveDebtorButton");
    const debtorFormMessage = document.getElementById("debtorFormMessage");

    const debtorsTableBody = document.getElementById("debtorsTableBody");
    const debtorListMessage = document.getElementById("debtorListMessage");

    const debtorSearch = document.getElementById("debtorSearch");
    const statusFilter = document.getElementById("statusFilter");

    const totalDebtors = document.getElementById("totalDebtors");
    const totalOutstanding = document.getElementById("totalOutstanding");
    const totalPayments = document.getElementById("totalPayments");
    const totalCustomerCredit = document.getElementById("totalCustomerCredit");

    // Report elements
    const reportPeriod = document.getElementById("reportPeriod");
    const reportDateGroup = document.getElementById("reportDateGroup");
    const reportDate = document.getElementById("reportDate");

    const reportMonthGroup = document.getElementById("reportMonthGroup");
    const reportMonth = document.getElementById("reportMonth");

    const reportYearGroup = document.getElementById("reportYearGroup");
    const reportYear = document.getElementById("reportYear");

    const loadDebtorReportButton = document.getElementById("loadDebtorReportButton");
    const debtorReportMessage = document.getElementById("debtorReportMessage");
    const debtorReportResults = document.getElementById("debtorReportResults");

    const reportTitle = document.getElementById("reportTitle");
    const reportDateRange = document.getElementById("reportDateRange");

    const reportOpeningBalance = document.getElementById("reportOpeningBalance");
    const reportGoodsTaken = document.getElementById("reportGoodsTaken");
    const reportPaymentsReceived = document.getElementById("reportPaymentsReceived");
    const reportClosingBalance = document.getElementById("reportClosingBalance");

    const reportTotalDebtors = document.getElementById("reportTotalDebtors");
    const reportAllTimeGoods = document.getElementById("reportAllTimeGoods");
    const reportAllTimePayments = document.getElementById("reportAllTimePayments");
    const reportOutstandingDebt = document.getElementById("reportOutstandingDebt");
    const reportCustomerCredit = document.getElementById("reportCustomerCredit");

    const reportUnpaidCount = document.getElementById("reportUnpaidCount");
    const reportPartialCount = document.getElementById("reportPartialCount");
    const reportPaidCount = document.getElementById("reportPaidCount");
    const reportCreditCount = document.getElementById("reportCreditCount");
    const reportNoActivityCount = document.getElementById("reportNoActivityCount");

    const reportTopDebtorsBody = document.getElementById("reportTopDebtorsBody");

    let debtors = [];

    function formatMoney(amount) {
        const value = Number(amount) || 0;

        return new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: "KES",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[character];
        });
    }

    function showMessage(element, message, type = "") {
        if (!element) return;

        element.textContent = message;
        element.className = "message-box";

        if (type === "error") {
            element.classList.add("message-error");
        } else if (type === "success") {
            element.classList.add("message-success");
        }
    }

    async function apiRequest(endpoint, options = {}) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (response.status === 401) {
            window.location.href = "/login.html";
            throw new Error("Your session has expired. Please log in again.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Something went wrong.");
        }

        return result;
    }

    // ACCOUNT
    async function loadAccount() {
        try {
            const result = await apiRequest("/auth/me");

            if (result.user && userName) {
                userName.textContent = result.user.full_name || "Account";
            }
        } catch (error) {
            console.error("Account loading error:", error);
            showMessage(debtorListMessage, error.message, "error");
        }
    }

    async function logout() {
        if (!confirm("Are you sure you want to log out?")) {
            return;
        }

        try {
            await apiRequest("/auth/logout", {
                method: "POST"
            });

            window.location.href = "/login.html";
        } catch (error) {
            alert(error.message || "Unable to log out.");
        }
    }

    // DEBTOR ACCOUNTS
    function getCreditLimit(debtor) {
        return Math.max(0, Number(debtor.credit_limit) || 0);
    }

    function getAvailableCredit(debtor) {
        const limit = getCreditLimit(debtor);

        if (limit === 0) {
            return null;
        }

        const balance = Math.max(0, Number(debtor.balance) || 0);

        return Math.max(0, limit - balance);
    }

    function getStatusLabel(status) {
        const labels = {
            unpaid: "Unpaid",
            partially_paid: "Partially Paid",
            paid: "Fully Paid",
            customer_credit: "Customer Credit",
            no_activity: "No Activity"
        };

        return labels[status] || "Unknown";
    }

    function getStatusClass(status) {
        const classes = {
            unpaid: "status-unpaid",
            partially_paid: "status-partial",
            paid: "status-paid",
            customer_credit: "status-credit"
        };

        return classes[status] || "";
    }

    function updateDashboardTotals() {
        const totals = debtors.reduce((result, debtor) => {
            result.paid += Number(debtor.total_paid) || 0;
            result.balance += Number(debtor.balance) || 0;
            result.credit += Number(debtor.customer_credit) || 0;

            return result;
        }, {
            paid: 0,
            balance: 0,
            credit: 0
        });

        totalDebtors.textContent = debtors.length;
        totalOutstanding.textContent = formatMoney(totals.balance);
        totalPayments.textContent = formatMoney(totals.paid);
        totalCustomerCredit.textContent = formatMoney(totals.credit);
    }

    function renderDebtors() {
        const searchTerm = debtorSearch.value.trim().toLowerCase();
        const selectedStatus = statusFilter.value;

        const filteredDebtors = debtors.filter(debtor => {
            const name = String(debtor.full_name || "").toLowerCase();
            const phone = String(debtor.phone || "").toLowerCase();

            const matchesSearch =
                name.includes(searchTerm) || phone.includes(searchTerm);

            const matchesStatus =
                !selectedStatus || debtor.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        if (filteredDebtors.length === 0) {
            debtorsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        No debtor accounts found.
                    </td>
                </tr>
            `;
            return;
        }

        debtorsTableBody.innerHTML = filteredDebtors.map(debtor => {
            const id = Number(debtor.id);
            const limit = getCreditLimit(debtor);
            const available = getAvailableCredit(debtor);

            return `
                <tr>
                    <td>
                        <strong>${escapeHTML(debtor.full_name)}</strong>
                        <br>
                        <small style="color:#718096;">
                            Credit limit:
                            ${limit === 0 ? "No fixed limit" : escapeHTML(formatMoney(limit))}
                        </small>
                        ${
                            available === null
                                ? ""
                                : `<br><small style="color:#087cf0;">Available: ${escapeHTML(formatMoney(available))}</small>`
                        }
                    </td>

                    <td>${escapeHTML(debtor.phone || "Not provided")}</td>
                    <td>${formatMoney(debtor.total_debt)}</td>
                    <td>${formatMoney(debtor.total_paid)}</td>

                    <td>
                        <strong>${formatMoney(debtor.balance)}</strong>
                    </td>

                    <td>
                        <span class="status-badge ${getStatusClass(debtor.status)}">
                            ${escapeHTML(getStatusLabel(debtor.status))}
                        </span>
                    </td>

                    <td>
                        <button
                            type="button"
                            class="btn-secondary view-debtor-button"
                            data-debtor-id="${id}"
                            style="padding: 8px 12px; font-size: 12px;"
                        >
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadDebtors() {
        debtorsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-empty">
                    Loading debtor accounts...
                </td>
            </tr>
        `;

        showMessage(debtorListMessage, "");

        try {
            const result = await apiRequest("/debtors");

            debtors = Array.isArray(result.debtors)
                ? result.debtors
                : [];

            updateDashboardTotals();
            renderDebtors();

        } catch (error) {
            console.error("Debtor loading error:", error);

            debtorsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">
                        Unable to load debtor accounts.
                    </td>
                </tr>
            `;

            showMessage(debtorListMessage, error.message, "error");
        }
    }

    async function registerDebtor(event) {
        event.preventDefault();

        showMessage(debtorFormMessage, "");

        const formData = new FormData(debtorForm);

        const debtorData = {
            full_name: String(formData.get("full_name") || "").trim(),
            phone: String(formData.get("phone") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            address: String(formData.get("address") || "").trim(),
            credit_limit: Number(formData.get("credit_limit")),
            notes: String(formData.get("notes") || "").trim()
        };

        if (!debtorData.full_name) {
            showMessage(
                debtorFormMessage,
                "Please enter the customer or institution name.",
                "error"
            );
            return;
        }

        if (
            !Number.isFinite(debtorData.credit_limit) ||
            debtorData.credit_limit < 0
        ) {
            showMessage(
                debtorFormMessage,
                "Please enter a valid credit limit.",
                "error"
            );
            return;
        }

        saveDebtorButton.disabled = true;
        saveDebtorButton.textContent = "Registering...";

        try {
            const result = await apiRequest("/debtors", {
                method: "POST",
                body: JSON.stringify(debtorData)
            });

            debtorForm.reset();

            const creditLimitInput = document.getElementById("creditLimit");

            if (creditLimitInput) {
                creditLimitInput.value = "0";
            }

            showMessage(
                debtorFormMessage,
                result.message || "Debtor registered successfully.",
                "success"
            );

            await loadDebtors();

        } catch (error) {
            console.error("Debtor registration error:", error);

            showMessage(
                debtorFormMessage,
                error.message,
                "error"
            );

        } finally {
            saveDebtorButton.disabled = false;
            saveDebtorButton.textContent = "Register Debtor";
        }
    }

    function viewDebtor(debtorId) {
        const debtor = debtors.find(item => Number(item.id) === debtorId);

        if (!debtor) {
            alert("Debtor account could not be found.");
            return;
        }

        window.location.href =
            `/debtor-profile.html?id=${encodeURIComponent(debtorId)}`;
    }

    // REPORTS
    function getLocalDateParts() {
        const now = new Date();

        return {
            year: String(now.getFullYear()),
            month: String(now.getMonth() + 1).padStart(2, "0"),
            date: [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0")
            ].join("-")
        };
    }

    function initialiseReportFilters() {
        if (!reportPeriod) return;

        const current = getLocalDateParts();

        if (reportDate) {
            reportDate.value = current.date;
        }

        if (reportMonth) {
            reportMonth.value = `${current.year}-${current.month}`;
        }

        if (reportYear) {
            reportYear.value = current.year;
        }

        updateReportFilterVisibility();
    }

    function updateReportFilterVisibility() {
        if (!reportPeriod) return;

        const period = reportPeriod.value;

        if (reportDateGroup) {
            reportDateGroup.hidden = period !== "daily";
        }

        if (reportMonthGroup) {
            reportMonthGroup.hidden = period !== "monthly";
        }

        if (reportYearGroup) {
            reportYearGroup.hidden = period !== "yearly";
        }
    }

    function buildReportEndpoint() {
        const period = reportPeriod.value;
        const params = new URLSearchParams();

        params.set("period", period);

        if (period === "daily") {
            const date = reportDate.value;

            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error("Please select a valid report date.");
            }

            params.set("date", date);

        } else if (period === "monthly") {
            const monthValue = reportMonth.value;
            const match = /^(\d{4})-(\d{2})$/.exec(monthValue || "");

            if (!match) {
                throw new Error("Please select a valid report month.");
            }

            params.set("year", match[1]);
            params.set("month", String(Number(match[2])));

        } else if (period === "yearly") {
            const yearValue = String(reportYear.value || "");

            if (!/^\d{4}$/.test(yearValue) || Number(yearValue) < 2000) {
                throw new Error("Please enter a valid report year.");
            }

            params.set("year", yearValue);

        } else {
            throw new Error("Please select a valid report period.");
        }

        return `/debtors/reports?${params.toString()}`;
    }

    function setReportValue(element, value, money = false) {
        if (!element) return;

        element.textContent = money
            ? formatMoney(value)
            : String(Number(value) || 0);
    }

    function renderTopDebtors(topDebtors) {
        if (!reportTopDebtorsBody) return;

        if (!Array.isArray(topDebtors) || topDebtors.length === 0) {
            reportTopDebtorsBody.innerHTML = `
                <tr>
                    <td colspan="4" class="table-empty">
                        No outstanding debtors for this period.
                    </td>
                </tr>
            `;
            return;
        }

        reportTopDebtorsBody.innerHTML = topDebtors.map((debtor, index) => {
            const name = escapeHTML(debtor.full_name || debtor.name || "Unnamed");
            const phone = escapeHTML(debtor.phone || "Not provided");
            const balance = formatMoney(debtor.balance ?? debtor.outstanding ?? 0);

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <strong>${name}</strong>
                    </td>
                    <td>${phone}</td>
                    <td><strong>${escapeHTML(balance)}</strong></td>
                </tr>
            `;
        }).join("");
    }

    function renderDebtorReport(report) {
        if (!report) {
            throw new Error("The report data was not returned by the server.");
        }

        const counts = report.debtor_status_counts || {};

        if (reportTitle) {
            reportTitle.textContent =
                `${String(report.period || "Debtor").toUpperCase()} REPORT`;
        }

        if (reportDateRange) {
            const start = report.start_date || "";
            const end = report.end_date_exclusive || "";

            reportDateRange.textContent = end
                ? `${start} to ${end} (end date not included)`
                : start;
        }

        setReportValue(reportOpeningBalance, report.opening_balance, true);
        setReportValue(reportGoodsTaken, report.goods_taken, true);
        setReportValue(reportPaymentsReceived, report.payments_received, true);
        setReportValue(reportClosingBalance, report.closing_balance, true);

        setReportValue(reportTotalDebtors, report.total_debtors);
        setReportValue(reportAllTimeGoods, report.total_goods_taken_all_time, true);
        setReportValue(reportAllTimePayments, report.total_payments_all_time, true);
        setReportValue(reportOutstandingDebt, report.total_outstanding_debt, true);
        setReportValue(reportCustomerCredit, report.total_customer_credit, true);

        setReportValue(reportUnpaidCount, counts.unpaid);
        setReportValue(reportPartialCount, counts.partially_paid);
        setReportValue(reportPaidCount, counts.paid);
        setReportValue(reportCreditCount, counts.customer_credit);
        setReportValue(reportNoActivityCount, counts.no_activity);

        renderTopDebtors(report.top_debtors);
    }

    async function loadDebtorReport() {
        if (!reportPeriod || !loadDebtorReportButton) return;

        showMessage(debtorReportMessage, "");
        loadDebtorReportButton.disabled = true;
        loadDebtorReportButton.textContent = "Loading Report...";

        if (debtorReportResults) {
            debtorReportResults.hidden = true;
        }

        if (reportTopDebtorsBody) {
            reportTopDebtorsBody.innerHTML = "";
        }

        try {
            const endpoint = buildReportEndpoint();
            const result = await apiRequest(endpoint);

            if (!result.report) {
                throw new Error("The server did not return report information.");
            }

            renderDebtorReport(result.report);

            if (debtorReportResults) {
                debtorReportResults.hidden = false;
            }

            showMessage(
                debtorReportMessage,
                "Report generated successfully.",
                "success"
            );

        } catch (error) {
            console.error("Debtor report error:", error);

            showMessage(
                debtorReportMessage,
                error.message || "Unable to generate the report.",
                "error"
            );

        } finally {
            loadDebtorReportButton.disabled = false;
            loadDebtorReportButton.textContent = "Generate Report";
        }
    }

    // EVENT LISTENERS
    debtorForm.addEventListener("submit", registerDebtor);

    debtorSearch.addEventListener("input", renderDebtors);
    statusFilter.addEventListener("change", renderDebtors);

    debtorsTableBody.addEventListener("click", event => {
        const button = event.target.closest(".view-debtor-button");

        if (!button) return;

        const debtorId = Number(button.dataset.debtorId);

        if (Number.isInteger(debtorId) && debtorId > 0) {
            viewDebtor(debtorId);
        }
    });

    logoutButton.addEventListener("click", logout);

    if (reportPeriod) {
        reportPeriod.addEventListener("change", updateReportFilterVisibility);
    }

    if (loadDebtorReportButton) {
        loadDebtorReportButton.addEventListener("click", loadDebtorReport);
    }

    // PAGE INITIALISATION
    async function initialisePage() {
        initialiseReportFilters();

        await loadAccount();
        await loadDebtors();
    }

    initialisePage();
});
