
"use strict";

const confirmButton = document.getElementById("confirmLoginButton");
const confirmationMessage = document.getElementById("confirmationMessage");

const params = new URLSearchParams(window.location.search);
const confirmationToken = params.get("token");

// Remove the token from the visible address bar.
window.history.replaceState({}, document.title, window.location.pathname);

function showMessage(message, color) {
    confirmationMessage.textContent = message;
    confirmationMessage.style.color = color;
}

async function confirmLogin() {
    if (!confirmationToken || confirmButton.disabled) {
        return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "Confirming...";
    showMessage("Please wait while we confirm your login.", "#68758a");

    try {
        const response = await fetch("/api/auth/confirm-login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: confirmationToken
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
        } else {
            confirmButton.disabled = false;
            confirmButton.textContent = "Try Again";

            showMessage(
                result.message || "Login confirmation failed. Please try again.",
                "#c0392b"
            );
        }

    } catch (error) {
        console.error("Login confirmation failed:", error);

        confirmButton.disabled = false;
        confirmButton.textContent = "Try Again";

        showMessage(
            "Unable to contact the server. Please check your connection.",
            "#c0392b"
        );
    }
}

if (!confirmButton || !confirmationMessage) {
    console.error("Login confirmation page elements are missing.");
} else if (!confirmationToken) {
    confirmButton.disabled = true;

    showMessage(
        "No confirmation token was found. Please log in again to request a new link.",
        "#c0392b"
    );
} else {
    confirmButton.addEventListener("click", confirmLogin);
}
