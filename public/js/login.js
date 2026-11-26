
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

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (result.confirmationRequired) {
                window.location.replace(
                    "/confirm-login.html?email=" +
                    encodeURIComponent(result.email || email)
                );
                return;
            }

            loginMessage.textContent =
                result.message || "Login could not be completed.";
            loginMessage.style.color = "red";

        } catch (error) {
            console.error("Login failed:", error);
            loginMessage.textContent =
                "Unable to connect. Please try again.";
            loginMessage.style.color = "red";

        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Log In";
        }
    });
}
