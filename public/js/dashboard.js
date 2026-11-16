
const userName = document.getElementById("userName");
const businessName = document.getElementById("businessName");
const logoutButton = document.getElementById("logoutButton");

let countdownInterval = null;
let trialEndTime = null;
let currentUserId = "default";

const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

function addTrialReminderStyles() {
    if (document.getElementById("winTrialReminderStyles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "winTrialReminderStyles";

    style.textContent = `
        #subscriptionCard {
            display: none !important;
        }

        #winTrialReminder {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            flex-wrap: wrap;
            margin: 22px 0;
            padding: 17px 20px;
            border: 1px solid rgba(0, 190, 220, 0.28);
            border-radius: 14px;
            background: linear-gradient(
                110deg,
                rgba(0, 190, 220, 0.12),
                rgba(0, 120, 180, 0.07)
            );
            color: inherit;
        }

        #winTrialReminder .trial-reminder-info {
            min-width: 190px;
            flex: 1;
        }

        #winTrialReminder .trial-reminder-label {
            margin: 0 0 5px;
            color: #00bcd4;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.2px;
        }

        #winTrialReminder .trial-reminder-title {
            margin: 0 0 7px;
            font-size: 15px;
            font-weight: 750;
        }

        #winTrialReminder .trial-reminder-countdown {
            margin: 0;
            color: #00bcd4;
            font-size: clamp(17px, 2.5vw, 23px);
            font-weight: 800;
            font-variant-numeric: tabular-nums;
            letter-spacing: 1px;
        }

        #winTrialReminder .trial-reminder-units {
            display: flex;
            gap: 12px;
            margin-top: 4px;
            color: #8494a7;
            font-size: 10px;
        }

        #winTrialReminder .trial-reminder-actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        #winTrialReminder .trial-upgrade-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 15px;
            border-radius: 8px;
            background: #00bcd4;
            color: #061522;
            font-size: 12px;
            font-weight: 800;
            text-decoration: none;
            white-space: nowrap;
        }

        #winTrialReminder .trial-dismiss {
            width: 32px;
            height: 32px;
            border: 1px solid rgba(130, 150, 170, 0.3);
            border-radius: 8px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 18px;
        }

        #winTrialReminder .trial-dismiss:hover {
            background: rgba(130, 150, 170, 0.12);
        }

        @media (max-width: 600px) {
            #winTrialReminder {
                align-items: flex-start;
                padding: 15px;
            }

            #winTrialReminder .trial-reminder-actions {
                width: 100%;
                justify-content: space-between;
            }
        }
    `;

    document.head.appendChild(style);
}

function getReminderStorageKey() {
    return `winTrialReminderLastShown:${currentUserId}`;
}

function canShowTrialReminder() {
    try {
        const lastShown = Number(
            localStorage.getItem(getReminderStorageKey())
        ) || 0;

        return Date.now() - lastShown >= REMINDER_INTERVAL_MS;
    } catch (error) {
        console.warn("Trial reminder storage unavailable:", error);
        return true;
    }
}

function markTrialReminderShown() {
    try {
        localStorage.setItem(
            getReminderStorageKey(),
            String(Date.now())
        );
    } catch (error) {
        console.warn("Could not save trial reminder time:", error);
    }
}

function createTrialReminder() {
    const existingReminder = document.getElementById("winTrialReminder");

    if (existingReminder || !canShowTrialReminder()) {
        return;
    }

    const welcomeSection = document.querySelector(".command-welcome");

    if (!welcomeSection) {
        console.error("Dashboard welcome section was not found.");
        return;
    }

    const reminder = document.createElement("aside");
    reminder.id = "winTrialReminder";
    reminder.setAttribute("aria-label", "WIN Pro free trial reminder");

    reminder.innerHTML = `
        <div class="trial-reminder-info">
            <p class="trial-reminder-label">WIN PRO FREE TRIAL</p>
            <h3 class="trial-reminder-title" id="trialReminderTitle">
                Your free trial is active
            </h3>

            <p
                class="trial-reminder-countdown"
                id="trialReminderCountdown"
                aria-live="off"
            >
                Calculating...
            </p>

            <div class="trial-reminder-units">
                <span>Days</span>
                <span>Hours</span>
                <span>Minutes</span>
                <span>Seconds</span>
            </div>
        </div>

        <div class="trial-reminder-actions">
            <a href="/upgrade.html" class="trial-upgrade-link">
                Upgrade to WIN Pro
            </a>

            <button
                type="button"
                class="trial-dismiss"
                id="dismissTrialReminder"
                aria-label="Dismiss trial reminder"
                title="Dismiss"
            >
                &times;
            </button>
        </div>
    `;

    welcomeSection.insertAdjacentElement("afterend", reminder);

    markTrialReminderShown();

    document
        .getElementById("dismissTrialReminder")
        .addEventListener("click", () => {
            reminder.remove();
        });

    updateTrialReminderCountdown();
    countdownInterval = setInterval(updateTrialReminderCountdown, 1000);
}

function updateTrialReminderCountdown() {
    const countdownElement = document.getElementById(
        "trialReminderCountdown"
    );

    const titleElement = document.getElementById(
        "trialReminderTitle"
    );

    if (!countdownElement || !titleElement || !trialEndTime) {
        return;
    }

    const remainingMilliseconds = Math.max(
        0,
        trialEndTime - Date.now()
    );

    if (remainingMilliseconds <= 0) {
        titleElement.textContent = "Your WIN Pro trial has expired";
        countdownElement.textContent = "Trial expired";

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        return;
    }

    const totalSeconds = Math.floor(remainingMilliseconds / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = value => String(value).padStart(2, "0");

    countdownElement.textContent =
        `${pad(days)} : ${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`;
}

function parseUtcDate(dateValue) {
    if (!dateValue) {
        return null;
    }

    const normalizedDate = dateValue.includes("T")
        ? dateValue
        : dateValue.replace(" ", "T");

    const date = new Date(
        normalizedDate.endsWith("Z")
            ? normalizedDate
            : normalizedDate + "Z"
    );

    return Number.isNaN(date.getTime()) ? null : date;
}

async function loadDashboard() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error("Could not load account information.");
        }

        userName.textContent =
            result.user.full_name || "Business Owner";

        businessName.textContent =
            result.user.business_name || "Your Business";

        currentUserId = String(
            result.user.id || result.user.business_id || "default"
        );

        await loadSubscription();

    } catch (error) {
        console.error("Dashboard error:", error);

        userName.textContent = "Account unavailable";
        businessName.textContent = "Business information unavailable";
    }
}

