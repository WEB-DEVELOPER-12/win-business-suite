
"use strict";

(() => {
    const API = "/api/admin/notifications";

    const state = {
        campaigns: [],
        page: 1,
        limit: 10,
        totalPages: 1,
        canManage: false,
        businessTypes: [],
        editingId: null
    };

    const section = document.getElementById("section-notifications");
    if (!section) return;

    const escapeHtml = value => String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]
    );

    function localDateTime(value) {
        if (!value) return "";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";

        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset)
            .toISOString()
            .slice(0, 16);
    }

    function displayDate(value) {
        if (!value) return "—";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString();
    }

    async function request(path = "", options = {}) {
        const response = await fetch(`${API}${path}`, {
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

        if (response.status === 401) {
            window.location.replace("/admin/login.html");
            throw new Error("Administrator session expired.");
        }

        if (!response.ok || !result || !result.success) {
            throw new Error(
                result?.message || "The request could not be completed."
            );
        }

        return result;
    }

    function showMessage(message, type = "success") {
        const box = document.getElementById("notificationMessage");
        if (!box) return;

        box.textContent = message;
        box.className = `notification-message ${type}`;
        box.hidden = false;

        box.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    function setLoading(button, loading, originalText) {
        if (!button) return;

        button.disabled = loading;
        button.textContent = loading ? "Please wait..." : originalText;
    }

    function categoryLabel(category) {
        const labels = {
            maintenance: "Maintenance",
            announcements: "Announcements",
            welcome: "Welcome",
            subscription: "Subscription",
            general: "General"
        };

        return labels[category] || category || "General";
    }

    function statusClass(status) {
        const allowed = [
            "draft",
            "scheduled",
            "published",
            "cancelled",
            "archived"
        ];

        return allowed.includes(status) ? status : "draft";
    }

    function renderShell() {
        section.innerHTML = `
            <div class="notification-page">

                <div class="notification-heading">
                    <div>
                        <span class="notification-eyebrow">
                            WIN BUSINESS SUITE / ADMINISTRATION
                        </span>
                        <h2>Notifications Centre</h2>
                        <p>
                            Communicate important updates to your customers.
                        </p>
                    </div>
                    <div class="notification-heading-mark">WIN</div>
                </div>

                <div id="notificationMessage"
                     class="notification-message"
                     role="status"
                     hidden></div>

                <div class="notification-stats" id="notificationStats">
                    <article class="notification-stat">
                        <span>Total notifications</span>
                        <strong id="statTotal">—</strong>
                        <small>Customer inbox</small>
                    </article>

                    <article class="notification-stat">
                        <span>Unread notifications</span>
                        <strong id="statUnread">—</strong>
                        <small>Awaiting customer attention</small>
                    </article>

                    <article class="notification-stat">
                        <span>Draft campaigns</span>
                        <strong id="statDrafts">—</strong>
                        <small>Not yet published</small>
                    </article>

                    <article class="notification-stat">
                        <span>Scheduled campaigns</span>
                        <strong id="statScheduled">—</strong>
                        <small>Waiting for publication</small>
                    </article>
                </div>

                <div class="notification-toolbar">
                    <div>
                        <h3>Campaigns</h3>
                        <p>
                            View and manage notification campaigns.
                        </p>
                    </div>

                    <button type="button"
                            class="notification-button primary"
                            id="newNotificationButton">
                        + Create notification
                    </button>
                </div>

                <div class="notification-card">
                    <div class="notification-table-wrap">
                        <table class="notification-table">
                            <thead>
                                <tr>
                                    <th>Notification</th>
                                    <th>Category</th>
                                    <th>Audience</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody id="campaignRows">
                                <tr>
                                    <td colspan="6">Loading campaigns...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="notification-pagination">
                        <span id="campaignPageInfo">Page 1</span>

                        <div>
                            <button type="button"
                                    class="notification-button secondary"
                                    id="previousPage">
                                Previous
                            </button>

                            <button type="button"
                                    class="notification-button secondary"
                                    id="nextPage">
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                <div class="notification-form-card"
                     id="notificationFormCard"
                     hidden>

                    <div class="notification-toolbar form-toolbar">
                        <div>
                            <span class="notification-eyebrow">
                                MESSAGE COMPOSER
                            </span>
                            <h3 id="notificationFormTitle">
                                Create notification
                            </h3>
                            <p>
                                Write a clear message for your selected audience.
                            </p>
                        </div>

                        <button type="button"
                                class="notification-button secondary"
                                id="closeNotificationForm">
                            Close
                        </button>
                    </div>

                    <form id="notificationForm">
                        <div class="notification-form-grid">

                            <label>
                                Category
                                <select id="notificationCategory" required>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="announcements">Announcements</option>
                                    <option value="welcome">Welcome</option>
                                    <option value="subscription">Subscription</option>
                                    <option value="general">General</option>
                                </select>
                            </label>

                            <label>
                                Audience
                                <select id="notificationAudience" required>
                                    <option value="all">All customers</option>
                                    <option value="trial">Customers on trial</option>
                                    <option value="active">Active subscriptions</option>
                                    <option value="pending">Pending subscriptions</option>
                                    <option value="business_type">Business type</option>
                                    <option value="selected_users">Selected user IDs</option>
                                </select>
                            </label>

                            <label class="full-width"
                                   id="businessTypeField"
                                   hidden>
                                Business type
                                <select id="notificationBusinessType">
                                    <option value="">Choose business type</option>
                                </select>
                            </label>

                            <label class="full-width"
                                   id="selectedUsersField"
                                   hidden>
                                Selected user IDs

                                <input
                                    type="text"
                                    id="notificationSelectedUsers"
                                    placeholder="Example: 1, 2, 3"
                                >

                                <small>
                                    Enter valid WIN user account IDs separated by commas.
                                </small>
                            </label>

                            <label class="full-width">
                                Notification title

                                <input
                                    type="text"
                                    id="notificationTitle"
                                    minlength="3"
                                    maxlength="100"
                                    required
                                    placeholder="Enter a clear title"
                                >
                            </label>

                            <label class="full-width">
                                Message

                                <textarea
                                    id="notificationBody"
                                    minlength="5"
                                    maxlength="2000"
                                    rows="7"
                                    required
                                    placeholder="Write your notification message..."
                                ></textarea>

                                <small>
                                    Maximum 2,000 characters.
                                </small>
                            </label>

                            <label>
                                Expiry date and time (optional)

                                <input
                                    type="datetime-local"
                                    id="notificationExpiry"
                                >
                            </label>

                            <label class="notification-checkbox">
                                <input
                                    type="checkbox"
                                    id="notificationPermanent"
                                >
                                Keep this notification permanently
                            </label>

                            <label class="full-width" id="scheduleField">
                                Schedule publication date and time

                                <input
                                    type="datetime-local"
                                    id="notificationPublishAt"
                                >

                                <small>
                                    Leave this empty when saving a draft.
                                </small>
                            </label>

                        </div>

                        <div class="notification-form-actions">
                            <button type="button"
                                    class="notification-button secondary"
                                    id="previewNotification">
                                Preview audience
                            </button>

                            <button type="submit"
                                    class="notification-button secondary"
                                    id="saveNotificationDraft">
                                Save draft
                            </button>

                            <button type="button"
                                    class="notification-button primary"
                                    id="scheduleNotification">
                                Schedule notification
                            </button>
                        </div>
                    </form>

                    <div id="notificationPreview"
                         class="notification-preview"
                         hidden>

                        <span class="notification-eyebrow">
                            CUSTOMER MESSAGE PREVIEW
                        </span>

                        <h4 id="previewTitle"></h4>

                        <div class="preview-category">
                            <span id="previewCategory"></span>
                        </div>

                        <div id="previewBody" class="preview-body"></div>

                        <div class="preview-recipients">
                            Estimated recipients:
                            <strong id="previewRecipients">—</strong>
                        </div>

                        <p class="preview-warning">
                            Preview only. No customer notification has been sent.
                        </p>
                    </div>
                </div>

            </div>
        `;

        addStyles();
        bindEvents();
        updateAudienceFields();
        loadAll();
    }

    function addStyles() {
        if (document.getElementById("adminNotificationStyles")) return;

        const style = document.createElement("style");
        style.id = "adminNotificationStyles";

        style.textContent = `
            .notification-page {
                color: #eaf2ff;
                padding: 4px 0 30px;
            }

            .notification-page * {
                box-sizing: border-box;
            }

            .notification-heading {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 20px;
                padding: 26px;
                border: 1px solid #203b5b;
                border-radius: 15px;
                background: linear-gradient(120deg, #071426, #102b49);
            }

            .notification-eyebrow {
                display: block;
                color: #55c8ff;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 1.5px;
            }

            .notification-heading h2 {
                margin: 10px 0 7px;
                color: #ffffff;
                font-size: clamp(22px, 3vw, 30px);
                font-weight: 850;
            }

            .notification-heading p {
                margin: 0;
                color: #a9bfd6;
                font-size: 12px;
                line-height: 1.6;
            }

            .notification-heading-mark {
                display: grid;
                place-items: center;
                width: 66px;
                height: 66px;
                flex-shrink: 0;
                border: 1px solid #287bb1;
                border-radius: 14px;
                background: #0b3556;
                color: #62d2ff;
                font-size: 20px;
                font-weight: 900;
                letter-spacing: 1px;
            }

            .notification-message {
                margin: 15px 0;
                padding: 13px 16px;
                border-radius: 9px;
                font-size: 12px;
                line-height: 1.6;
            }

            .notification-message.success {
                background: #103d37;
                color: #91f2d1;
                border: 1px solid #1c6557;
            }

            .notification-message.error {
                background: #451f2b;
                color: #ffc0c9;
                border: 1px solid #813c4b;
            }

            .notification-stats {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 13px;
                margin: 18px 0 25px;
            }

            .notification-stat,
            .notification-card,
            .notification-form-card {
                border: 1px solid #203b5b;
                border-radius: 13px;
                background: #0b1b30;
            }

            .notification-stat {
                min-width: 0;
                padding: 18px;
            }

            .notification-stat span {
                display: block;
                color: #a8bdd2;
                font-size: 11px;
                font-weight: 650;
            }

            .notification-stat strong {
                display: block;
                margin-top: 12px;
                color: #ffffff;
                font-size: 27px;
                font-weight: 850;
            }

            .notification-stat small {
                display: block;
                margin-top: 7px;
                color: #718ba7;
                font-size: 10px;
            }

            .notification-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 15px;
                margin: 25px 0 14px;
            }

            .notification-toolbar h3 {
                margin: 7px 0 0;
                color: #ffffff;
                font-size: 17px;
                font-weight: 800;
            }

            .notification-toolbar p {
                margin: 6px 0 0;
                color: #9bb0c7;
                font-size: 11px;
                line-height: 1.6;
            }

            .notification-button {
                min-height: 39px;
                padding: 10px 15px;
                border: 1px solid transparent;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
                transition: background .15s ease, border-color .15s ease;
            }

            .notification-button:disabled {
                opacity: .5;
                cursor: not-allowed;
            }

            .notification-button.primary {
                background: #087cf0;
                color: #ffffff;
            }

            .notification-button.primary:hover:not(:disabled) {
                background: #1594ff;
            }

            .notification-button.secondary {
                background: #142b45;
                border-color: #294563;
                color: #d8eaff;
            }

            .notification-button.secondary:hover:not(:disabled) {
                background: #1b3b5e;
            }

            .notification-button.danger {
                background: #451f2b;
                color: #ffc0c9;
            }

            .notification-table-wrap {
                overflow-x: auto;
            }

            .notification-table {
                width: 100%;
                border-collapse: collapse;
                min-width: 780px;
            }

            .notification-table th,
            .notification-table td {
                padding: 15px 13px;
                border-bottom: 1px solid #1d344d;
                text-align: left;
                font-size: 11px;
                vertical-align: middle;
            }

            .notification-table th {
                background: #10243b;
                color: #8fa9c4;
                font-size: 10px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: .7px;
            }

            .notification-table td {
                color: #c5d6e9;
            }

            .notification-table tbody tr:hover {
                background: #10243b;
            }

            .campaign-title {
                display: block;
                max-width: 220px;
                color: #ffffff;
                font-weight: 800;
                overflow-wrap: anywhere;
            }

            .campaign-id {
                display: block;
                margin-top: 5px;
                color: #7893af;
                font-size: 9px;
            }

            .notification-status {
                display: inline-block;
                padding: 6px 9px;
                border-radius: 6px;
                font-size: 9px;
                font-weight: 850;
                text-transform: capitalize;
            }

            .notification-status.draft {
                background: #20354c;
                color: #c4d8ee;
            }

            .notification-status.scheduled {
                background: #493719;
                color: #ffd48b;
            }

            .notification-status.published {
                background: #123e36;
                color: #8ef0ca;
            }

            .notification-status.cancelled,
            .notification-status.archived {
                background: #48232e;
                color: #ffb7c3;
            }

            .campaign-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .campaign-actions button {
                min-height: 30px;
                padding: 6px 9px;
                border: 1px solid #294563;
                border-radius: 6px;
                background: #142b45;
                color: #d8eaff;
                font-size: 9px;
                font-weight: 800;
                cursor: pointer;
            }

            .campaign-actions button:hover {
                background: #1b3b5e;
            }

            .campaign-actions button.publish {
                border-color: #1b6555;
                background: #123e36;
                color: #8ef0ca;
            }

            .campaign-actions button.cancel {
                border-color: #75404b;
                background: #48232e;
                color: #ffb7c3;
            }

            .notification-pagination {
                padding: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                color: #91a9c1;
                font-size: 11px;
            }

            .notification-pagination > div {
                display: flex;
                gap: 7px;
            }

            .notification-form-card {
                margin-top: 24px;
                padding: 22px;
            }

            .form-toolbar {
                margin-top: 0;
                margin-bottom: 22px;
            }

            .notification-form-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 18px;
            }

            .notification-form-grid label {
                display: flex;
                flex-direction: column;
                gap: 8px;
                color: #dceaff;
                font-size: 11px;
                font-weight: 800;
            }

            .notification-form-grid .full-width {
                grid-column: 1 / -1;
            }

            .notification-form-grid input,
            .notification-form-grid select,
            .notification-form-grid textarea {
                width: 100%;
                min-height: 42px;
                padding: 11px 12px;
                border: 1px solid #294563;
                border-radius: 8px;
                outline: none;
                background: #071426;
                color: #f0f6ff;
                font: inherit;
                font-size: 12px;
            }

            .notification-form-grid input:focus,
            .notification-form-grid select:focus,
            .notification-form-grid textarea:focus {
                border-color: #28aaff;
                box-shadow: 0 0 0 2px rgba(40, 170, 255, .14);
            }

            .notification-form-grid input::placeholder,
            .notification-form-grid textarea::placeholder {
                color: #718ba7;
            }

            .notification-form-grid textarea {
                min-height: 150px;
                resize: vertical;
                line-height: 1.7;
            }

            .notification-form-grid select option {
                background: #071426;
                color: #ffffff;
            }

            .notification-form-grid small {
                color: #829bb5;
                font-size: 10px;
                font-weight: 400;
                line-height: 1.5;
            }

            .notification-checkbox {
                flex-direction: row !important;
                align-items: center;
                align-self: end;
                min-height: 42px;
            }

            .notification-checkbox input {
                width: 17px;
                min-height: 17px;
                accent-color: #087cf0;
            }

            .notification-form-actions {
                margin-top: 22px;
                padding-top: 18px;
                border-top: 1px solid #203b5b;
                display: flex;
                flex-wrap: wrap;
                gap: 9px;
            }

            .notification-preview {
                margin-top: 22px;
                padding: 20px;
                border: 1px solid #28618b;
                border-radius: 11px;
                background: #102b49;
                color: #dceaff;
                font-size: 12px;
                line-height: 1.8;
            }

            .notification-preview h4 {
                margin: 12px 0;
                color: #ffffff;
                font-size: 20px;
                font-weight: 850;
                overflow-wrap: anywhere;
            }

            .preview-category {
                display: inline-block;
                margin-bottom: 12px;
                padding: 5px 9px;
                border-radius: 5px;
                background: #164b72;
                color: #8cdbff;
                font-size: 10px;
                font-weight: 800;
            }

            .preview-body {
                padding: 13px 0;
                color: #c4d8ec;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }

            .preview-recipients {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #294563;
                color: #9db8d2;
            }

            .preview-recipients strong {
                color: #ffffff;
            }

            .preview-warning {
                margin: 12px 0 0;
                color: #8ef0ca;
                font-size: 10px;
                font-weight: 750;
            }

            @media (max-width: 850px) {
                .notification-stats {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }

            @media (max-width: 560px) {
                .notification-heading {
                    padding: 19px;
                }

                .notification-heading-mark {
                    width: 49px;
                    height: 49px;
                    font-size: 15px;
                }

                .notification-stats {
                    gap: 9px;
                }

                .notification-stat {
                    padding: 13px;
                }

                .notification-stat strong {
                    font-size: 23px;
                }

                .notification-form-grid {
                    grid-template-columns: 1fr;
                }

                .notification-form-grid .full-width {
                    grid-column: auto;
                }

                .notification-toolbar {
                    align-items: flex-start;
                    flex-direction: column;
                }

                .notification-form-card {
                    padding: 15px;
                }

                .notification-pagination {
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function bindEvents() {
        document.getElementById("newNotificationButton")
            .addEventListener("click", () => openForm());

        document.getElementById("closeNotificationForm")
            .addEventListener("click", closeForm);

        document.getElementById("notificationAudience")
            .addEventListener("change", updateAudienceFields);

        document.getElementById("notificationPermanent")
            .addEventListener("change", event => {
                document.getElementById("notificationExpiry").disabled =
                    event.target.checked;
            });

        document.getElementById("previewNotification")
            .addEventListener("click", previewCampaign);

        document.getElementById("notificationForm")
            .addEventListener("submit", event => {
                event.preventDefault();
                saveCampaign("draft");
            });

        document.getElementById("scheduleNotification")
            .addEventListener("click", () => saveCampaign("scheduled"));

        document.getElementById("previousPage")
            .addEventListener("click", () => {
                if (state.page > 1) {
                    state.page--;
                    loadCampaigns();
                }
            });

        document.getElementById("nextPage")
            .addEventListener("click", () => {
                if (state.page < state.totalPages) {
                    state.page++;
                    loadCampaigns();
                }
            });

        document.getElementById("campaignRows")
            .addEventListener("click", handleCampaignAction);
    }

    function updateAudienceFields() {
        const audience = document.getElementById("notificationAudience").value;

        document.getElementById("businessTypeField").hidden =
            audience !== "business_type";

        document.getElementById("selectedUsersField").hidden =
            audience !== "selected_users";
    }

    function openForm(campaign = null) {
        if (!state.canManage) {
            showMessage(
                "Your administrator role does not have permission to manage notifications.",
                "error"
            );
            return;
        }

        state.editingId = campaign?.id || null;

        const form = document.getElementById("notificationForm");
        form.reset();

        document.getElementById("notificationFormCard").hidden = false;
        document.getElementById("notificationPreview").hidden = true;

        document.getElementById("notificationFormTitle").textContent =
            campaign ? "Edit notification draft" : "Create notification";

        document.getElementById("scheduleNotification").hidden =
            Boolean(campaign);

        document.getElementById("notificationPublishAt").value = "";

        if (campaign) {
            document.getElementById("notificationCategory").value =
                campaign.display_category || "general";

            document.getElementById("notificationAudience").value =
                campaign.audience_type || "all";

            document.getElementById("notificationTitle").value =
                campaign.title || "";

            document.getElementById("notificationBody").value =
                campaign.message || "";

            document.getElementById("notificationPermanent").checked =
                Number(campaign.is_permanent) === 1;

            document.getElementById("notificationExpiry").value =
                localDateTime(campaign.expires_at);

            if (campaign.audience_type === "business_type") {
                document.getElementById("notificationBusinessType").value =
                    campaign.audience_value || "";
            }

            if (campaign.audience_type === "selected_users") {
                try {
                    const ids = JSON.parse(campaign.audience_value || "[]");
                    document.getElementById("notificationSelectedUsers").value =
                        ids.join(", ");
                } catch {
                    document.getElementById("notificationSelectedUsers").value = "";
                }
            }
        }

        document.getElementById("notificationExpiry").disabled =
            document.getElementById("notificationPermanent").checked;

        updateAudienceFields();

        document.getElementById("notificationFormCard").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function closeForm() {
        document.getElementById("notificationFormCard").hidden = true;
        document.getElementById("notificationPreview").hidden = true;
        state.editingId = null;
    }

    function getFormData() {
        const audienceType =
            document.getElementById("notificationAudience").value;

        const body = {
            category: document.getElementById("notificationCategory").value,
            audienceType,
            title: document.getElementById("notificationTitle").value.trim(),
            message: document.getElementById("notificationBody").value.trim(),
            isPermanent:
                document.getElementById("notificationPermanent").checked,
            expiresAt: null
        };

        const expiry =
            document.getElementById("notificationExpiry").value;

        if (expiry && !body.isPermanent) {
            body.expiresAt = new Date(expiry).toISOString();
        }

        if (audienceType === "business_type") {
            body.audienceValue =
                document.getElementById("notificationBusinessType").value;
        }

        if (audienceType === "selected_users") {
            const raw = document.getElementById(
                "notificationSelectedUsers"
            ).value;

            body.selectedUserIds = raw
                .split(",")
                .map(value => value.trim())
                .filter(Boolean)
                .map(Number);
        }

        return body;
    }

    async function previewCampaign() {
        const button = document.getElementById("previewNotification");
        setLoading(button, true, "Preview audience");

        try {
            const result = await request("/preview", {
                method: "POST",
                body: JSON.stringify(getFormData())
            });

            document.getElementById("previewTitle").textContent =
                result.preview.title;

            document.getElementById("previewCategory").textContent =
                categoryLabel(result.preview.category);

            document.getElementById("previewBody").textContent =
                result.preview.message;

            document.getElementById("previewRecipients").textContent =
                Number(result.preview.recipients).toLocaleString();

            document.getElementById("notificationPreview").hidden = false;

            showMessage(
                "Preview generated. No customer notifications were sent."
            );

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            setLoading(button, false, "Preview audience");
        }
    }

    async function saveCampaign(status) {
        const form = document.getElementById("notificationForm");

        if (!form.reportValidity()) return;

        const button = status === "scheduled"
            ? document.getElementById("scheduleNotification")
            : document.getElementById("saveNotificationDraft");

        const originalText = status === "scheduled"
            ? "Schedule notification"
            : state.editingId ? "Save changes" : "Save draft";

        if (status === "scheduled" && state.editingId) return;

        const body = getFormData();

        if (status === "scheduled") {
            const publishAt =
                document.getElementById("notificationPublishAt").value;

            if (!publishAt) {
                showMessage(
                    "Choose the date and time when the notification should be published.",
                    "error"
                );
                return;
            }

            const date = new Date(publishAt);

            if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
                showMessage(
                    "Choose a future publication date and time.",
                    "error"
                );
                return;
            }

            body.publishAt = date.toISOString();
        }

        setLoading(button, true, originalText);

        try {
            const path = state.editingId
                ? `/${state.editingId}`
                : "";

            const method = state.editingId ? "PATCH" : "POST";

            if (!state.editingId) {
                body.status = status;
            }

            const result = await request(path, {
                method,
                body: JSON.stringify(body)
            });

            showMessage(result.message || "Notification saved.");

            closeForm();
            await loadAll();

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            setLoading(button, false, originalText);
        }
    }

    async function loadStats() {
        const result = await request("/stats");

        document.getElementById("statTotal").textContent =
            Number(result.notifications.total).toLocaleString();

        document.getElementById("statUnread").textContent =
            Number(result.notifications.unread).toLocaleString();

        document.getElementById("statDrafts").textContent =
            Number(result.campaigns.drafts).toLocaleString();

        document.getElementById("statScheduled").textContent =
            Number(result.campaigns.scheduled).toLocaleString();
    }

    async function loadAudiences() {
        const result = await request("/audiences");

        state.businessTypes = result.businessTypes || [];

        const select = document.getElementById("notificationBusinessType");

        select.innerHTML =
            '<option value="">Choose business type</option>' +
            state.businessTypes.map(type =>
                `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
            ).join("");
    }

    async function loadCampaigns() {
        const rows = document.getElementById("campaignRows");

        rows.innerHTML = `
            <tr><td colspan="6">Loading campaigns...</td></tr>
        `;

        try {
            const result = await request(
                `?page=${state.page}&limit=${state.limit}`
            );

            state.campaigns = result.campaigns || [];
            state.totalPages = Math.max(
                1,
                result.pagination?.totalPages || 1
            );

            state.canManage = Boolean(result.permissions?.canManage);

            document.getElementById("newNotificationButton").hidden =
                !state.canManage;

            renderCampaigns();

        } catch (error) {
            rows.innerHTML = `
                <tr>
                    <td colspan="6">${escapeHtml(error.message)}</td>
                </tr>
            `;
        }
    }

    function renderCampaigns() {
        const rows = document.getElementById("campaignRows");

        if (!state.campaigns.length) {
            rows.innerHTML = `
                <tr>
                    <td colspan="6">
                        No notification campaigns found. Create your first draft when ready.
                    </td>
                </tr>
            `;
        } else {
            rows.innerHTML = state.campaigns.map(campaign => {
                const status = statusClass(campaign.status);
                const actions = [];

                actions.push(`
                    <button type="button"
                            data-action="view"
                            data-id="${campaign.id}">
                        View
                    </button>
                `);

                if (state.canManage && status === "draft") {
                    actions.push(`
                        <button type="button"
                                data-action="edit"
                                data-id="${campaign.id}">
                            Edit
                        </button>

                        <button type="button"
                                class="publish"
                                data-action="publish"
                                data-id="${campaign.id}">
                            Publish
                        </button>
                    `);
                }

                if (state.canManage && status === "scheduled") {
                    actions.push(`
                        <button type="button"
                                class="cancel"
                                data-action="cancel"
                                data-id="${campaign.id}">
                            Cancel
                        </button>
                    `);
                }

                return `
                    <tr>
                        <td>
                            <span class="campaign-title">
                                ${escapeHtml(campaign.title)}
                            </span>

                            <span class="campaign-id">
                                Campaign #${campaign.id}
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(categoryLabel(campaign.display_category))}
                        </td>

                        <td>${escapeHtml(campaign.audience_type)}</td>

                        <td>
                            <span class="notification-status ${status}">
                                ${escapeHtml(status)}
                            </span>
                        </td>

                        <td>${escapeHtml(displayDate(campaign.created_at))}</td>

                        <td>
                            <div class="campaign-actions">
                                ${actions.join("")}
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        document.getElementById("campaignPageInfo").textContent =
            `Page ${state.page} of ${state.totalPages}`;

        document.getElementById("previousPage").disabled =
            state.page <= 1;

        document.getElementById("nextPage").disabled =
            state.page >= state.totalPages;
    }

    async function handleCampaignAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (!id) return;

        button.disabled = true;

        try {
            if (action === "view") {
                const result = await request(`/${id}`);
                const campaign = result.campaign;

                window.alert(
                    `Title: ${campaign.title}\n\n` +
                    `Category: ${categoryLabel(campaign.display_category)}\n\n` +
                    `Status: ${campaign.status}\n\n` +
                    `Audience: ${campaign.audience_type}\n\n` +
                    `Message:\n${campaign.message}`
                );
            }

            if (action === "edit") {
                const result = await request(`/${id}`);
                openForm(result.campaign);
            }

            if (action === "publish") {
                const confirmed = window.confirm(
                    "Publish this notification now?\n\n" +
                    "It will be delivered to customers matching its saved audience. " +
                    "This action cannot be undone."
                );

                if (!confirmed) return;

                const result = await request(`/${id}/publish`, {
                    method: "POST"
                });

                showMessage(
                    `${result.message} Notifications created: ${result.recipientsCreated}.`
                );

                await loadAll();
            }

            if (action === "cancel") {
                const confirmed = window.confirm(
                    "Cancel this scheduled notification?"
                );

                if (!confirmed) return;

                const result = await request(`/${id}/cancel`, {
                    method: "POST"
                });

                showMessage(result.message);
                await loadAll();
            }

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            button.disabled = false;
        }
    }

    async function loadAll() {
        try {
            await Promise.all([
                loadStats(),
                loadAudiences(),
                loadCampaigns()
            ]);
        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    let initialized = false;

    function initialize() {
        if (initialized) return;

        initialized = true;
        renderShell();
    }

    document.querySelectorAll('.nav-item[data-section="notifications"]')
        .forEach(button => {
            button.addEventListener("click", initialize);
        });

    if (section.classList.contains("active")) {
        initialize();
    }
})();
