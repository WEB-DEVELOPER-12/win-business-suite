
"use strict";

(() => {
    const section = document.getElementById("section-customers");

    if (!section) {
        console.error("Customers dashboard section was not found.");
        return;
    }

    // ==========================================
    // CUSTOMERS SCREEN STYLES
    // ==========================================

    const style = document.createElement("style");

    style.textContent = `
        .customers-subnav {
            display: flex;
            gap: 8px;
            margin: 20px 0;
            border-bottom: 1px solid #e4eaf2;
            flex-wrap: wrap;
        }

        .customers-subtab {
            padding: 12px 16px;
            border: 0;
            border-bottom: 3px solid transparent;
            background: transparent;
            color: #758398;
            font-size: 12px;
            font-weight: 750;
        }

        .customers-subtab.active {
            border-bottom-color: #087cf0;
            color: #087cf0;
        }

        .coming-soon {
            margin-left: 7px;
            padding: 4px 7px;
            border-radius: 10px;
            background: #fff4e5;
            color: #986016;
            font-size: 9px;
            font-weight: 800;
        }

        .customers-view {
            display: none;
        }

        .customers-view.active {
            display: block;
        }

        .customers-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            margin: 20px 0;
        }

        .customers-search {
            flex: 1;
            min-width: 220px;
            max-width: 430px;
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 0 13px;
            min-height: 43px;
            background: #ffffff;
            border: 1px solid #e4eaf2;
            border-radius: 9px;
        }

        .customers-search input {
            width: 100%;
            min-width: 0;
            border: 0;
            outline: 0;
            background: transparent;
            color: #172337;
            font: inherit;
            font-size: 12px;
        }

        .customers-actions {
            display: flex;
            gap: 9px;
            align-items: center;
        }

        .customers-control {
            min-height: 40px;
            padding: 0 13px;
            border: 1px solid #dfe7f0;
            border-radius: 8px;
            background: #ffffff;
            color: #172337;
            font-size: 11px;
            font-weight: 700;
        }

        .customers-control.primary {
            border-color: #087cf0;
            background: #087cf0;
            color: #ffffff;
        }

        .customers-control:disabled,
        .customer-action-button:disabled {
            opacity: .5;
            cursor: not-allowed;
        }

        .customers-summary {
            margin: 14px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            color: #758398;
            font-size: 11px;
        }

        .customers-table-wrap {
            width: 100%;
            overflow-x: auto;
            background: #ffffff;
            border: 1px solid #e4eaf2;
            border-radius: 13px;
        }

        .customers-table {
            width: 100%;
            min-width: 1100px;
            border-collapse: collapse;
            text-align: left;
        }

        .customers-table th {
            padding: 15px 14px;
            background: #f8fafd;
            border-bottom: 1px solid #e4eaf2;
            color: #718197;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .5px;
            text-transform: uppercase;
        }

        .customers-table td {
            padding: 15px 14px;
            border-bottom: 1px solid #edf1f6;
            color: #33445b;
            font-size: 11px;
            vertical-align: middle;
        }

        .customers-table tbody tr:last-child td {
            border-bottom: 0;
        }

        .customers-table tbody tr:hover {
            background: #fbfdff;
        }

        .customer-primary {
            color: #14243a;
            font-size: 12px;
            font-weight: 750;
        }

        .customer-secondary {
            margin-top: 5px;
            color: #8794a6;
            font-size: 10px;
            overflow-wrap: anywhere;
        }

        .customer-status {
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

        .customer-status.active,
        .customer-status.trial {
            background: #e8f8f0;
            color: #137a53;
        }

        .customer-status.suspended {
            background: #fff0f1;
            color: #a52d3b;
        }

        .customer-action-buttons {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }

        .customer-action-button {
            padding: 8px 11px;
            border: 1px solid #dce8f7;
            border-radius: 7px;
            background: #edf5ff;
            color: #1769c1;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
        }

        .customer-action-button.suspend {
            border-color: #f2c7ca;
            background: #fff0f1;
            color: #a52d3b;
        }

        .customer-action-button.restore {
            border-color: #b9e8d2;
            background: #eafaf3;
            color: #137a53;
        }

        .customer-action-button:hover {
            filter: brightness(.97);
        }

        .customers-empty {
            padding: 45px 20px !important;
            color: #8794a6 !important;
            text-align: center;
            line-height: 1.7;
        }

        .customers-message {
            margin: 15px 0;
            padding: 13px 15px;
            border-radius: 9px;
            background: #edf6ff;
            color: #315c85;
            font-size: 11px;
            line-height: 1.6;
        }

        .customers-message.error {
            background: #fff0f1;
            color: #a52d3b;
        }

        .customers-pagination {
            margin-top: 15px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }

        .customers-page-info {
            color: #758398;
            font-size: 11px;
        }

        .customers-updated {
            color: #8794a6;
            font-size: 10px;
        }

        .deletion-placeholder {
            padding: 30px;
            background: white;
            border: 1px solid #e4eaf2;
            border-radius: 14px;
        }

        .deletion-placeholder h3 {
            color: #172337;
            font-size: 19px;
        }

        .deletion-placeholder p {
            color: #758398;
            font-size: 12px;
            line-height: 1.8;
        }

        .deletion-placeholder ul {
            color: #52647a;
            font-size: 12px;
            line-height: 2;
        }

        .deletion-notice {
            margin-top: 20px;
            padding: 16px;
            border: 1px solid #f3dfbc;
            border-radius: 10px;
            background: #fff9ef;
            color: #8c631f;
            font-size: 12px;
            line-height: 1.7;
        }

        .profile-modal {
            position: fixed;
            inset: 0;
            z-index: 1000;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(4,15,30,.65);
            overflow-y: auto;
        }

        .profile-modal[hidden] {
            display: none;
        }

        .profile-card {
            width: 100%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            border-radius: 15px;
            background: white;
            box-shadow: 0 20px 60px rgba(0,0,0,.2);
        }

        .profile-header {
            padding: 22px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            background: #071426;
            color: white;
        }

        .profile-header h2 {
            margin: 0;
            font-size: 18px;
        }

        .profile-header p {
            margin: 6px 0 0;
            color: #aec4db;
            font-size: 11px;
        }

        .profile-close {
            width: 35px;
            height: 35px;
            border: 1px solid rgba(255,255,255,.2);
            border-radius: 8px;
            background: transparent;
            color: white;
            font-size: 19px;
        }

        .profile-body {
            padding: 22px;
        }

        .profile-group-title {
            margin: 18px 0 10px;
            color: #087cf0;
            font-size: 10px;
            font-weight: 850;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        .profile-group-title:first-child {
            margin-top: 0;
        }

        .profile-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .profile-field {
            padding: 12px;
            border: 1px solid #edf1f6;
            border-radius: 9px;
            min-width: 0;
        }

        .profile-field span {
            display: block;
            color: #8794a6;
            font-size: 10px;
        }

        .profile-field strong {
            display: block;
            margin-top: 6px;
            color: #172337;
            font-size: 12px;
            overflow-wrap: anywhere;
        }

        .profile-footer {
            padding: 15px 22px;
            display: flex;
            justify-content: flex-end;
            border-top: 1px solid #edf1f6;
        }

        @media (max-width: 600px) {
            .customers-toolbar {
                align-items: stretch;
            }

            .customers-search {
                max-width: none;
            }

            .customers-actions {
                justify-content: space-between;
            }

            .customers-control {
                flex: 1;
            }

            .profile-grid {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);

    // ==========================================
    // CUSTOMERS SCREEN HTML
    // ==========================================

    section.innerHTML = `
        <div class="section-heading">
            <h2>Customer Management</h2>
            <p>Manage registered businesses on WIN Business Suite.</p>
        </div>

        <div class="customers-subnav" role="tablist">

            <button
                type="button"
                class="customers-subtab active"
                data-customers-view="accounts"
                role="tab"
                aria-selected="true"
            >
                Business Accounts
            </button>

            <button
                type="button"
                class="customers-subtab"
                data-customers-view="deletion"
                role="tab"
                aria-selected="false"
            >
                Account Deletion
                <span class="coming-soon">COMING IN V2</span>
            </button>

        </div>

        <div class="customers-view active" id="customersAccountsView">

            <div class="section-heading">
                <h2>Registered Businesses</h2>
                <p>
                    View business accounts, owners and subscription information.
                </p>
            </div>

            <div class="customers-toolbar">

                <label class="customers-search">
                    <span aria-hidden="true">⌕</span>

                    <input
                        id="customerSearch"
                        type="search"
                        maxlength="100"
                        placeholder="Search business, owner, email or phone..."
                        autocomplete="off"
                        aria-label="Search registered businesses"
                    >
                </label>

                <div class="customers-actions">

                    <select
                        id="customerPageSize"
                        class="customers-control"
                        aria-label="Businesses per page"
                    >
                        <option value="10">10 per page</option>
                        <option value="25">25 per page</option>
                        <option value="50">50 per page</option>
                    </select>

                    <button
                        type="button"
                        class="customers-control primary"
                        id="refreshCustomers"
                    >
                        ↻ Refresh
                    </button>

                </div>

            </div>

            <div
                id="customersMessage"
                class="customers-message"
                role="status"
                aria-live="polite"
                hidden
            ></div>

            <div class="customers-summary">
                <span id="customersCount">Loading businesses...</span>
                <span id="customersUpdated" class="customers-updated"></span>
            </div>

            <div class="customers-table-wrap">

                <table class="customers-table">

                    <thead>
                        <tr>
                            <th>Business</th>
                            <th>Business Owner</th>
                            <th>Contact</th>
                            <th>Subscription</th>
                            <th>Account Status</th>
                            <th>Registered</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody id="customersTableBody">
                        <tr>
                            <td colspan="7" class="customers-empty">
                                Loading registered businesses...
                            </td>
                        </tr>
                    </tbody>

                </table>

            </div>

            <div class="customers-pagination">

                <span
                    id="customersPageInfo"
                    class="customers-page-info"
                >
                    Page 1
                </span>

                <div class="customers-actions">

                    <button
                        type="button"
                        class="customers-control"
                        id="customersPrevious"
                        disabled
                    >
                        ← Previous
                    </button>

                    <button
                        type="button"
                        class="customers-control"
                        id="customersNext"
                        disabled
                    >
                        Next →
                    </button>

                </div>

            </div>

        </div>

        <div class="customers-view" id="customersDeletionView">

            <div class="section-heading">
                <h2>Account Deletion</h2>
                <p>Account deletion management for WIN Business Suite.</p>
            </div>

            <div class="deletion-placeholder">

                <div class="module-icon">🛡️</div>

                <h3>Business Account Deletion</h3>

                <p>
                    This section is reserved for the future account deletion
                    and recovery management system.
                </p>

                <ul>
                    <li>Schedule an account for deletion.</li>
                    <li>Block business access during the recovery period.</li>
                    <li>Restore an account during the 30-day period.</li>
                    <li>Automatically permanently delete accounts after 30 days.</li>
                    <li>Keep administrator activity and deletion records.</li>
                </ul>

                <div class="deletion-notice">
                    <strong>Coming in Version 2</strong><br>
                    Account deletion and restoration are not active in Version 1.
                    No business accounts or records can be deleted from this screen.
                </div>

            </div>

        </div>

        <!-- BUSINESS PROFILE MODAL -->

        <div
            class="profile-modal"
            id="businessProfileModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profileTitle"
            hidden
        >

            <div class="profile-card">

                <div class="profile-header">

                    <div>
                        <h2 id="profileTitle">Business Profile</h2>
                        <p id="profileSubtitle">Registered business information</p>
                    </div>

                    <button
                        type="button"
                        class="profile-close"
                        id="profileCloseTop"
                        aria-label="Close business profile"
                    >
                        ×
                    </button>

                </div>

                <div class="profile-body" id="businessProfileBody"></div>

                <div class="profile-footer">

                    <button
                        type="button"
                        class="customers-control primary"
                        id="profileCloseBottom"
                    >
                        Close Profile
                    </button>

                </div>

            </div>

        </div>
    `;

    // ==========================================
    // ELEMENT REFERENCES
    // ==========================================

    const elements = {
        tabs: section.querySelectorAll(".customers-subtab"),
        accountsView: document.getElementById("customersAccountsView"),
        deletionView: document.getElementById("customersDeletionView"),

        search: document.getElementById("customerSearch"),
        pageSize: document.getElementById("customerPageSize"),
        refresh: document.getElementById("refreshCustomers"),
        message: document.getElementById("customersMessage"),
        count: document.getElementById("customersCount"),
        updated: document.getElementById("customersUpdated"),
        tableBody: document.getElementById("customersTableBody"),
        pageInfo: document.getElementById("customersPageInfo"),
        previous: document.getElementById("customersPrevious"),
        next: document.getElementById("customersNext"),

        modal: document.getElementById("businessProfileModal"),
        profileTitle: document.getElementById("profileTitle"),
        profileSubtitle: document.getElementById("profileSubtitle"),
        profileBody: document.getElementById("businessProfileBody"),
        profileCloseTop: document.getElementById("profileCloseTop"),
        profileCloseBottom: document.getElementById("profileCloseBottom")
    };

    const state = {
        page: 1,
        limit: 10,
        search: "",
        totalPages: 0,
        total: 0,
        loading: false,
        actionInProgress: false,
        searchTimer: null,
        activeView: "accounts",
        lastFocusedElement: null,
        businessById: new Map(),
        permissions: {
            canSuspend: false,
            canRestore: false
        }
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
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return new Intl.DateTimeFormat("en-KE", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }).format(date);
    }

    function showMessage(message, type = "info") {
        elements.message.textContent = message;

        elements.message.className =
            type === "error"
                ? "customers-message error"
                : "customers-message";

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

    // ==========================================
    // BUSINESS TABLE CELLS
    // ==========================================

    function makeBusinessCell(business) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "customer-primary",
                business.business_name || "Unnamed business"
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "customer-secondary",
                `${business.business_type || "Business type not provided"} · ID ${business.id}`
            )
        );

        return wrapper;
    }

    function makeOwnerCell(business) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "customer-primary",
                business.owner_name || "Owner not available"
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "customer-secondary",
                displayValue(business.owner_email)
            )
        );

        return wrapper;
    }

    function makeContactCell(business) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "customer-primary",
                displayValue(business.phone)
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "customer-secondary",
                displayValue(business.email)
            )
        );

        return wrapper;
    }

    function makeSubscriptionCell(business) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "customer-primary",
                business.subscription_plan || "No plan recorded"
            )
        );

        const statusText =
            business.subscription_status || "Not available";

        const normalizedStatus = String(statusText)
            .toLowerCase()
            .trim();

        const badge = createElement(
            "span",
            "customer-status",
            statusText
        );

        const allowedClasses = [
            "active",
            "trial",
            "pending",
            "expired",
            "cancelled"
        ];

        if (allowedClasses.includes(normalizedStatus)) {
            badge.classList.add(normalizedStatus);
        }

        const badgeWrapper = createElement(
            "div",
            "customer-secondary"
        );

        badgeWrapper.appendChild(badge);
        wrapper.appendChild(badgeWrapper);

        if (
            normalizedStatus === "trial" &&
            business.trial_ends_at
        ) {
            wrapper.appendChild(
                createElement(
                    "div",
                    "customer-secondary",
                    `Trial ends: ${formatDate(business.trial_ends_at)}`
                )
            );
        }

        return wrapper;
    }

    function makeAccountStatusCell(business) {
        const statusText =
            business.account_status || "active";

        const normalizedStatus =
            String(statusText).toLowerCase();

        const wrapper = document.createElement("div");

        const badge = createElement(
            "span",
            "customer-status",
            normalizedStatus
        );

        if (
            normalizedStatus === "active" ||
            normalizedStatus === "suspended"
        ) {
            badge.classList.add(normalizedStatus);
        }

        wrapper.appendChild(badge);

        if (normalizedStatus === "suspended") {
            wrapper.appendChild(
                createElement(
                    "div",
                    "customer-secondary",
                    `Suspended: ${formatDate(business.suspended_at)}`
                )
            );
        }

        return wrapper;
    }

    function makeRegisteredCell(business) {
        const wrapper = document.createElement("div");

        wrapper.appendChild(
            createElement(
                "div",
                "customer-primary",
                formatDate(business.created_at)
            )
        );

        wrapper.appendChild(
            createElement(
                "div",
                "customer-secondary",
                business.country || "Country not provided"
            )
        );

        return wrapper;
    }

    function makeActionButton(label, action, businessId, className = "") {
        const button = createElement(
            "button",
            `customer-action-button ${className}`.trim(),
            label
        );

        button.type = "button";
        button.dataset.customerAction = action;
        button.dataset.businessId = String(businessId);

        return button;
    }

    function makeBusinessActions(business) {
        const wrapper = createElement(
            "div",
            "customer-action-buttons"
        );

        wrapper.appendChild(
            makeActionButton(
                "View Profile",
                "view",
                business.id
            )
        );

        const status =
            String(business.account_status || "active").toLowerCase();

        if (status === "active" && state.permissions.canSuspend) {
            wrapper.appendChild(
                makeActionButton(
                    "Suspend",
                    "suspend",
                    business.id,
                    "suspend"
                )
            );
        }

        if (status === "suspended" && state.permissions.canRestore) {
            wrapper.appendChild(
                makeActionButton(
                    "Restore",
                    "restore",
                    business.id,
                    "restore"
                )
            );
        }

        return wrapper;
    }

    // ==========================================
    // BUSINESS PROFILE
    // ==========================================

    function addProfileField(container, label, value) {
        const field = createElement("div", "profile-field");

        field.appendChild(createElement("span", "", label));
        field.appendChild(
            createElement("strong", "", displayValue(value))
        );

        container.appendChild(field);
    }

    function addProfileGroup(container, title, fields) {
        container.appendChild(
            createElement("h3", "profile-group-title", title)
        );

        const grid = createElement("div", "profile-grid");

        for (const [label, value] of fields) {
            addProfileField(grid, label, value);
        }

        container.appendChild(grid);
    }

    function openBusinessProfile(business) {
        if (!business) return;

        state.lastFocusedElement = document.activeElement;

        elements.profileTitle.textContent =
            business.business_name || "Business Profile";

        elements.profileSubtitle.textContent =
            `Business ID: ${business.id}`;

        elements.profileBody.replaceChildren();

        addProfileGroup(
            elements.profileBody,
            "Business Information",
            [
                ["Business Name", business.business_name],
                ["Business Type", business.business_type],
                ["Business ID", business.id],
                ["Registration Date", formatDate(business.created_at)],
                ["Country", business.country],
                ["Currency", business.currency],
                ["Account Status", business.account_status || "active"],
                ["Suspension Reason", business.suspension_reason],
                ["Suspended At", formatDate(business.suspended_at)]
            ]
        );

        addProfileGroup(
            elements.profileBody,
            "Owner Information",
            [
                ["Owner Name", business.owner_name],
                ["Owner Email", business.owner_email],
                ["Business Email", business.email],
                ["Business Phone", business.phone]
            ]
        );

        addProfileGroup(
            elements.profileBody,
            "Subscription Information",
            [
                ["Subscription Plan", business.subscription_plan],
                ["Subscription Status", business.subscription_status],
                ["Trial Started", formatDate(business.trial_started_at)],
                ["Trial Ends", formatDate(business.trial_ends_at)],
                ["Current Period Start", formatDate(business.current_period_start)],
                ["Current Period End", formatDate(business.current_period_end)]
            ]
        );

        elements.modal.hidden = false;
        elements.profileCloseTop.focus();
    }

    function closeBusinessProfile() {
        elements.modal.hidden = true;
        elements.profileBody.replaceChildren();

        if (
            state.lastFocusedElement &&
            typeof state.lastFocusedElement.focus === "function"
        ) {
            state.lastFocusedElement.focus();
        }
    }

    // ==========================================
    // RENDER BUSINESS LIST
    // ==========================================

    function renderBusinesses(businesses) {
        elements.tableBody.replaceChildren();
        state.businessById.clear();

        if (!businesses.length) {
            const row = document.createElement("tr");

            const cell = createElement(
                "td",
                "customers-empty",
                state.search
                    ? "No businesses match your search."
                    : "No registered businesses were found."
            );

            cell.colSpan = 7;
            row.appendChild(cell);
            elements.tableBody.appendChild(row);

            return;
        }

        const fragment = document.createDocumentFragment();

        for (const business of businesses) {
            state.businessById.set(
                String(business.id),
                business
            );

            const row = document.createElement("tr");

            row.appendChild(makeCell(makeBusinessCell(business)));
            row.appendChild(makeCell(makeOwnerCell(business)));
            row.appendChild(makeCell(makeContactCell(business)));
            row.appendChild(makeCell(makeSubscriptionCell(business)));
            row.appendChild(makeCell(makeAccountStatusCell(business)));
            row.appendChild(makeCell(makeRegisteredCell(business)));
            row.appendChild(makeCell(makeBusinessActions(business)));

            fragment.appendChild(row);
        }

        elements.tableBody.appendChild(fragment);
    }

    // ==========================================
    // PAGINATION
    // ==========================================

    function updatePagination(pagination) {
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
            `Showing ${start}–${end} of ${state.total} registered businesses`;

        elements.pageInfo.textContent =
            `Page ${state.page} of ${Math.max(state.totalPages, 1)}`;

        elements.previous.disabled =
            !pagination.hasPrevious || state.loading;

        elements.next.disabled =
            !pagination.hasNext || state.loading;
    }

    // ==========================================
    // LOAD BUSINESSES FROM ADMIN API
    // ==========================================

    async function loadBusinesses() {
        if (state.loading) return;

        state.loading = true;
        hideMessage();

        elements.refresh.disabled = true;
        elements.refresh.textContent = "Loading...";
        elements.previous.disabled = true;
        elements.next.disabled = true;
        elements.count.textContent = "Loading businesses...";

        const params = new URLSearchParams({
            page: String(state.page),
            limit: String(state.limit)
        });

        if (state.search) {
            params.set("search", state.search);
        }

        try {
            const response = await fetch(
                `/api/admin/customers?${params.toString()}`,
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
                    "You do not have permission to view customers."
                );
            }

            if (!response.ok || !result || !result.success) {
                throw new Error(
                    result?.message ||
                    "Could not retrieve registered businesses."
                );
            }

            if (
                !Array.isArray(result.businesses) ||
                !result.pagination
            ) {
                throw new Error(
                    "The server returned an invalid response."
                );
            }

            state.permissions = {
                canSuspend: result.permissions?.canSuspend === true,
                canRestore: result.permissions?.canRestore === true
            };

            renderBusinesses(result.businesses);
            updatePagination(result.pagination);

            elements.updated.textContent =
                `Updated ${formatTime(result.updatedAt)}`;

        } catch (error) {
            console.error("Customers dashboard error:", error);

            state.totalPages = 0;
            state.total = 0;

            elements.tableBody.replaceChildren();

            const row = document.createElement("tr");

            const cell = createElement(
                "td",
                "customers-empty",
                "The business list could not be loaded."
            );

            cell.colSpan = 7;
            row.appendChild(cell);
            elements.tableBody.appendChild(row);

            elements.count.textContent =
                "Business information is unavailable.";

            elements.pageInfo.textContent = "Page unavailable";

            elements.previous.disabled = true;
            elements.next.disabled = true;

            showMessage(
                error.message ||
                "Something went wrong while loading customers.",
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
    // SUSPEND OR RESTORE BUSINESS
    // ==========================================

    async function changeBusinessStatus(
        business,
        action,
        button
    ) {
        if (state.actionInProgress || state.loading) return;

        if (!business) return;

        const isSuspending = action === "suspend";

        const expectedStatus = isSuspending
            ? "active"
            : "suspended";

        if (business.account_status !== expectedStatus) {
            showMessage(
                "This business status has changed. Refresh the list before trying again.",
                "error"
            );

            await loadBusinesses();
            return;
        }

        const reasonPrompt = isSuspending
            ? "Enter the reason for suspending this business account:"
            : "Enter the reason for restoring this business account:";

        const reasonInput = window.prompt(reasonPrompt);

        if (reasonInput === null) return;

        const reason = reasonInput.trim();

        if (reason.length < 5 || reason.length > 500) {
            showMessage(
                "The reason must contain between 5 and 500 characters.",
                "error"
            );

            return;
        }

        const confirmationMessage = isSuspending
            ? `Suspend "${business.business_name}"?\n\nThe owner will lose access to WIN Business Suite. Existing business records will NOT be deleted. You can restore access later.`
            : `Restore "${business.business_name}"?\n\nThe business will regain access to WIN Business Suite.`;

        if (!window.confirm(confirmationMessage)) {
            return;
        }

        state.actionInProgress = true;

        if (button) {
            button.disabled = true;
            button.textContent = isSuspending
                ? "Suspending..."
                : "Restoring...";
        }

        hideMessage();

        try {
            const response = await fetch(
                `/api/admin/customers/${encodeURIComponent(business.id)}/${action}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ reason })
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
                    "The business account status could not be changed."
                );
            }

            await loadBusinesses();

            showMessage(
                result.message ||
                "Business account status updated successfully."
            );

        } catch (error) {
            console.error(
                "Business account status change failed:",
                error
            );

            showMessage(
                error.message ||
                "Could not update the business account status.",
                "error"
            );

            await loadBusinesses();

        } finally {
            state.actionInProgress = false;
        }
    }

    // ==========================================
    // CUSTOMER INTERNAL TABS
    // ==========================================

    function switchCustomersView(view) {
        if (!["accounts", "deletion"].includes(view)) return;

        state.activeView = view;

        elements.accountsView.classList.toggle(
            "active",
            view === "accounts"
        );

        elements.deletionView.classList.toggle(
            "active",
            view === "deletion"
        );

        elements.tabs.forEach(tab => {
            const active =
                tab.dataset.customersView === view;

            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });

        if (view === "accounts") {
            loadBusinesses();
        }
    }

    elements.tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            switchCustomersView(tab.dataset.customersView);
        });
    });

    // ==========================================
    // SEARCH AND PAGE CONTROLS
    // ==========================================

    elements.search.addEventListener("input", () => {
        clearTimeout(state.searchTimer);

        state.searchTimer = setTimeout(() => {
            state.search = elements.search.value.trim();
            state.page = 1;

            loadBusinesses();
        }, 350);
    });

    elements.pageSize.addEventListener("change", () => {
        state.limit = Number(elements.pageSize.value);
        state.page = 1;

        loadBusinesses();
    });

    elements.refresh.addEventListener("click", () => {
        loadBusinesses();
    });

    elements.previous.addEventListener("click", () => {
        if (state.page > 1 && !state.loading) {
            state.page -= 1;
            loadBusinesses();
        }
    });

    elements.next.addEventListener("click", () => {
        if (
            state.page < state.totalPages &&
            !state.loading
        ) {
            state.page += 1;
            loadBusinesses();
        }
    });

    // ==========================================
    // BUSINESS TABLE ACTIONS
    // ==========================================

    elements.tableBody.addEventListener("click", event => {
        const button = event.target.closest(
            "[data-customer-action]"
        );

        if (!button) return;

        const business = state.businessById.get(
            button.dataset.businessId
        );

        if (!business) {
            showMessage(
                "Business information is no longer available. Refresh and try again.",
                "error"
            );

            return;
        }

        const action = button.dataset.customerAction;

        if (action === "view") {
            openBusinessProfile(business);
            return;
        }

        if (action === "suspend" || action === "restore") {
            changeBusinessStatus(business, action, button);
        }
    });

    // ==========================================
    // PROFILE MODAL CONTROLS
    // ==========================================

    elements.profileCloseTop.addEventListener(
        "click",
        closeBusinessProfile
    );

    elements.profileCloseBottom.addEventListener(
        "click",
        closeBusinessProfile
    );

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeBusinessProfile();
        }
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            !elements.modal.hidden
        ) {
            closeBusinessProfile();
        }
    });

    // ==========================================
    // INITIAL LOAD
    // ==========================================

    loadBusinesses();

    document.addEventListener("visibilitychange", () => {
        if (
            document.visibilityState === "visible" &&
            section.classList.contains("active") &&
            state.activeView === "accounts"
        ) {
            loadBusinesses();
        }
    });

})();
