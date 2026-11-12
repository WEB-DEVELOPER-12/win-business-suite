
const form = document.getElementById("businessSettingsForm");
const messageBox = document.getElementById("message");
const saveButton = document.getElementById("saveButton");

const fields = {
    businessName: document.getElementById("businessName"),
    businessType: document.getElementById("businessType"),
    businessEmail: document.getElementById("businessEmail"),
    businessPhone: document.getElementById("businessPhone"),
    country: document.getElementById("country"),
    currency: document.getElementById("currency"),
    phonePrefix: document.getElementById("phonePrefix")
};

function showMessage(message, type) {
    messageBox.textContent = message;
    messageBox.className = `message ${type}`;
}

function getDialCode() {
    const selectedOption = fields.country.selectedOptions[0];
    return selectedOption?.dataset.dial || "+254";
}

function updatePhonePrefix() {
    fields.phonePrefix.textContent = getDialCode();
}

// Keep only numbers 0-9.
function cleanPhoneNumber(phone) {
    return String(phone || "").replace(/[^0-9]/g, "");
}

// Automatically remove letters and symbols during typing or pasting.
fields.businessPhone.addEventListener("input", () => {
    const cleanedNumber = cleanPhoneNumber(fields.businessPhone.value);

    if (fields.businessPhone.value !== cleanedNumber) {
        fields.businessPhone.value = cleanedNumber;
    }
});

function phoneForSaving() {
    let number = cleanPhoneNumber(fields.businessPhone.value);
    const dialCode = getDialCode();
    const dialDigits = dialCode.replace(/\D/g, "");

    // Remove the selected country's code if already entered.
    if (number.startsWith(dialDigits)) {
        number = number.slice(dialDigits.length);
    }

    // Remove a national trunk prefix such as 0.
    number = number.replace(/^0+/, "");

    return number ? `${dialCode}${number}` : "";
}

function phoneForDisplay(phone, dialCode) {
    let number = cleanPhoneNumber(phone);
    const dialDigits = dialCode.replace(/\D/g, "");

    // Remove the international prefix before showing the local number.
    if (number.startsWith(dialDigits)) {
        number = number.slice(dialDigits.length);
    }

    return number.replace(/^0+/, "");
}

async function loadBusinessSettings() {
    try {
        const response = await fetch("/api/business-settings", {
            method: "GET",
            credentials: "same-origin"
        });

        const data = await response.json();

        if (response.status === 401) {
            window.location.href = "login.html";
            return;
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not load business settings.");
        }

        const business = data.business || {};

        fields.businessName.value = business.business_name || "";
        fields.businessType.value = business.business_type || "";
        fields.businessEmail.value = business.email || "";

        // Restore the saved country if it exists in the dropdown.
        const savedCountry = business.country || "Kenya";
        const countryExists = Array.from(fields.country.options)
            .some(option => option.value === savedCountry);

        fields.country.value = countryExists ? savedCountry : "Kenya";

        updatePhonePrefix();

        fields.businessPhone.value = phoneForDisplay(
            business.phone || "",
            getDialCode()
        );

        fields.currency.value = business.currency || "KES";

    } catch (error) {
        showMessage(error.message, "error");
    }
}

// Change the international phone prefix when the country changes.
fields.country.addEventListener("change", () => {
    updatePhonePrefix();
});

// Save business settings.
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    messageBox.className = "message";

    const businessData = {
        business_name: fields.businessName.value.trim(),
        business_type: fields.businessType.value.trim(),
        email: fields.businessEmail.value.trim(),
        phone: phoneForSaving(),
        country: fields.country.value,
        currency: fields.currency.value
    };

    try {
        const response = await fetch("/api/business-settings", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(businessData)
        });

        const data = await response.json();

        if (response.status === 401) {
            window.location.href = "login.html";
            return;
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not save business settings.");
        }

        showMessage("Business settings updated successfully!", "success");

    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Changes";
    }
});

// Initialize the page.
updatePhonePrefix();
loadBusinessSettings();