async function loadSubscription() {
    try {
        const response = await fetch("/api/subscription", {
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        const result = await response.json();

        if (!response.ok || !result.success || !result.subscription) {
            throw new Error(
                result.message || "Could not load subscription."
            );
        }

        const subscription = result.subscription;

        // Hide the previous large subscription card.
        const oldSubscriptionCard = document.getElementById(
            "subscriptionCard"
        );

        if (oldSubscriptionCard) {
            oldSubscriptionCard.style.display = "none";
        }

        addTrialReminderStyles();

        // Show the countdown only for an account with a trial.
        if (subscription.status === "trial") {
            const trialEnd = parseUtcDate(subscription.trial_ends_at);

            if (!trialEnd) {
                console.error("The trial expiry date is unavailable.");
                return;
            }

            trialEndTime = trialEnd.getTime();

            createTrialReminder();
            return;
        }

        // No trial reminder for pending or paid subscriptions.
        stopTrialReminderCountdown();

    } catch (error) {
        console.error("Subscription error:", error);
    }
}

function stopTrialReminderCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function formatDate(dateValue) {
    if (!dateValue) {
        return "Not available";
    }

    const date = parseUtcDate(dateValue);

    if (!date) {
        return dateValue;
    }

    return date.toLocaleString();
}

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging Out...";

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.location.href = "/login.html";
            return;
        }

        alert(result.message || "Could not log out.");

    } catch (error) {
        console.error("Logout error:", error);
        alert("Unable to connect to the server.");

    } finally {
        logoutButton.disabled = false;
        logoutButton.textContent = "Log Out";
    }
});

loadDashboard();
