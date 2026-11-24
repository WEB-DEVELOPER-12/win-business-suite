
"use strict";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getHttpOrigin(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    try {
        const parsed = new URL(value.trim());

        if (!["http:", "https:"].includes(parsed.protocol)) {
            return null;
        }

        return parsed.origin;
    } catch {
        return null;
    }
}

function createCsrfProtection() {
    const trustedOrigin = getHttpOrigin(process.env.APP_URL);

    if (!trustedOrigin) {
        throw new Error(
            "CSRF protection requires a valid HTTP or HTTPS APP_URL."
        );
    }

    return function csrfProtection(req, res, next) {
        // Read-only methods must never perform state changes.
        if (SAFE_METHODS.has(req.method.toUpperCase())) {
            return next();
        }

        // Reject requests explicitly identified as cross-site.
        const fetchSite = req.get("sec-fetch-site");

        if (
            typeof fetchSite === "string" &&
            fetchSite.toLowerCase() === "cross-site"
        ) {
            return res.status(403).json({
                success: false,
                message: "Cross-origin request blocked."
            });
        }

        const originHeader = req.get("origin");
        const refererHeader = req.get("referer");

        let requestOrigin = null;

        // Origin takes priority. Never accept Origin: null.
        if (originHeader) {
            if (originHeader.trim().toLowerCase() === "null") {
                requestOrigin = null;
            } else {
                requestOrigin = getHttpOrigin(originHeader);
            }
        } else if (refererHeader) {
            // Referer fallback when Origin is absent.
            requestOrigin = getHttpOrigin(refererHeader);
        }

        // Reject missing, malformed, or untrusted origins.
        if (!requestOrigin || requestOrigin !== trustedOrigin) {
            return res.status(403).json({
                success: false,
                message: "Request origin could not be verified."
            });
        }

        return next();
    };
}

module.exports = createCsrfProtection;
