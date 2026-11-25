
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const section = document.getElementById("section-maintenance");

    if (!section) {
        console.error("WIN Maintenance section was not found.");
        return;
    }

    const TIME_ZONE = "Africa/Nairobi";
    const API_BASE = "/api/admin/maintenance";

    section.innerHTML = `
        <div class="section-heading">
            <h2>Maintenance Control</h2>
            <p>Monitor platform availability and manage planned maintenance without changing customer business records.</p>
        </div>

        <div class="maintenance-grid">
            <article class="maintenance-card">
                <div class="maintenance-card-heading">
                    <div>
                        <span class="maintenance-eyebrow">PLATFORM STATUS</span>
                        <h3>Current availability</h3>
                    </div>
                    <span class="maintenance-icon">⚙</span>
                </div>

                <div class="maintenance-current-status" id="maintenanceCurrentStatus">
                    Checking status...
                </div>

                <p class="maintenance-muted" id="maintenanceStatusDescription">
                    Loading maintenance settings.
                </p>

                <div class="maintenance-details">
                    <div><span>Scheduled start</span><strong id="maintenanceScheduledStart">—</strong></div>
                    <div><span>Scheduled end</span><strong id="maintenanceScheduledEnd">—</strong></div>
                    <div><span>Expected return</span><strong id="maintenanceExpectedReturn">—</strong></div>
                </div>

                <button type="button" class="maintenance-secondary-button" id="refreshMaintenance">
                    ↻ Refresh status
                </button>
            </article>

            <article class="maintenance-card">
                <span class="maintenance-eyebrow">CUSTOMER MESSAGE</span>
                <h3>Maintenance information</h3>

                <form id="maintenanceSettingsForm">
                    <label for="maintenanceMessage">Customer message</label>
                    <textarea id="maintenanceMessage" maxlength="1000" rows="3" required
                        placeholder="Explain why WIN Business Suite is temporarily unavailable."></textarea>

                    <label for="maintenanceReason">Reason</label>
                    <input id="maintenanceReason" type="text" maxlength="500"
                        placeholder="Example: Platform improvements">

                    <label for="maintenanceExpectedReturnInput">Expected return time (Nairobi time)</label>
                    <input id="maintenanceExpectedReturnInput" type="datetime-local">

                    <button type="submit" class="maintenance-primary-button">
                        Save maintenance information
                    </button>
                </form>
            </article>

            <article class="maintenance-card">
                <span class="maintenance-eyebrow">IMMEDIATE CONTROL</span>
                <h3>Platform availability</h3>

                <p class="maintenance-muted">
                    These actions immediately affect customer access. Use them only for an approved operation.
                </p>

                <div class="maintenance-action-stack">
                    <button type="button" class="maintenance-danger-button" id="activateMaintenance">
                        Activate Maintenance
                    </button>

                    <button type="button" class="maintenance-success-button" id="deactivateMaintenance">
                        Restore Customer Access
                    </button>
                </div>

                <p class="maintenance-warning">
                    Activation blocks customer pages and APIs. Customer records are preserved.
                </p>
            </article>

            <article class="maintenance-card">
                <span class="maintenance-eyebrow">AUTOMATIC MAINTENANCE</span>
                <h3>Schedule a maintenance window</h3>

                <p class="maintenance-muted">
                    Choose a future start and end time in Nairobi time. The platform scheduler will activate and restore access automatically.
                </p>

                <form id="maintenanceScheduleForm">
                    <label for="maintenanceStartAt">Start time (Nairobi time)</label>
                    <input id="maintenanceStartAt" type="datetime-local" required>

                    <label for="maintenanceEndAt">End time (Nairobi time)</label>
                    <input id="maintenanceEndAt" type="datetime-local" required>

                    <button type="submit" class="maintenance-primary-button">
                        Schedule Maintenance
                    </button>
                </form>

                <button type="button" class="maintenance-secondary-button" id="cancelMaintenanceSchedule">
                    Cancel scheduled maintenance
                </button>
            </article>
        </div>

        <div class="maintenance-card maintenance-history-card">
            <div class="maintenance-card-heading">
                <div>
                    <span class="maintenance-eyebrow">ADMINISTRATION RECORDS</span>
                    <h3>Maintenance event history</h3>
                </div>

                <button type="button" class="maintenance-secondary-button" id="refreshMaintenanceHistory">
                    ↻ Refresh history
                </button>
            </div>

            <div id="maintenanceHistoryMessage" class="maintenance-muted">
                Loading maintenance history...
            </div>

            <div class="maintenance-table-wrapper">
                <table class="maintenance-table">
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Administrator</th>
                            <th>Details</th>
                            <th>Date and time</th>
                        </tr>
                    </thead>
                    <tbody id="maintenanceHistoryBody">
                        <tr><td colspan="4">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <style>
            .maintenance-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 17px;
                align-items: start;
            }

            .maintenance-card {
                min-width: 0;
                padding: 23px;
                background: #fff;
                border: 1px solid #e4eaf2;
                border-radius: 14px;
                box-shadow: 0 4px 14px rgba(11,35,65,.025);
            }

            .maintenance-card h3 {
                margin: 7px 0 17px;
                color: #071426;
                font-size: 17px;
            }

            .maintenance-eyebrow {
                color: #087cf0;
                font-size: 9px;
                font-weight: 850;
                letter-spacing: 1.4px;
            }

            .maintenance-card-heading {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
            }

            .maintenance-card-heading h3 {
                margin-bottom: 12px;
            }

            .maintenance-icon {
                width: 39px;
                height: 39px;
                display: grid;
                place-items: center;
                border-radius: 11px;
                background: #edf5ff;
                font-size: 19px;
            }

            .maintenance-current-status {
                display: inline-block;
                margin: 8px 0 10px;
                padding: 9px 13px;
                border-radius: 20px;
                background: #eafaf3;
                color: #147c59;
                font-size: 12px;
                font-weight: 800;
            }

            .maintenance-current-status.is-active {
                background: #fff0f1;
                color: #b32c3d;
            }

            .maintenance-current-status.is-scheduled {
                background: #fff5e7;
                color: #9c6415;
            }

            .maintenance-muted {
                color: #758398;
                font-size: 12px;
                line-height: 1.7;
            }

            .maintenance-details {
                margin: 18px 0;
                border-top: 1px solid #e9eef5;
            }

            .maintenance-details div {
                padding: 11px 0;
                display: flex;
                justify-content: space-between;
                gap: 12px;
                border-bottom: 1px solid #e9eef5;
            }

            .maintenance-details span {
                color: #758398;
                font-size: 11px;
            }

            .maintenance-details strong {
                max-width: 60%;
                color: #172337;
                font-size: 11px;
                text-align: right;
                overflow-wrap: anywhere;
            }

            .maintenance-card form {
                display: flex;
                flex-direction: column;
                gap: 9px;
            }

            .maintenance-card label {
                margin-top: 8px;
                color: #34445a;
                font-size: 11px;
                font-weight: 750;
            }

            .maintenance-card input,
            .maintenance-card textarea {
                width: 100%;
                min-height: 42px;
                padding: 11px 12px;
                border: 1px solid #dce4ef;
                border-radius: 8px;
                outline: none;
                background: #fff;
                color: #172337;
                font: inherit;
                font-size: 12px;
            }

            .maintenance-card textarea {
                resize: vertical;
                min-height: 85px;
            }

            .maintenance-card input:focus,
            .maintenance-card textarea:focus {
                border-color: #087cf0;
                box-shadow: 0 0 0 3px rgba(8,124,240,.09);
            }

            .maintenance-primary-button,
            .maintenance-danger-button,
            .maintenance-success-button,
            .maintenance-secondary-button {
                min-height: 40px;
                padding: 10px 14px;
                border: 0;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 800;
                transition: .2s;
            }

            .maintenance-primary-button {
                margin-top: 9px;
                background: #087cf0;
                color: #fff;
            }

            .maintenance-primary-button:hover {
                background: #0666c7;
            }

            .maintenance-danger-button {
                background: #c93649;
                color: #fff;
            }

            .maintenance-danger-button:hover {
                background: #a92537;
            }

            .maintenance-success-button {
                background: #159b70;
                color: #fff;
            }

            .maintenance-success-button:hover {
                background: #117b59;
            }

            .maintenance-secondary-button {
                border: 1px solid #dce4ef;
                background: #fff;
                color: #34445a;
            }

            .maintenance-secondary-button:hover {
                background: #f3f7fc;
            }

            .maintenance-action-stack {
                margin-top: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .maintenance-warning {
                margin-top: 15px;
                padding: 12px;
                border-radius: 8px;
                background: #fff5e7;
                color: #8a5b18;
                font-size: 11px;
                line-height: 1.7;
            }

            .maintenance-history-card {
                margin-top: 18px;
            }

            .maintenance-table-wrapper {
                width: 100%;
                margin-top: 14px;
                overflow-x: auto;
            }

            .maintenance-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
            }

            .maintenance-table th,
            .maintenance-table td {
                padding: 13px 11px;
                border-bottom: 1px solid #e9eef5;
                color: #43536a;
                font-size: 11px;
                vertical-align: top;
            }

            .maintenance-table th {
                background: #f6f9fd;
                color: #758398;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: .6px;
            }

            .maintenance-table td:first-child {
                color: #172337;
                font-weight: 750;
            }

            .maintenance-table td[colspan] {
                color: #758398;
                text-align: center;
            }

            .maintenance-feedback {
                margin-top: 13px;
                padding: 11px 13px;
                border-radius: 8px;
                background: #edf5ff;
                color: #245b91;
                font-size: 11px;
                line-height: 1.6;
            }

            .maintenance-feedback.error {
                background: #fff0f1;
                color: #a52d3b;
            }

            .maintenance-feedback.success {
                background: #eafaf3;
                color: #147c59;
            }

            .maintenance-card button:disabled {
                opacity: .55;
                cursor: not-allowed;
            }

            @media (max-width: 900px) {
                .maintenance-grid {
                    grid-template-columns: 1fr;
                }
            }

            @media (max-width: 480px) {
                .maintenance-card {
                    padding: 17px;
                }

                .maintenance-card-heading {
                    flex-wrap: wrap;
                }
            }
        </style>

        <div id="maintenanceFeedback" role="status" aria-live="polite"></div>
    `;

    const currentStatus = document.getElementById(
        "maintenanceCurrentStatus"
    );

    const statusDescription = document.getElementById(
        "maintenanceStatusDescription"
    );

    const feedback = document.getElementById(
        "maintenanceFeedback"
    );

    let requestInProgress = false;

    function showFeedback(message, type = "info") {
        feedback.className = `maintenance-feedback ${type}`;
        feedback.textContent = message;
    }

    function clearFeedback() {
        feedback.textContent = "";
        feedback.className = "";
    }

    function parseStoredDate(value) {
        if (!value) return null;

        let dateValue = String(value).trim();

        if (
            !dateValue.endsWith("Z") &&
            !/[+-]\d{2}:\d{2}$/.test(dateValue)
        ) {
            dateValue = dateValue.replace(" ", "T") + "Z";
        }

        const date = new Date(dateValue);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        const date = parseStoredDate(value);

        if (!date) return "Not set";

        return new Intl.DateTimeFormat("en-KE", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: TIME_ZONE
        }).format(date);
    }

    // Convert a Nairobi wall-clock datetime into an ISO UTC timestamp.
    // Nairobi uses UTC+03:00. This does not depend on the computer timezone.
    function toApiDate(value) {
        if (!value) return null;

        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
            throw new Error("Please enter a valid date and time.");
        }

        const date = new Date(`${value}:00+03:00`);

        if (Number.isNaN(date.getTime())) {
            throw new Error("Please enter a valid date and time.");
        }

        // Reject impossible calendar dates that JavaScript may normalize.
        const parts = value.match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
        );

        const check = new Date(Date.UTC(
            Number(parts[1]),
            Number(parts[2]) - 1,
            Number(parts[3]),
            Number(parts[4]),
            Number(parts[5])
        ));

        if (
            check.getUTCFullYear() !== Number(parts[1]) ||
            check.getUTCMonth() + 1 !== Number(parts[2]) ||
            check.getUTCDate() !== Number(parts[3]) ||
            check.getUTCHours() !== Number(parts[4]) ||
            check.getUTCMinutes() !== Number(parts[5])
        ) {
            throw new Error("Please enter a real calendar date and time.");
        }

        return date.toISOString();
    }

    function toNairobiInputValue(value) {
        const date = parseStoredDate(value);

        if (!date) return "";

        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(date);

        const values = {};

        parts.forEach(part => {
            values[part.type] = part.value;
        });

        return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
    }

    function setValue(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.value = value ?? "";
        }
    }

    function displayStatus(settings) {
        const enabled =
            Number(settings?.maintenance_enabled) === 1;

        const scheduled =
            Number(settings?.schedule_enabled) === 1;

        currentStatus.className = "maintenance-current-status";

        if (enabled) {
            currentStatus.textContent = "Under Maintenance";
            currentStatus.classList.add("is-active");

            statusDescription.textContent =
                "Customer access is currently restricted.";
        } else if (scheduled) {
            currentStatus.textContent = "Scheduled";
            currentStatus.classList.add("is-scheduled");

            statusDescription.textContent =
                "A future maintenance window is scheduled.";
        } else {
            currentStatus.textContent = "Operational";

            statusDescription.textContent =
                "Customer access is currently available.";
        }

        document.getElementById(
            "maintenanceScheduledStart"
        ).textContent = formatDate(settings?.scheduled_start_at);

        document.getElementById(
            "maintenanceScheduledEnd"
        ).textContent = formatDate(settings?.scheduled_end_at);

        document.getElementById(
            "maintenanceExpectedReturn"
        ).textContent = formatDate(settings?.expected_return_at);
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: "same-origin",
            cache: "no-store",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const message =
                result?.message ||
                (response.status === 403
                    ? "You do not have permission to perform this action."
                    : `Maintenance request failed (${response.status}).`);

            throw new Error(message);
        }

        return result;
    }

    async function loadMaintenance() {
        const result = await apiRequest("");

        const settings = result.settings;

        if (!settings) {
            throw new Error(
                "The maintenance settings were not returned by the server."
            );
        }

        displayStatus(settings);

        setValue("maintenanceMessage", settings.message);
        setValue("maintenanceReason", settings.reason);

        setValue(
            "maintenanceExpectedReturnInput",
            toNairobiInputValue(settings.expected_return_at)
        );

        setValue(
            "maintenanceStartAt",
            toNairobiInputValue(settings.scheduled_start_at)
        );

        setValue(
            "maintenanceEndAt",
            toNairobiInputValue(settings.scheduled_end_at)
        );

        return settings;
    }

    async function loadHistory() {
        const body = document.getElementById(
            "maintenanceHistoryBody"
        );

        const message = document.getElementById(
            "maintenanceHistoryMessage"
        );

        body.replaceChildren();
        message.textContent = "Loading maintenance history...";

        const result = await apiRequest("/history");

        const events = Array.isArray(result.events)
            ? result.events
            : [];

        if (events.length === 0) {
            message.textContent =
                "No maintenance events have been recorded yet.";

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 4;
            cell.textContent = "No history available.";

            row.appendChild(cell);
            body.appendChild(row);

            return;
        }

        message.textContent =
            `${events.length} recent maintenance event(s).`;

        events.forEach(event => {
            const row = document.createElement("tr");

            const eventCell = document.createElement("td");
            const adminCell = document.createElement("td");
            const detailsCell = document.createElement("td");
            const dateCell = document.createElement("td");

            eventCell.textContent =
                String(event.event_type || "Maintenance event")
                    .replace(/_/g, " ");

            adminCell.textContent =
                event.admin_name ||
                event.admin_email ||
                "System";

            detailsCell.textContent =
                event.details || "—";

            dateCell.textContent =
                formatDate(event.created_at);

            row.append(
                eventCell,
                adminCell,
                detailsCell,
                dateCell
            );

            body.appendChild(row);
        });
    }

    async function runAction(button, action) {
        if (requestInProgress) return;

        requestInProgress = true;
        clearFeedback();

        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "Please wait...";

        try {
            const successMessage = await action();

            // Do not report success if the refreshed status or history fails.
            await loadMaintenance();
            await loadHistory();

            if (successMessage) {
                showFeedback(successMessage, "success");
            }
        } catch (error) {
            showFeedback(error.message, "error");
        } finally {
            requestInProgress = false;
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    function readMaintenanceFields() {
        const message = document.getElementById(
            "maintenanceMessage"
        ).value.trim();

        const reason = document.getElementById(
            "maintenanceReason"
        ).value.trim();

        const expectedReturnInput = document.getElementById(
            "maintenanceExpectedReturnInput"
        ).value;

        if (!message) {
            throw new Error(
                "Please enter a customer maintenance message."
            );
        }

        return {
            message,
            reason: reason || null,
            expectedReturnAt: toApiDate(expectedReturnInput)
        };
    }

    document.getElementById(
        "maintenanceSettingsForm"
    ).addEventListener("submit", event => {
        event.preventDefault();

        const button = event.currentTarget.querySelector(
            'button[type="submit"]'
        );

        runAction(button, async () => {
            const payload = readMaintenanceFields();

            await apiRequest("/settings", {
                method: "PATCH",
                body: JSON.stringify(payload)
            });

            return "Maintenance information saved successfully.";
        });
    });

    document.getElementById(
        "activateMaintenance"
    ).addEventListener("click", event => {
        const confirmed = window.confirm(
            "WARNING: This will immediately block customer access to WIN Business Suite. Are you sure you want to activate maintenance?"
        );

        if (!confirmed) return;

        runAction(event.currentTarget, async () => {
            const payload = readMaintenanceFields();

            await apiRequest("/activate", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            return "Maintenance has been activated.";
        });
    });

    document.getElementById(
        "deactivateMaintenance"
    ).addEventListener("click", event => {
        const confirmed = window.confirm(
            "Restore customer access to WIN Business Suite now?"
        );

        if (!confirmed) return;

        runAction(event.currentTarget, async () => {
            await apiRequest("/deactivate", {
                method: "POST",
                body: JSON.stringify({})
            });

            return "Customer access restoration completed.";
        });
    });

    document.getElementById(
        "maintenanceScheduleForm"
    ).addEventListener("submit", event => {
        event.preventDefault();

        const button = event.currentTarget.querySelector(
            'button[type="submit"]'
        );

        runAction(button, async () => {
            const payload = readMaintenanceFields();

            const startInput = document.getElementById(
                "maintenanceStartAt"
            ).value;

            const endInput = document.getElementById(
                "maintenanceEndAt"
            ).value;

            if (!startInput || !endInput) {
                throw new Error(
                    "Please enter both the maintenance start and end times."
                );
            }

            payload.startAt = toApiDate(startInput);
            payload.endAt = toApiDate(endInput);

            if (
                new Date(payload.endAt) <= new Date(payload.startAt)
            ) {
                throw new Error(
                    "The maintenance end time must be after its start time."
                );
            }

            if (new Date(payload.startAt) <= new Date()) {
                throw new Error(
                    "Choose a future maintenance start time."
                );
            }

            await apiRequest("/schedule", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            return "Maintenance schedule saved successfully.";
        });
    });

    document.getElementById(
        "cancelMaintenanceSchedule"
    ).addEventListener("click", event => {
        const confirmed = window.confirm(
            "Cancel the currently scheduled maintenance window?"
        );

        if (!confirmed) return;

        runAction(event.currentTarget, async () => {
            await apiRequest("/schedule/cancel", {
                method: "POST",
                body: JSON.stringify({})
            });

            return "Scheduled maintenance cancelled.";
        });
    });

    document.getElementById(
        "refreshMaintenance"
    ).addEventListener("click", event => {
        runAction(event.currentTarget, async () => {
            return "Maintenance status refreshed.";
        });
    });

    document.getElementById(
        "refreshMaintenanceHistory"
    ).addEventListener("click", event => {
        runAction(event.currentTarget, async () => {
            return "Maintenance history refreshed.";
        });
    });

    // Initial read-only loading. No maintenance action is performed.
    async function initialLoad() {
        try {
            await loadMaintenance();
            await loadHistory();
        } catch (error) {
            currentStatus.textContent = "Status unavailable";
            currentStatus.className =
                "maintenance-current-status is-active";

            statusDescription.textContent = error.message;
            showFeedback(error.message, "error");
        }
    }

    initialLoad();
});
