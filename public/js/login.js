
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    loginButton.disabled = true;
    loginButton.textContent = "Logging In...";
    loginMessage.textContent = "";

    const formData = {
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
    };

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            loginMessage.textContent = result.message || "Login failed.";
            loginMessage.style.color = "red";
            return;
        }

        loginMessage.textContent =
            "Login successful! Checking your subscription...";
        loginMessage.style.color = "green";

        const subscriptionResponse = await fetch("/api/subscription", {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        const subscriptionResult = await subscriptionResponse.json();

        if (!subscriptionResponse.ok || !subscriptionResult.success) {
            throw new Error(
                subscriptionResult.message ||
                "Unable to verify your subscription."
            );
        }

        const subscription = subscriptionResult.subscription;

        if (!subscription || !subscription.status) {
            throw new Error(
                "Your subscription information is unavailable."
            );
        }

        if (subscription.status === "pending") {
            window.location.href = "/upgrade.html";
            return;
        }

        if (
            subscription.status === "trial" ||
            subscription.status === "active"
        ) {
            window.location.href = "/dashboard.html";
            return;
        }

        window.location.href = "/upgrade.html";

    } catch (error) {
        loginMessage.textContent =
            error.message ||
            "Unable to connect to the server. Please try again.";

        loginMessage.style.color = "red";

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Log In";
    }
});
