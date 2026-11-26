
"use strict";

const verifyButton = document.getElementById("verifyButton");
const verificationMessage = document.getElementById("verificationMessage");

const params = new URLSearchParams(window.location.search);
const verificationToken = params.get("token");

// Remove the token from the visible address bar after reading it.
window.history.replaceState({}, document.title, window.location.pathname);

let isVerifying = false;

function showMessage(message, color) {
    verificationMessage.textContent = message;
    verificationMessage.style.color = color;
}

async function verifyEmail() {
    if (!verificationToken || isVerifying) {
        return;
    }

    isVerifying = true;
    verifyButton.disabled = true;
    verifyButton.textContent = "Verifying...";

    showMessage(
        "Please wait while we verify your email address.",
        "#68758a"
    );

    try {
        const response = await fetch("/api/auth/verify-email", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: verificationToken
            })
        });

        let result = null;

        try {
            result = await response.json();
        } catch {
            // Handle responses that are not valid JSON.
        }

        if (response.ok && result?.success) {
            verifyButton.textContent = "Email Verified";
            verifyButton.disabled = true;

            showMessage(
                result.message || "Your email has been verified successfully.",
                "#16803c"
            );
        } else {
            verifyButton.disabled = false;
            verifyButton.textContent = "Try Again";

            showMessage(
                result?.message ||
                    `Verification failed (HTTP ${response.status}). Please request a new link if necessary.`,
                "#c0392b"
            );
        }
    } catch (error) {
        console.error("Email verification request failed:", error);

        verifyButton.disabled = false;
        verifyButton.textContent = "Try Again";

        showMessage(
            "Unable to contact the server. Please check your connection and try again.",
            "#c0392b"
        );
    } finally {
        isVerifying = false;
    }
}

if (!verifyButton || !verificationMessage) {
    console.error("Email verification page elements are missing.");
} else if (!verificationToken) {
    verifyButton.disabled = true;

    showMessage(
        "No verification link was found. Please request a new verification email.",
        "#c0392b"
    );
} else {
    // Keep the button as a retry option.
    verifyButton.addEventListener("click", verifyEmail);

    // Start verification automatically when the page opens.
    verifyEmail();
}
