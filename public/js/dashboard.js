
const userName = document.getElementById("userName");
const businessName = document.getElementById("businessName");
const logoutButton = document.getElementById("logoutButton");

const subscriptionCard = document.getElementById("subscriptionCard");
const subscriptionStatus = document.getElementById("subscriptionStatus");
const subscriptionDescription = document.getElementById("subscriptionDescription");
const trialCountdown = document.getElementById("trialCountdown");
const trialExpiry = document.getElementById("trialExpiry");
const subscriptionNotice = document.getElementById("subscriptionNotice");

const overviewSales = document.getElementById("overviewSales");
const overviewExpenses = document.getElementById("overviewExpenses");
const overviewProfit = document.getElementById("overviewProfit");
const overviewStock = document.getElementById("overviewStock");
const overviewStatus = document.getElementById("overviewStatus");

let countdownInterval = null;
let remainingSeconds = 0;
let subscriptionOverlay = null;

const POPUP_DISMISSED_KEY = "winSubscriptionPopupDismissed";

function setOverviewStatus(message) {
    if (overviewStatus) {
        overviewStatus.textContent = message;
    }
}

function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Unavailable";
    }

    return "KSh " + amount.toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function setOverviewValue(element, value) {
    if (element) {
        element.textContent = value;
    }
}

async function fetchSummary(url) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
            Accept: "application/json"
        }
    });

    if (response.status === 401) {
        window.location.href = "/login.html";
        throw new Error("Your session has expired.");
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message || "Unable to load summary."
        );
    }

    return result;
}

async function loadOverview() {
    setOverviewStatus("Loading today's business figures...");

    const tasks = [
        {
            name: "sales",
            run: async () => {
                const result = await fetchSummary("/api/sales/summary");

                const summary = result.summary;

                if (!summary) {
                    throw new Error("Sales summary is missing.");
                }

                setOverviewValue(
                    overviewSales,
                    formatMoney(summary.total_revenue)
                );
            }
        },
        {
            name: "finance",
            run: async () => {
                const result = await fetchSummary("/api/finance/summary");

                const summary = result.summary;

                if (!summary) {
                    throw new Error("Finance summary is missing.");
                }

                setOverviewValue(
                    overviewExpenses,
                    formatMoney(summary.expenses)
                );

                setOverviewValue(
                    overviewProfit,
                    formatMoney(summary.net_profit)
                );
            }
        },
        {
            name: "inventory",
            run: async () => {
                const result = await fetchSummary("/api/inventory/summary");

                const summary = result.summary;

                if (!summary) {
                    throw new Error("Inventory summary is missing.");
                }

                const totalProducts = Number(summary.total_products);

                setOverviewValue(
                    overviewStock,
                    Number.isFinite(totalProducts)
                        ? totalProducts.toLocaleString("en-KE")
                        : "Unavailable"
                );
            }
        }
    ];

    const results = await Promise.allSettled(
        tasks.map(task => task.run())
    );

    const failedTasks = results
        .map((result, index) => ({
            result,
            task: tasks[index]
        }))
        .filter(item => item.result.status === "rejected");

    for (const item of failedTasks) {
        console.error(
            `Dashboard ${item.task.name} summary error:`,
            item.result.reason
        );

        if (item.task.name === "sales") {
            setOverviewValue(overviewSales, "Unavailable");
        }

        if (item.task.name === "finance") {
            setOverviewValue(overviewExpenses, "Unavailable");
            setOverviewValue(overviewProfit, "Unavailable");
        }

        if (item.task.name === "inventory") {
            setOverviewValue(overviewStock, "Unavailable");
        }
    }

    if (failedTasks.length === 0) {
        setOverviewStatus("Showing today's figures using Kenya business dates.");
    } else if (failedTasks.length === tasks.length) {
        setOverviewStatus(
            "Business figures could not load. Please refresh the page."
        );
    } else {
        setOverviewStatus(
            "Some figures could not load. Please refresh to try again."
        );
    }
}

