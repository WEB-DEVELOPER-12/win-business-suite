
"use strict";

(() => {
    const section = document.getElementById("section-payments");

    if (!section) {
        console.error("Subscriptions dashboard section was not found.");
        return;
    }

    // ==========================================
    // SUBSCRIPTIONS SCREEN STYLES
    // ==========================================

    const style = document.createElement("style");

    style.textContent = `
        .subscription-toolbar {
            margin: 20px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }

        .subscription-search {
            flex: 1;
            min-width: 220px;
            max-width: 430px;
            min-height: 43px;
            padding: 0 13px;
            display: flex;
            align-items: center;
            gap: 9px;
            background: #fff;
            border: 1px solid #e4eaf2;
            border-radius: 9px;
        }

        .subscription-search input {
            width: 100%;
            min-width: 0;
            border: 0;
            outline: 0;
            background: transparent;
            color: #172337;
            font: inherit;
            font-size: 12px;
        }

        .subscription-controls {
            display: flex;
            align-items: center;
            gap: 9px;
            flex-wrap: wrap;
        }

        .subscription-control {
            min-height: 40px;
            padding: 0 13px;
            border: 1px solid #dfe7f0;
            border-radius: 8px;
            background: #fff;
            color: #172337;
            font-size: 11px;
            font-weight: 700;
        }

        .subscription-control.primary {
            border-color: #087cf0;
            background: #087cf0;
            color: #fff;
        }

        .subscription-control:disabled,
        .subscription-action:disabled {
            opacity: .5;
            cursor: not-allowed;
        }

        .subscription-intro {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #dcecff;
            border-radius: 10px;
            background: #edf6ff;
            color: #426486;
            font-size: 11px;
            line-height: 1.7;
        }

        .subscription-intro strong {
            color: #174c7d;
        }

        .subscription-message {
            margin: 15px 0;
            padding: 13px 15px;
            border-radius: 9px;
            background: #edf6ff;
            color: #315c85;
            font-size: 11px;
            line-height: 1.7;
        }

        .subscription-message.error {
            background: #fff0f1;
            color: #a52d3b;
        }

        .subscription-summary {
            margin: 15px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            color: #758398;
            font-size: 11px;
        }

        .subscription-updated {
            color: #8794a6;
            font-size: 10px;
        }

        .subscription-table-wrap {
            width: 100%;
            overflow-x: auto;
            background: #fff;
            border: 1px solid #e4eaf2;
            border-radius: 13px;
        }

        .subscription-table {
            width: 100%;
            min-width: 1050px;
            border-collapse: collapse;
            text-align: left;
        }

        .subscription-table th {
            padding: 15px 14px;
            background: #f8fafd;
            border-bottom: 1px solid #e4eaf2;
            color: #718197;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .5px;
            text-transform: uppercase;
        }

        .subscription-table td {
            padding: 15px 14px;
            border-bottom: 1px solid #edf1f6;
            color: #33445b;
            font-size: 11px;
            vertical-align: middle;
        }

        .subscription-table tbody tr:last-child td {
            border-bottom: 0;
        }

        .subscription-table tbody tr:hover {
            background: #fbfdff;
        }

        .subscription-primary {
            color: #14243a;
            font-size: 12px;
            font-weight: 750;
        }

        .subscription-secondary {
            margin-top: 5px;
            color: #8794a6;
            font-size: 10px;
            overflow-wrap: anywhere;
        }

        .subscription-badge {
            display: inline-block;
            padding: 6px 9px;
            border-radius: 20px;
            background: #eef2f7;
            color: #52647a;
            font-size: 9px;
            font-weight: 800;
            text-transform: capitalize;
            white-space: nowrap;
        }

        .subscription-badge.active,
        .subscription-badge.trial {
            background: #e8f8f0;
            color: #137a53;
        }

        .subscription-badge.expired,
        .subscription-badge.suspended {
            background: #fff0f1;
            color: #a52d3b;
        }

        .subscription-badge.pending {
            background: #fff5e7;
            color: #986016;
        }

        .subscription-badge.not_started {
            background: #edf2f8;
            color: #52647a;
        }

        .subscription-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }

        .subscription-action {
            padding: 8px 10px;
            border: 1px solid #dce8f7;
            border-radius: 7px;
            background: #edf5ff;
            color: #1769c1;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
        }

        .subscription-action.activate {
            border-color: #b9e8d2;
            background: #eafaf3;
            color: #137a53;
        }

        .subscription-action.renew {
            border-color: #d4d2fa;
            background: #f0efff;
            color: #5147a4;
        }

        .subscription-action:hover {
            filter: brightness(.97);
        }

        .subscription-empty {
            padding: 45px 20px !important;
            color: #8794a6 !important;
            text-align: center;
            line-height: 1.7;
        }

        .subscription-pagination {
            margin-top: 15px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }

        .subscription-page-info {
            color: #758398;
            font-size: 11px;
        }

        .subscription-modal {
            position: fixed;
            inset: 0;
            z-index: 1100;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(4,15,30,.65);
            overflow-y: auto;
        }

        .subscription-modal[hidden] {
            display: none;
        }

        .subscription-modal-card {
            width: 100%;
            max-width: 590px;
            max-height: 92vh;
            overflow-y: auto;
            border-radius: 15px;
            background: #fff;
            box-shadow: 0 20px 60px rgba(0,0,0,.2);
        }

        .subscription-modal-header {
            padding: 22px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            background: #071426;
            color: #fff;
        }

        .subscription-modal-header h2 {
            margin: 0;
            font-size: 18px;
        }

        .subscription-modal-header p {
            margin: 6px 0 0;
            color: #aec4db;
            font-size: 11px;
        }

        .subscription-modal-close {
            width: 35px;
            height: 35px;
            border: 1px solid rgba(255,255,255,.2);
            border-radius: 8px;
            background: transparent;
            color: #fff;
            font-size: 19px;
        }

        .subscription-modal-body {
            padding: 22px;
        }

        .subscription-form-group {
            margin-bottom: 17px;
        }

        .subscription-form-group label {
            display: block;
            margin-bottom: 8px;
            color: #172337;
            font-size: 11px;
            font-weight: 800;
        }

        .subscription-form-group input,
        .subscription-form-group select,
        .subscription-form-group textarea {
            width: 100%;
            min-height: 43px;
            padding: 10px 12px;
            border: 1px solid #dfe7f0;
            border-radius: 8px;
            outline: none;
            background: #fff;
            color: #172337;
            font: inherit;
            font-size: 12px;
        }

        .subscription-form-group textarea {
            min-height: 100px;
            resize: vertical;
            line-height: 1.6;
        }

        .subscription-form-group input:focus,
        .subscription-form-group select:focus,
        .subscription-form-group textarea:focus {
            border-color: #087cf0;
            box-shadow: 0 0 0 3px rgba(8,124,240,.09);
        }

        .subscription-form-help {
            margin-top: 6px;
            color: #8794a6;
            font-size: 10px;
            line-height: 1.6;
        }

        .subscription-plan-price {
            padding: 13px;
            border: 1px solid #dcecff;
            border-radius: 9px;
            background: #f4f9ff;
            color: #315c85;
            font-size: 12px;
            line-height: 1.7;
        }

        .subscription-modal-footer {
            padding: 15px 22px;
            display: flex;
            justify-content: flex-end;
            gap: 9px;
            border-top: 1px solid #edf1f6;
        }

        .subscription-detail-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .subscription-detail-field {
            min-width: 0;
            padding: 12px;
            border: 1px solid #edf1f6;
            border-radius: 9px;
        }

        .subscription-detail-field span {
            display: block;
            color: #8794a6;
            font-size: 10px;
        }

        .subscription-detail-field strong {
            display: block;
            margin-top: 6px;
            color: #172337;
            font-size: 12px;
            overflow-wrap: anywhere;
        }

        .subscription-history-list {
            display: flex;
            flex-direction: column;
            gap: 11px;
        }

        .subscription-history-item {
            padding: 14px;
            border: 1px solid #edf1f6;
            border-radius: 10px;
            background: #fff;
        }

        .subscription-history-item h3 {
            margin: 0;
            color: #172337;
            font-size: 12px;
        }

        .subscription-history-item p {
            margin: 7px 0 0;
            color: #66768b;
            font-size: 11px;
            line-height: 1.7;
            overflow-wrap: anywhere;
        }

        .subscription-history-item small {
            display: block;
            margin-top: 8px;
            color: #8794a6;
            font-size: 10px;
        }

        @media (max-width: 600px) {
            .subscription-toolbar {
                align-items: stretch;
            }

            .subscription-search {
                max-width: none;
            }

            .subscription-controls {
                justify-content: space-between;
            }

            .subscription-control {
                flex: 1;
            }

            .subscription-detail-grid {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ==========================================
    // SUBSCRIPTIONS SCREEN HTML
    // ==========================================

    section.innerHTML = `
        <div class="section-heading">
            <h2>Subscription Management</h2>
            <p>
                Manage customer access, manual activations and renewals.
            </p>
        </div>

        <div class="subscription-intro">
            <strong>V1 manual subscription management</strong><br>
            Administrators activate or renew subscriptions after confirming
            arrangements outside WIN. Complimentary subscriptions can also
            be granted with a recorded reason. Payment processing and M-Pesa
            features remain reserved for Version 2.
        </div>

        <div class="subscription-toolbar">

            <label class="subscription-search">
                <span aria-hidden="true">⌕</span>

                <input
                    id="subscriptionSearch"
                    type="search"
                    maxlength="100"
                    placeholder="Search business, owner or email..."
                    autocomplete="off"
                    aria-label="Search subscriptions"
                >
            </label>

            <div class="subscription-controls">

                <select
                    id="subscriptionPageSize"
                    class="subscription-control"
                    aria-label="Subscriptions per page"
                >
                    <option value="10">10 per page</option>
                    <option value="25">25 per page</option>
                    <option value="50">50 per page</option>
                </select>

                <button
                    type="button"
                    class="subscription-control primary"
                    id="subscriptionRefresh"
                >
                    ↻ Refresh
                </button>

            </div>

        </div>

        <div
            id="subscriptionMessage"
            class="subscription-message"
            role="status"
            aria-live="polite"
            hidden
        ></div>

        <div class="subscription-summary">
            <span id="subscriptionCount">Loading subscriptions...</span>
            <span id="subscriptionUpdated" class="subscription-updated"></span>
        </div>

        <div class="subscription-table-wrap">

            <table class="subscription-table">

                <thead>
                    <tr>
                        <th>Business</th>
                        <th>Business Owner</th>
                        <th>Subscription</th>
                        <th>Status</th>
                        <th>Billing Cycle</th>
                        <th>Period Ends</th>
                        <th>Actions</th>
                    </tr>
                </thead>

                <tbody id="subscriptionTableBody">
                    <tr>
                        <td colspan="7" class="subscription-empty">
                            Loading subscriptions...
                        </td>
                    </tr>
                </tbody>

            </table>

        </div>

        <div class="subscription-pagination">

            <span
                id="subscriptionPageInfo"
                class="subscription-page-info"
            >
                Page 1
            </span>

            <div class="subscription-controls">

                <button
                    type="button"
                    class="subscription-control"
                    id="subscriptionPrevious"
                    disabled
                >
                    ← Previous
                </button>

                <button
                    type="button"
                    class="subscription-control"
                    id="subscriptionNext"
                    disabled
                >
                    Next →
                </button>

            </div>

        </div>

        <!-- ACTIVATION AND RENEWAL MODAL -->

        <div
            class="subscription-modal"
            id="subscriptionActionModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscriptionActionTitle"
            hidden
        >

            <form
                class="subscription-modal-card"
                id="subscriptionActionForm"
            >

                <div class="subscription-modal-header">

                    <div>
                        <h2 id="subscriptionActionTitle">
                            Activate Subscription
                        </h2>

                        <p id="subscriptionActionSubtitle">
                            Select the subscription settings.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="subscription-modal-close"
                        id="subscriptionActionClose"
                        aria-label="Close dialog"
                    >
                        ×
                    </button>

                </div>

                <div class="subscription-modal-body">

                    <div class="subscription-form-group">
                        <label for="subscriptionBillingCycle">
                            Subscription Plan
                        </label>

                        <select id="subscriptionBillingCycle" required>
                            <option value="monthly">
                                Monthly — KSh 1,000
                            </option>

                            <option value="annual">
                                Annual — KSh 10,000
                            </option>
                        </select>
                    </div>

                    <div class="subscription-form-group">
                        <label for="subscriptionActivationType">
                            Activation Type
                        </label>

                        <select id="subscriptionActivationType" required>
                            <option value="manual">
                                Manual activation
                            </option>

                            <option value="complimentary">
                                Complimentary subscription
                            </option>
                        </select>

                        <p class="subscription-form-help">
                            Manual activation is recorded after arrangements
                            have been confirmed outside WIN. Complimentary
                            subscriptions do not represent a payment.
                        </p>
                    </div>

                    <div
                        class="subscription-form-group"
                        id="subscriptionStartDateGroup"
                    >
                        <label for="subscriptionStartDate">
                            Activation Date
                        </label>

                        <input
                            type="date"
                            id="subscriptionStartDate"
                            required
                        >

                        <p class="subscription-form-help">
                            The expiry date is calculated from the selected
                            activation date.
                        </p>
                    </div>

                    <div
                        class="subscription-plan-price"
                        id="subscriptionPriceInformation"
                    >
                        Monthly plan: KSh 1,000.
                    </div>

                    <div class="subscription-form-group"
                         style="margin-top:18px;">

                        <label for="subscriptionActionReason">
                            Reason / Administrator Note
                        </label>

                        <textarea
                            id="subscriptionActionReason"
                            minlength="5"
                            maxlength="500"
                            placeholder="Enter why this subscription is being activated or renewed..."
                            required
                        ></textarea>

                        <p class="subscription-form-help">
                            Required. Between 5 and 500 characters.
                            This will be saved in the administrator activity log.
                        </p>

                    </div>

                </div>

                <div class="subscription-modal-footer">

                    <button
                        type="button"
                        class="subscription-control"
                        id="subscriptionActionCancel"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="subscription-control primary"
                        id="subscriptionActionSubmit"
                    >
                        Confirm Activation
                    </button>

                </div>

            </form>

        </div>

        <!-- BUSINESS DETAILS MODAL -->

        <div
            class="subscription-modal"
            id="subscriptionDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscriptionDetailsTitle"
            hidden
        >

            <div class="subscription-modal-card">

                <div class="subscription-modal-header">

                    <div>
                        <h2 id="subscriptionDetailsTitle">
                            Subscription Details
                        </h2>

                        <p id="subscriptionDetailsSubtitle"></p>
                    </div>

                    <button
                        type="button"
                        class="subscription-modal-close"
                        data-close-modal="details"
                        aria-label="Close details"
                    >
                        ×
                    </button>

                </div>

                <div
                    class="subscription-modal-body"
                    id="subscriptionDetailsBody"
                ></div>

                <div class="subscription-modal-footer">

                    <button
                        type="button"
                        class="subscription-control primary"
                        data-close-modal="details"
                    >
                        Close
                    </button>

                </div>

            </div>

        </div>

        <!-- SUBSCRIPTION HISTORY MODAL -->

        <div
            class="subscription-modal"
            id="subscriptionHistoryModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscriptionHistoryTitle"
            hidden
        >

            <div class="subscription-modal-card">

                <div class="subscription-modal-header">

                    <div>
                        <h2 id="subscriptionHistoryTitle">
                            Subscription History
                        </h2>

                        <p id="subscriptionHistorySubtitle"></p>
                    </div>

                    <button
                        type="button"
                        class="subscription-modal-close"
                        data-close-modal="history"
                        aria-label="Close history"
                    >
                        ×
                    </button>

                </div>

                <div
                    class="subscription-modal-body"
                    id="subscriptionHistoryBody"
                >
                    Loading history...
                </div>

                <div class="subscription-modal-footer">

                    <button
                        type="button"
                        class="subscription-control primary"
                        data-close-modal="history"
                    >
                        Close
                    </button>

                </div>

            </div>

        </div>
    `;

    // ==========================================
    // ELEMENT REFERENCES
    // ==========================================

    const elements = {
        search: document.getElementById("subscriptionSearch"),
        pageSize: document.getElementById("subscriptionPageSize"),
        refresh: document.getElementById("subscriptionRefresh"),
        message: document.getElementById("subscriptionMessage"),
        count: document.getElementById("subscriptionCount"),
        updated: document.getElementById("subscriptionUpdated"),
        tableBody: document.getElementById("subscriptionTableBody"),
        pageInfo: document.getElementById("subscriptionPageInfo"),
        previous: document.getElementById("subscriptionPrevious"),
        next: document.getElementById("subscriptionNext"),

        actionModal: document.getElementById("subscriptionActionModal"),
        actionForm: document.getElementById("subscriptionActionForm"),
        actionTitle: document.getElementById("subscriptionActionTitle"),
        actionSubtitle: document.getElementById("subscriptionActionSubtitle"),
        actionClose: document.getElementById("subscriptionActionClose"),
        actionCancel: document.getElementById("subscriptionActionCancel"),
        actionSubmit: document.getElementById("subscriptionActionSubmit"),
        billingCycle: document.getElementById("subscriptionBillingCycle"),
        activationType: document.getElementById("subscriptionActivationType"),
        startDate: document.getElementById("subscriptionStartDate"),
        startDateGroup: document.getElementById("subscriptionStartDateGroup"),
        priceInformation: document.getElementById("subscriptionPriceInformation"),
        reason: document.getElementById("subscriptionActionReason"),

        detailsModal: document.getElementById("subscriptionDetailsModal"),
        detailsTitle: document.getElementById("subscriptionDetailsTitle"),
        detailsSubtitle: document.getElementById("subscriptionDetailsSubtitle"),
        detailsBody: document.getElementById("subscriptionDetailsBody"),

        historyModal: document.getElementById("subscriptionHistoryModal"),
        historyTitle: document.getElementById("subscriptionHistoryTitle"),
        historySubtitle: document.getElementById("subscriptionHistorySubtitle"),
        historyBody: document.getElementById("subscriptionHistoryBody")
    };

    const state = {
        page: 1,
        limit: 10,
        search: "",
        total: 0,
        totalPages: 0,
        loading: false,
        actionInProgress: false,
        searchTimer: null,
        loadedOnce: false,
        businessById: new Map(),
        permissions: {
            canActivate: false,
            canRenew: false
        },
        selectedBusiness: null,
        selectedAction: null,
        lastFocusedElement: null
    };

    // ==========================================
    // GENERAL HELPERS
    // ==========================================

    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;
    }

    function displayValue(value) {
        if (value === null || value === undefined || value === "") {
            return "Not provided";
        }

        return String(value);
    }

    function formatDate(value) {
        if (!value) return "Not available";

        const text = String(value);
        const normalized = text.includes("T")
            ? text
            : text.replace(" ", "T") + "Z";

        const date = new Date(normalized);

        if (Number.isNaN(date.getTime())) {
            return text;
        }

        return new Intl.DateTimeFormat("en-KE", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function formatTime(value) {
        if (!value) return "";

        const date = new Date(
            String(value).includes("T")
                ? value
                : String(value).replace(" ", "T") + "Z"
        );

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat("en-KE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat("en-KE", {
            style: "currency",
            currency: "KES",
            maximumFractionDigits: 0
        }).format(Number(amount) || 0);
    }

    function getToday() {
        return new Date().toISOString().slice(0, 10);
    }

    function showMessage(message, type = "info") {
        elements.message.textContent = message;

        elements.message.className =
            type === "error"
                ? "subscription-message error"
                : "subscription-message";

        elements.message.hidden = false;
    }

    function hideMessage() {
        elements.message.hidden = true;
        elements.message.textContent = "";
    }

    function makeCell(content) {
        const cell = document.createElement("td");

        if (content instanceof Node) {
            cell.appendChild(content);
        } else {
            cell.textContent = displayValue(content);
        }

        return cell;
    }

    function makeActionButton(label, action, businessId, className = "") {
        const button = createElement(
            "button",
            `subscription-action ${className}`.trim(),
            label
        );

        button.type = "button";
        button.dataset.subscriptionAction = action;
        button.dataset.businessId = String(businessId);

        return button;
    }

    function getStatus(subscription) {
        return String(
            subscription.current_status || "not_started"
        ).toLowerCase();
    }

    // ==========================================
    // TABLE CELLS
    // ==========================================

    function makeBusinessCell(subscription) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-primary",
                subscription.business_name || "Unnamed business"
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-secondary",
                `${subscription.business_type || "Business"} · ID ${subscription.business_id}`
            )
        );

        return wrapper;
    }

    function makeOwnerCell(subscription) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-primary",
                subscription.owner_name || "Owner not available"
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-secondary",
                subscription.owner_email || "Email not provided"
            )
        );

        return wrapper;
    }

    function makePlanCell(subscription) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-primary",
                subscription.plan_name || "No plan assigned"
            )
        );

        if (subscription.activation_type === "complimentary") {
            wrapper.appendChild(
                createElement(
                    "div",
                    "subscription-secondary",
                    "Complimentary"
                )
            );
        } else if (subscription.activation_type === "manual") {
            wrapper.appendChild(
                createElement(
                    "div",
                    "subscription-secondary",
                    "Manually activated"
                )
            );
        }

        return wrapper;
    }

    function makeStatusCell(subscription) {
        const status = getStatus(subscription);

        const label = status.replace(/_/g, " ");

        const allowedClasses = [
            "active",
            "trial",
            "expired",
            "pending",
            "not_started",
            "suspended"
        ];

        const badge = createElement(
            "span",
            "subscription-badge",
            label
        );

        if (allowedClasses.includes(status)) {
            badge.classList.add(status);
        }

        return badge;
    }

    function makeBillingCell(subscription) {
        const cycle = subscription.billing_cycle;

        if (cycle !== "monthly" && cycle !== "annual") {
            return "Not assigned";
        }

        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-primary",
                cycle === "monthly" ? "Monthly" : "Annual"
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-secondary",
                formatMoney(cycle === "monthly" ? 1000 : 10000)
            )
        );

        return wrapper;
    }

    function makePeriodEndCell(subscription) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "subscription-primary",
                formatDate(subscription.current_period_end)
            )
        );

        if (subscription.trial_ends_at && getStatus(subscription) === "trial") {
            wrapper.appendChild(
                createElement(
                    "div",
                    "subscription-secondary",
                    `Trial ends: ${formatDate(subscription.trial_ends_at)}`
                )
            );
        }

        return wrapper;
    }

    function makeBusinessActions(subscription) {
        const wrapper = createElement(
            "div",
            "subscription-actions"
        );

        wrapper.appendChild(
            makeActionButton(
                "Details",
                "details",
                subscription.business_id
            )
        );

        wrapper.appendChild(
            makeActionButton(
                "History",
                "history",
                subscription.business_id
            )
        );

        const status = getStatus(subscription);

        if (
            state.permissions.canActivate &&
            status !== "active"
        ) {
            wrapper.appendChild(
                makeActionButton(
                    "Activate",
                    "activate",
                    subscription.business_id,
                    "activate"
                )
            );
        }

        if (
            state.permissions.canRenew &&
            status === "active"
        ) {
            wrapper.appendChild(
                makeActionButton(
                    "Renew",
                    "renew",
                    subscription.business_id,
                    "renew"
                )
            );
        }

        if (
            !state.permissions.canActivate &&
            !state.permissions.canRenew
        ) {
            wrapper.appendChild(
                createElement(
                    "span",
                    "subscription-secondary",
                    "View only"
                )
            );
        }

        return wrapper;
    }

    // ==========================================
    // DETAILS MODAL
    // ==========================================

    function addDetailField(container, label, value) {
        const field = createElement(
            "div",
            "subscription-detail-field"
        );

        field.appendChild(
            createElement("span", "", label)
        );

        field.appendChild(
            createElement("strong", "", displayValue(value))
        );

        container.appendChild(field);
    }

    function openDetails(subscription) {
        state.lastFocusedElement = document.activeElement;

        elements.detailsTitle.textContent =
            subscription.business_name || "Subscription Details";

        elements.detailsSubtitle.textContent =
            `Business ID: ${subscription.business_id}`;

        elements.detailsBody.replaceChildren();

        const grid = createElement(
            "div",
            "subscription-detail-grid"
        );

        const details = [
            ["Business", subscription.business_name],
            ["Business Type", subscription.business_type],
            ["Owner", subscription.owner_name],
            ["Owner Email", subscription.owner_email],
            ["Plan", subscription.plan_name],
            ["Status", getStatus(subscription).replace(/_/g, " ")],
            ["Billing Cycle", subscription.billing_cycle],
            ["Activation Type", subscription.activation_type],
            ["Trial Started", formatDate(subscription.trial_started_at)],
            ["Trial Ends", formatDate(subscription.trial_ends_at)],
            ["Period Started", formatDate(subscription.current_period_start)],
            ["Period Ends", formatDate(subscription.current_period_end)],
            ["Last Updated", formatDate(subscription.updated_at)]
        ];

        for (const [label, value] of details) {
            addDetailField(grid, label, value);
        }

        elements.detailsBody.appendChild(grid);
        elements.detailsModal.hidden = false;
    }

    // ==========================================
    // ACTION MODAL
    // ==========================================

    function updatePriceInformation() {
        const cycle = elements.billingCycle.value;
        const type = elements.activationType.value;

        const price = cycle === "monthly" ? 1000 : 10000;

        if (type === "complimentary") {
            elements.priceInformation.textContent =
                `Complimentary ${cycle} subscription. ` +
                `No payment is recorded or collected. ` +
                `Standard reference price: ${formatMoney(price)}.`;
        } else {
            elements.priceInformation.textContent =
                `${cycle === "monthly" ? "Monthly" : "Annual"} plan. ` +
                `Standard plan price: ${formatMoney(price)}. ` +
                `Payment arrangements are handled outside WIN in V1.`;
        }
    }

    function openActionModal(subscription, action) {
        if (state.actionInProgress) return;

        state.lastFocusedElement = document.activeElement;
        state.selectedBusiness = subscription;
        state.selectedAction = action;

        const isRenewal = action === "renew";

        elements.actionTitle.textContent = isRenewal
            ? "Renew Subscription"
            : "Activate Subscription";

        elements.actionSubtitle.textContent =
            subscription.business_name || "Selected business";

        elements.billingCycle.value =
            subscription.billing_cycle === "annual"
                ? "annual"
                : "monthly";

        elements.activationType.value =
            subscription.activation_type === "complimentary"
                ? "complimentary"
                : "manual";

        elements.startDate.value = getToday();
        elements.startDate.max = getToday();

        elements.startDateGroup.hidden = isRenewal;
        elements.startDate.required = !isRenewal;

        elements.reason.value = "";

        elements.actionSubmit.textContent = isRenewal
            ? "Confirm Renewal"
            : "Confirm Activation";

        updatePriceInformation();

        elements.actionModal.hidden = false;
        elements.billingCycle.focus();
    }

    function closeActionModal() {
        if (state.actionInProgress) return;

        elements.actionModal.hidden = true;
        elements.actionForm.reset();

        state.selectedBusiness = null;
        state.selectedAction = null;

        if (state.lastFocusedElement) {
            state.lastFocusedElement.focus();
        }
    }

    // ==========================================
    // LOAD SUBSCRIPTIONS
    // ==========================================

    async function loadSubscriptions() {
        if (state.loading) return;

        state.loading = true;
        hideMessage();

        elements.refresh.disabled = true;
        elements.refresh.textContent = "Loading...";
        elements.previous.disabled = true;
        elements.next.disabled = true;
        elements.count.textContent = "Loading subscriptions...";

        const params = new URLSearchParams({
            page: String(state.page),
            limit: String(state.limit)
        });

        if (state.search) {
            params.set("search", state.search);
        }

        try {
            const response = await fetch(
                `/api/admin/subscriptions?${params.toString()}`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const result = await response.json().catch(() => null);

            if (response.status === 401) {
                window.location.replace("/admin/login.html");
                return;
            }

            if (response.status === 403) {
                throw new Error(
                    result?.message ||
                    "You do not have permission to view subscriptions."
                );
            }

            if (!response.ok || !result || !result.success) {
                throw new Error(
                    result?.message ||
                    "Could not retrieve subscriptions."
                );
            }

            if (
                !Array.isArray(result.subscriptions) ||
                !result.pagination
            ) {
                throw new Error(
                    "The server returned an invalid subscription response."
                );
            }

            state.permissions = {
                canActivate: result.permissions?.canActivate === true,
                canRenew: result.permissions?.canRenew === true
            };

            state.businessById.clear();

            const fragment = document.createDocumentFragment();

            if (result.subscriptions.length === 0) {
                const row = document.createElement("tr");

                const cell = createElement(
                    "td",
                    "subscription-empty",
                    state.search
                        ? "No subscriptions match your search."
                        : "No registered businesses were found."
                );

                cell.colSpan = 7;
                row.appendChild(cell);
                fragment.appendChild(row);

            } else {
                for (const subscription of result.subscriptions) {
                    state.businessById.set(
                        String(subscription.business_id),
                        subscription
                    );

                    const row = document.createElement("tr");

                    row.appendChild(makeCell(makeBusinessCell(subscription)));
                    row.appendChild(makeCell(makeOwnerCell(subscription)));
                    row.appendChild(makeCell(makePlanCell(subscription)));
                    row.appendChild(makeCell(makeStatusCell(subscription)));
                    row.appendChild(makeCell(makeBillingCell(subscription)));
                    row.appendChild(makeCell(makePeriodEndCell(subscription)));
                    row.appendChild(makeCell(makeBusinessActions(subscription)));

                    fragment.appendChild(row);
                }
            }

            elements.tableBody.replaceChildren(fragment);

            const pagination = result.pagination;

            state.page = pagination.page;
            state.limit = pagination.limit;
            state.total = pagination.total;
            state.totalPages = pagination.totalPages;

            const start = state.total === 0
                ? 0
                : ((state.page - 1) * state.limit) + 1;

            const end = Math.min(
                state.page * state.limit,
                state.total
            );

            elements.count.textContent =
                `Showing ${start}–${end} of ${state.total} businesses`;

            elements.pageInfo.textContent =
                `Page ${state.page} of ${Math.max(state.totalPages, 1)}`;

            elements.previous.disabled =
                !pagination.hasPrevious;

            elements.next.disabled =
                !pagination.hasNext;

            elements.updated.textContent =
                `Updated ${formatTime(result.updatedAt)}`;

            state.loadedOnce = true;

        } catch (error) {
            console.error(
                "Admin Subscriptions dashboard error:",
                error
            );

            elements.tableBody.replaceChildren();

            const row = document.createElement("tr");

            const cell = createElement(
                "td",
                "subscription-empty",
                "Subscription information could not be loaded."
            );

            cell.colSpan = 7;
            row.appendChild(cell);
            elements.tableBody.appendChild(row);

            state.total = 0;
            state.totalPages = 0;

            elements.count.textContent =
                "Subscription information is unavailable.";

            elements.pageInfo.textContent = "Page unavailable";

            elements.previous.disabled = true;
            elements.next.disabled = true;

            showMessage(
                error.message ||
                "Something went wrong while loading subscriptions.",
                "error"
            );

        } finally {
            state.loading = false;

            elements.refresh.disabled = false;
            elements.refresh.textContent = "↻ Refresh";

            if (state.totalPages === 0) {
                elements.previous.disabled = true;
                elements.next.disabled = true;
            }
        }
    }

    // ==========================================
    // SUBSCRIPTION HISTORY
    // ==========================================

    async function openHistory(subscription) {
        if (state.actionInProgress) return;

        state.lastFocusedElement = document.activeElement;

        elements.historyTitle.textContent =
            "Subscription History";

        elements.historySubtitle.textContent =
            `${subscription.business_name} · Business ID ${subscription.business_id}`;

        elements.historyBody.replaceChildren(
            createElement(
                "p",
                "subscription-secondary",
                "Loading subscription history..."
            )
        );

        elements.historyModal.hidden = false;

        try {
            const response = await fetch(
                `/api/admin/subscriptions/${encodeURIComponent(subscription.business_id)}/history`,
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json"
                    }
                }
            );

            const result = await response.json().catch(() => null);

            if (response.status === 401) {
                window.location.replace("/admin/login.html");
                return;
            }

            if (!response.ok || !result || !result.success) {
                throw new Error(
                    result?.message ||
                    "Could not retrieve subscription history."
                );
            }

            elements.historyBody.replaceChildren();

            if (!Array.isArray(result.history) || result.history.length === 0) {
                elements.historyBody.appendChild(
                    createElement(
                        "p",
                        "subscription-empty",
                        "No subscription actions have been recorded yet."
                    )
                );

                return;
            }

            const list = createElement(
                "div",
                "subscription-history-list"
            );

            for (const item of result.history) {
                const card = createElement(
                    "article",
                    "subscription-history-item"
                );

                const title = String(item.action || "Subscription action")
                    .replace(/\./g, " ")
                    .replace(/_/g, " ");

                card.appendChild(
                    createElement(
                        "h3",
                        "",
                        title
                    )
                );

                const details = item.details || {};

                const detailLines = [
                    details.businessName
                        ? `Business: ${details.businessName}`
                        : null,
                    details.billingCycle
                        ? `Billing: ${details.billingCycle}`
                        : null,
                    details.activationType
                        ? `Activation: ${details.activationType}`
                        : null,
                    details.startDate
                        ? `Period starts: ${formatDate(details.startDate)}`
                        : null,
                    details.endDate
                        ? `Period ends: ${formatDate(details.endDate)}`
                        : null,
                    details.reason
                        ? `Reason: ${details.reason}`
                        : null
                ].filter(Boolean);

                for (const line of detailLines) {
                    card.appendChild(
                        createElement("p", "", line)
                    );
                }

                card.appendChild(
                    createElement(
                        "small",
                        "",
                        `Administrator: ${item.administratorName || "Not available"} · ${formatTime(item.createdAt)}`
                    )
                );

                list.appendChild(card);
            }

            elements.historyBody.appendChild(list);

        } catch (error) {
            console.error(
                "Subscription history error:",
                error
            );

            elements.historyBody.replaceChildren();

            elements.historyBody.appendChild(
                createElement(
                    "p",
                    "subscription-message error",
                    error.message ||
                    "Could not load subscription history."
                )
            );
        }
    }

    // ==========================================
    // SUBMIT MANUAL ACTIVATION OR RENEWAL
    // ==========================================

    async function submitSubscriptionAction(event) {
        event.preventDefault();

        if (
            state.actionInProgress ||
            !state.selectedBusiness ||
            !state.selectedAction
        ) {
            return;
        }

        const subscription = state.selectedBusiness;
        const action = state.selectedAction;

        const billingCycle = elements.billingCycle.value;
        const activationType = elements.activationType.value;
        const reason = elements.reason.value.trim();
        const startDate = elements.startDate.value;

        if (
            billingCycle !== "monthly" &&
            billingCycle !== "annual"
        ) {
            showMessage("Choose a valid subscription plan.", "error");
            return;
        }

        if (
            activationType !== "manual" &&
            activationType !== "complimentary"
        ) {
            showMessage("Choose a valid activation type.", "error");
            return;
        }

        if (reason.length < 5 || reason.length > 500) {
            showMessage(
                "The reason must contain between 5 and 500 characters.",
                "error"
            );

            return;
        }

        if (action === "activate") {
            if (!startDate || startDate > getToday()) {
                showMessage(
                    "Choose a valid activation date no later than today.",
                    "error"
                );

                return;
            }
        }

        const isRenewal = action === "renew";

        const confirmationText = isRenewal
            ? `Renew the subscription for "${subscription.business_name}"?\n\nThe new period will be added after any remaining paid period.`
            : `Activate the subscription for "${subscription.business_name}"?\n\nPlan: ${billingCycle}\nType: ${activationType}\nActivation date: ${startDate}`;

        if (!window.confirm(confirmationText)) {
            return;
        }

        const body = {
            billingCycle,
            activationType,
            reason
        };

        if (!isRenewal) {
            body.startDate = startDate;
        }

        state.actionInProgress = true;

        elements.actionSubmit.disabled = true;
        elements.actionCancel.disabled = true;
        elements.actionClose.disabled = true;

        elements.actionSubmit.textContent = isRenewal
            ? "Renewing..."
            : "Activating...";

        hideMessage();

        try {
            const response = await fetch(
                `/api/admin/subscriptions/${encodeURIComponent(subscription.business_id)}/${action}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(body)
                }
            );

            const result = await response.json().catch(() => null);

            if (response.status === 401) {
                window.location.replace("/admin/login.html");
                return;
            }

            if (!response.ok || !result || !result.success) {
                throw new Error(
                    result?.message ||
                    "The subscription action could not be completed."
                );
            }

            elements.actionModal.hidden = true;
            elements.actionForm.reset();

            state.selectedBusiness = null;
            state.selectedAction = null;

            await loadSubscriptions();

            showMessage(
                result.message ||
                "Subscription updated successfully."
            );

        } catch (error) {
            console.error(
                "Subscription action failed:",
                error
            );

            showMessage(
                error.message ||
                "The subscription action could not be completed.",
                "error"
            );

        } finally {
            state.actionInProgress = false;

            elements.actionSubmit.disabled = false;
            elements.actionCancel.disabled = false;
            elements.actionClose.disabled = false;

            elements.actionSubmit.textContent =
                state.selectedAction === "renew"
                    ? "Confirm Renewal"
                    : "Confirm Activation";
        }
    }

    // ==========================================
    // MODAL CLOSE HELPERS
    // ==========================================

    function closeSimpleModal(modal) {
        modal.hidden = true;

        if (state.lastFocusedElement) {
            state.lastFocusedElement.focus();
        }
    }

    function closeAllSimpleModals() {
        if (!elements.detailsModal.hidden) {
            closeSimpleModal(elements.detailsModal);
        }

        if (!elements.historyModal.hidden) {
            closeSimpleModal(elements.historyModal);
        }
    }

    // ==========================================
    // TABLE ACTIONS
    // ==========================================

    elements.tableBody.addEventListener("click", event => {
        const button = event.target.closest(
            "[data-subscription-action]"
        );

        if (!button || state.loading || state.actionInProgress) {
            return;
        }

        const subscription = state.businessById.get(
            button.dataset.businessId
        );

        if (!subscription) {
            showMessage(
                "This business information is no longer available. Refresh and try again.",
                "error"
            );

            return;
        }

        const action = button.dataset.subscriptionAction;

        if (action === "details") {
            openDetails(subscription);
            return;
        }

        if (action === "history") {
            openHistory(subscription);
            return;
        }

        if (
            action === "activate" &&
            state.permissions.canActivate
        ) {
            openActionModal(subscription, "activate");
            return;
        }

        if (
            action === "renew" &&
            state.permissions.canRenew
        ) {
            openActionModal(subscription, "renew");
        }
    });

    // ==========================================
    // ACTION FORM EVENTS
    // ==========================================

    elements.actionForm.addEventListener(
        "submit",
        submitSubscriptionAction
    );

    elements.billingCycle.addEventListener(
        "change",
        updatePriceInformation
    );

    elements.activationType.addEventListener(
        "change",
        updatePriceInformation
    );

    elements.actionClose.addEventListener(
        "click",
        closeActionModal
    );

    elements.actionCancel.addEventListener(
        "click",
        closeActionModal
    );

    // ==========================================
    // MODAL CLOSE EVENTS
    // ==========================================

    document.querySelectorAll("[data-close-modal]").forEach(button => {
        button.addEventListener("click", () => {
            const modalType = button.dataset.closeModal;

            if (modalType === "details") {
                closeSimpleModal(elements.detailsModal);
            }

            if (modalType === "history") {
                closeSimpleModal(elements.historyModal);
            }
        });
    });

    elements.actionModal.addEventListener("click", event => {
        if (event.target === elements.actionModal) {
            closeActionModal();
        }
    });

    elements.detailsModal.addEventListener("click", event => {
        if (event.target === elements.detailsModal) {
            closeSimpleModal(elements.detailsModal);
        }
    });

    elements.historyModal.addEventListener("click", event => {
        if (event.target === elements.historyModal) {
            closeSimpleModal(elements.historyModal);
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (!elements.actionModal.hidden) {
            closeActionModal();
            return;
        }

        closeAllSimpleModals();
    });

    // ==========================================
    // SEARCH AND PAGINATION
    // ==========================================

    elements.search.addEventListener("input", () => {
        clearTimeout(state.searchTimer);

        state.searchTimer = window.setTimeout(() => {
            state.search = elements.search.value.trim();
            state.page = 1;

            loadSubscriptions();
        }, 350);
    });

    elements.pageSize.addEventListener("change", () => {
        state.limit = Number(elements.pageSize.value);
        state.page = 1;

        loadSubscriptions();
    });

    elements.refresh.addEventListener(
        "click",
        loadSubscriptions
    );

    elements.previous.addEventListener("click", () => {
        if (state.page > 1 && !state.loading) {
            state.page -= 1;
            loadSubscriptions();
        }
    });

    elements.next.addEventListener("click", () => {
        if (
            state.page < state.totalPages &&
            !state.loading
        ) {
            state.page += 1;
            loadSubscriptions();
        }
    });

    // ==========================================
    // LOAD WHEN ADMIN OPENS THE PAYMENTS SECTION
    // ==========================================

    const paymentsNavigation = document.querySelector(
        '.nav-item[data-section="payments"]'
    );

    if (paymentsNavigation) {
        paymentsNavigation.addEventListener("click", () => {
            if (!state.loadedOnce) {
                loadSubscriptions();
            }
        });
    }

    // Refresh when the administrator returns to the section.
    document.addEventListener("visibilitychange", () => {
        if (
            document.visibilityState === "visible" &&
            section.classList.contains("active") &&
            state.loadedOnce
        ) {
            loadSubscriptions();
        }
    });

})();
