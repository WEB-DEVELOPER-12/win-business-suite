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

        if (response.ok && result.success) {
            loginMessage.textContent = "Login successful! Opening dashboard...";
            loginMessage.style.color = "green";

            window.location.href = "/dashboard.html";
        } else {
            loginMessage.textContent = result.message || "Login failed.";
            loginMessage.style.color = "red";
        }

    } catch (error) {
        loginMessage.textContent =
            "Unable to connect to the server. Please try again.";
        loginMessage.style.color = "red";

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Log In";
    }
});