function createSubscriptionPopup() {
    if (!subscriptionCard || subscriptionOverlay) {
        return;
    }

    const style = document.createElement("style");

    style.textContent = `
        .win-subscription-overlay {
            position: fixed;
            inset: 0;
            z-index: 2000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(3, 12, 28, 0.78);
            backdrop-filter: blur(5px);
        }

        .win-subscription-dialog {
            position: relative;
            width: min(100%, 520px);
            max-height: 90vh;
            overflow-y: auto;
            border: 1px solid rgba(0, 190, 255, 0.35);
            border-radius: 18px;
            background: var(--card-bg, #101d32);
            color: var(--text-color, #ffffff);
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        .win-subscription-close {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 36px;
            height: 36px;
            border: 0;
            border-radius: 50%;
            background: rgba(128, 128, 128, 0.18);
            color: inherit;
            font-size: 24px;
            line-height: 1;
            cursor: pointer;
        }

        .win-subscription-dialog .win-subscription-card {
            margin: 0;
        }

        .win-subscription-dialog #subscriptionCard {
            margin: 0;
            width: 100%;
        }

        .win-subscription-close:hover {
            background: rgba(0, 190, 255, 0.2);
        }

        body.win-subscription-popup-open {
            overflow: hidden;
        }

        @media (max-width: 480px) {
            .win-subscription-overlay {
                padding: 12px;
            }

            .win-subscription-dialog {
                padding: 20px 16px;
                border-radius: 14px;
            }
        }
    `;

    document.head.appendChild(style);

    subscriptionOverlay = document.createElement("div");
    subscriptionOverlay.className = "win-subscription-overlay";
    subscriptionOverlay.setAttribute("role", "presentation");

    const dialog = document.createElement("div");
    dialog.className = "win-subscription-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Subscription information");

    const closeButton = document.createElement("button");
    closeButton.className = "win-subscription-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute(
        "aria-label",
        "Close subscription information"
    );

    closeButton.addEventListener("click", closeSubscriptionPopup);

    subscriptionOverlay.addEventListener("click", event => {
        if (event.target === subscriptionOverlay) {
            closeSubscriptionPopup();
        }
    });

    dialog.appendChild(closeButton);
    dialog.appendChild(subscriptionCard);
    subscriptionOverlay.appendChild(dialog);

    document.body.appendChild(subscriptionOverlay);

    subscriptionCard.style.display = "";
}

function showSubscriptionPopup() {
    if (!subscriptionOverlay) {
        return;
    }

    if (sessionStorage.getItem(POPUP_DISMISSED_KEY) === "true") {
        return;
    }

    subscriptionOverlay.style.display = "flex";
    document.body.classList.add("win-subscription-popup-open");
}

function closeSubscriptionPopup() {
    if (!subscriptionOverlay) {
        return;
    }

    subscriptionOverlay.style.display = "none";
    document.body.classList.remove("win-subscription-popup-open");

    sessionStorage.setItem(POPUP_DISMISSED_KEY, "true");
}

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

        if (userName) {
            userName.textContent = result.user.full_name || "Account";
        }

        if (businessName) {
            businessName.textContent =
                result.user.business_name || "Your Business";
        }

        createSubscriptionPopup();

        await Promise.allSettled([
            loadOverview(),
            loadSubscription()
        ]);

        showSubscriptionPopup();

    } catch (error) {
        console.error("Dashboard error:", error);

        if (userName) {
            userName.textContent = "Account unavailable";
        }

        if (businessName) {
            businessName.textContent =
                "Business information unavailable";
        }
    }
}

async function loadSubscription() {
    try {
        const response = await fetch("/api/subscription", {
            credentials: "same-origin"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "Could not load subscription."
            );
        }

        const subscription = result.subscription;

        if (!subscription) {
            throw new Error("Subscription information is missing.");
        }

        if (subscriptionStatus) {
            subscriptionStatus.textContent =
                String(subscription.status || "unavailable").toUpperCase();
        }

        if (subscription.status === "trial") {
            if (subscriptionDescription) {
                subscriptionDescription.textContent =
                    "Enjoy your 15-day WIN Pro free trial with access to Pro features.";
            }

            remainingSeconds =
                Number(subscription.remaining_seconds) || 0;

            if (trialExpiry) {
                trialExpiry.textContent =
                    "Trial expires: " +
                    formatDate(subscription.trial_ends_at);
            }

            startCountdown();

        } else if (subscription.status === "active") {
            if (subscriptionDescription) {
                subscriptionDescription.textContent =
                    "Your WIN Pro subscription is active.";
            }

            remainingSeconds =
                Number(subscription.remaining_seconds) || 0;

            if (trialExpiry) {
                trialExpiry.textContent =
                    subscription.current_period_end
                        ? "Subscription ends: " +
                          formatDate(subscription.current_period_end)
                        : "Your subscription is active.";
            }

            startCountdown();

        } else {
            if (subscriptionDescription) {
                subscriptionDescription.textContent =
                    "Your WIN Pro trial or subscription has expired.";
            }

            if (trialCountdown) {
                trialCountdown.textContent = "Access expired";
            }

            if (trialExpiry) {
                trialExpiry.textContent =
                    "Choose a plan to continue.";
            }

            if (subscriptionNotice) {
                subscriptionNotice.textContent =
                    "Upgrade your account to restore access to protected business features.";
            }
        }

    } catch (error) {
        console.error("Subscription error:", error);

        if (subscriptionStatus) {
            subscriptionStatus.textContent = "UNAVAILABLE";
        }

        if (subscriptionDescription) {
            subscriptionDescription.textContent =
                "We could not load your subscription information.";
        }

        if (trialCountdown) {
            trialCountdown.textContent = "--";
        }

        if (trialExpiry) {
            trialExpiry.textContent = "Please refresh the page.";
        }
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
    if (!trialCountdown || !subscriptionStatus || !subscriptionNotice) {
        return;
    }

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

    const normalizedDate = String(dateValue).replace(" ", "T");
    const date = new Date(normalizedDate + "Z");

    if (Number.isNaN(date.getTime())) {
        return dateValue;
    }

    return date.toLocaleString();
}

if (logoutButton) {
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
                sessionStorage.removeItem(POPUP_DISMISSED_KEY);
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
}

loadDashboard();
