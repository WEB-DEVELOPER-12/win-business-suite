
"use strict";

const confirmForm = document.getElementById("confirmLoginForm");
const confirmButton = document.getElementById("confirmLoginButton");
const resendButton = document.getElementById("resendLoginCodeButton");
const confirmationCode = document.getElementById("confirmationCode");
const confirmationMessage = document.getElementById("confirmationMessage");
const confirmationEmail = document.getElementById("confirmationEmail");

const params = new URLSearchParams(window.location.search);
const email = (params.get("email") || "").trim().toLowerCase();

// Keep the email in memory, not in the visible address bar.
window.history.replaceState({}, document.title, window.location.pathname);

function showMessage(message, color = "#68758a") {
    confirmationMessage.textContent = message;
    confirmationMessage.style.color = color;
}

function setButtonsDisabled(disabled) {
    confirmButton.disabled = disabled;
    resendButton.disabled = disabled;
}

if (!confirmForm || !confirmButton || !resendButton ||
    !confirmationCode || !confirmationMessage || !confirmationEmail) {

    console.error("Login confirmation page elements are missing.");

} else if (!email) {

    confirmationEmail.textContent = "Email address not found";
    confirmationCode.disabled = true;
    setButtonsDisabled(true);

    showMessage(
        "No email address was provided. Please return to the login page and sign in again.",
        "#c0392b"
    );

} else {

    confirmationEmail.textContent = email;

    confirmationCode.addEventListener("input", () => {
        confirmationCode.value = confirmationCode.value
            .replace(/\D/g, "")
            .slice(0, 6);
    });

    confirmForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const code = confirmationCode.value.trim();

        if (!/^\d{6}$/.test(code)) {
            showMessage(
                "Please enter the complete six-digit confirmation code.",
                "#c0392b"
            );
            confirmationCode.focus();
            return;
        }

        setButtonsDisabled(true);
        confirmButton.textContent = "Confirming...";

        showMessage("Please wait while we confirm your login.");

        try {
            const response = await fetch("/api/auth/confirm-login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    code
                })
            });

            let result = {};

            try {
                result = await response.json();
            } catch {
                result = {};
            }

            if (response.ok && result.success) {
                confirmButton.textContent = "Login Confirmed";

                showMessage(
                    "Your login is confirmed. Opening your dashboard...",
                    "#16803c"
                );

                window.location.replace("/dashboard.html");
                return;
            }

            setButtonsDisabled(false);
            confirmButton.textContent = "Confirm Login";

            showMessage(
                result.message || "The confirmation code could not be verified. Please try again.",
                "#c0392b"
            );

            if (response.status === 429) {
                showMessage(
                    result.message || "Too many attempts. Please wait before trying again.",
                    "#c0392b"
                );
            }

        } catch (error) {
            console.error("Login confirmation failed:", error);

            setButtonsDisabled(false);
            confirmButton.textContent = "Confirm Login";

            showMessage(
                "Unable to contact the server. Please check your connection and try again.",
                "#c0392b"
            );
        }
    });

    resendButton.addEventListener("click", async () => {
        setButtonsDisabled(true);
        resendButton.textContent = "Sending...";

        showMessage("Requesting a new confirmation code.");

        try {
            const response = await fetch("/api/auth/resend-login-code", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email })
            });

            let result = {};

            try {
                result = await response.json();
            } catch {
                result = {};
            }

            if (response.ok && result.success) {
                confirmationCode.value = "";

                showMessage(
                    result.message || "A new confirmation code has been sent. Check your email.",
                    "#16803c"
                );

            } else {
                showMessage(
                    result.message || "Unable to resend the code. Please try again later.",
                    "#c0392b"
                );
            }

        } catch (error) {
            console.error("Resending login code failed:", error);

            showMessage(
                "Unable to contact the server. Please check your connection.",
                "#c0392b"
            );

        } finally {
            setButtonsDisabled(false);
            confirmButton.textContent = "Confirm Login";
            resendButton.textContent = "Resend Code";
        }
    });
}
