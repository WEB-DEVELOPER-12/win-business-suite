const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const registerMessage = document.getElementById("registerMessage");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";
    registerMessage.textContent = "";

    const formData = {
        business_name: document.getElementById("business_name").value.trim(),
        business_type: document.getElementById("business_type").value,
        full_name: document.getElementById("full_name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
    };

    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        registerMessage.textContent = result.message;

        if (response.ok && result.success) {
            registerMessage.style.color = "green";
            registerForm.reset();

            setTimeout(() => {
                window.location.href = "/login.html";
            }, 1500);
        } else {
            registerMessage.style.color = "red";
        }

    } catch (error) {
        registerMessage.textContent =
            "Unable to connect to the server. Please try again.";
        registerMessage.style.color = "red";

    } finally {
        registerButton.disabled = false;
        registerButton.textContent = "Create Account";
    }
});