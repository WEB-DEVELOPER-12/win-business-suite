
const userName = document.getElementById("userName");
const businessName = document.getElementById("businessName");
const logoutButton = document.getElementById("logoutButton");

const subscriptionStatus = document.getElementById("subscriptionStatus");
const subscriptionDescription = document.getElementById("subscriptionDescription");
const trialCountdown = document.getElementById("trialCountdown");
const trialExpiry = document.getElementById("trialExpiry");
const subscriptionNotice = document.getElementById("subscriptionNotice");

let countdownInterval = null;
let remainingSeconds = 0;

async function loadDashboard() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "same-origin"
        });

        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error("Could not load account information.");
        }

        userName.textContent = result.user.full_name;
        businessName.textContent = result.user.business_name;

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
            credentials: "same-origin"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Could not load subscription.");
        }

        const subscription = result.subscription;

        subscriptionStatus.textContent = subscription.status.toUpperCase();

        if (subscription.status === "trial") {
            subscriptionDescription.textContent =
                "Enjoy your 15-day WIN Pro free trial with access to Pro features.";

            remainingSeconds = subscription.remaining_seconds;

            trialExpiry.textContent =
                "Trial expires: " + formatDate(subscription.trial_ends_at);

            startCountdown();

        } else if (subscription.status === "active") {
            subscriptionDescription.textContent =
                "Your WIN Pro subscription is active.";

            remainingSeconds = subscription.remaining_seconds;

            trialExpiry.textContent = subscription.current_period_end
                ? "Subscription ends: " + formatDate(subscription.current_period_end)
                : "Your subscription is active.";

            startCountdown();

        } else {
            subscriptionDescription.textContent =
                "Your WIN Pro trial or subscription has expired.";

            trialCountdown.textContent = "Access expired";
            trialExpiry.textContent = "Choose a plan to continue.";
            subscriptionNotice.textContent =
                "Upgrade your account to restore access to protected business features.";
        }

    } catch (error) {
        console.error("Subscription error:", error);

        subscriptionStatus.textContent = "UNAVAILABLE";
        subscriptionDescription.textContent =
            "We could not load your subscription information.";
        trialCountdown.textContent = "--";
        trialExpiry.textContent = "Please refresh the page.";
    }
}

function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    updateCountdown();

    countdownInterval = setInterval(() => {
        if (remainingSeconds > 0) {
            remainingSeconds--;
        }

        updateCountdown();
    }, 1000);
}

function updateCountdown() {
    if (remainingSeconds <= 0) {
        trialCountdown.textContent = "Expired";
        subscriptionNotice.textContent =
            "Your subscription period has ended. Please upgrade to continue.";
        subscriptionStatus.textContent = "EXPIRED";

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        return;
    }

    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    trialCountdown.textContent =
        `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`;

    if (days <= 0 && hours <= 1) {
        subscriptionNotice.textContent =
            "Your subscription expires in one hour or less. Consider upgrading now.";
    } else if (days <= 1) {
        subscriptionNotice.textContent =
            "Your subscription expires within 24 hours. Upgrade to keep your access.";
    } else if (days <= 3) {
        subscriptionNotice.textContent =
            "Only " + days + " days remaining. Plan your WIN Pro upgrade.";
    } else if (days <= 5) {
        subscriptionNotice.textContent =
            "Your free trial is ending soon. Explore the WIN Pro plans.";
    } else {
        subscriptionNotice.textContent =
            "Your WIN Pro features are available during this period.";
    }
}

function formatDate(dateValue) {
    if (!dateValue) {
        return "Not available";
    }

    // SQLite returns UTC-style timestamps without a timezone marker.
    const date = new Date(dateValue.replace(" ", "T") + "Z");

    if (Number.isNaN(date.getTime())) {
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
        alert("Unable to connect to the server.");

    } finally {
        logoutButton.disabled = false;
        logoutButton.textContent = "Log Out";
    }
});

loadDashboard();
