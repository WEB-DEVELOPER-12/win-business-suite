
"use strict";

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

if (loginForm && loginButton && loginMessage) {
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
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });

            let result = {};

            try {
                result = await response.json();
            } catch {
                result = {};
            }

            if (response.ok && result.success && result.confirmationRequired) {
                const email = result.email || formData.email;

                loginMessage.textContent =
                    "A six-digit login confirmation code has been sent to your email. Redirecting to the confirmation page...";

                loginMessage.style.color = "green";

                window.location.replace(
                    "/confirm-login.html?email=" +
                    encodeURIComponent(email)
                );

                return;
            }

            loginMessage.textContent =
                result.message || "Login could not be completed.";

            loginMessage.style.color = "red";

        } catch (error) {
            console.error("Login request failed:", error);

            loginMessage.textContent =
                "Unable to connect to the server. Please try again.";

            loginMessage.style.color = "red";

        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Log In";
        }
    });
}
