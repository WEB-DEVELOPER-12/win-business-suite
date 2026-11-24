"use strict";

const path = require("path");
const pool = require("../config/postgresDatabase");

const MAINTENANCE_PAGE = path.join(
    __dirname,
    "../../public/maintenance.html"
);

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
}

function isAllowedAssetRequest(req) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        return false;
    }

    const requestPath = req.path;

    if (requestPath.split("/").includes("..")) {
        return false;
    }

    if (requestPath === "/maintenance.html") {
        return true;
    }

    if (
        requestPath.startsWith("/css/") ||
        requestPath.startsWith("/js/") ||
        requestPath.startsWith("/images/")
    ) {
        return true;
    }

    return [
        "/favicon.ico",
        "/manifest.webmanifest",
        "/robots.txt"
    ].includes(requestPath);
}

function sendMaintenancePage(res, status = 503) {
    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
    );

    return res.status(status).sendFile(
        MAINTENANCE_PAGE,
        error => {
            if (error && !res.headersSent) {
                console.error(
                    "Could not serve the WIN maintenance page:",
                    error.message
                );

                res.status(status)
                    .type("text/plain")
                    .send(
                        "WIN Business Suite is temporarily unavailable. Please try again later."
                    );
            }
        }
    );
}

function sendMaintenanceUnavailable(req, res) {
    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
    );

    if (req.path.startsWith("/api/")) {
        return res.status(503).json({
            success: false,
            code: "MAINTENANCE_STATUS_UNAVAILABLE",
            message:
                "WIN Business Suite is temporarily unavailable. Please try again later."
        });
    }

    return sendMaintenancePage(res, 503);
}

async function maintenanceGuard(req, res, next) {
    // Keep platform health monitoring available.
    if (
        req.path === "/api/health" &&
        (req.method === "GET" || req.method === "HEAD")
    ) {
        return next();
    }

    // Allow the maintenance screen and required public assets.
    if (isAllowedAssetRequest(req)) {
        return next();
    }

    try {
        const settings = await get(`
            SELECT
                maintenance_enabled,
                message,
                reason,
                expected_return_at
            FROM platform_maintenance
            WHERE id = 1
            LIMIT 1
        `);

        // Missing settings must not silently allow customer access.
        if (!settings) {
            console.error(
                "Maintenance guard: settings row is missing."
            );

            return sendMaintenanceUnavailable(req, res);
        }

        // Continue normally when maintenance is OFF.
        if (Number(settings.maintenance_enabled) !== 1) {
            return next();
        }

        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );

        // Customer APIs receive a structured maintenance response.
        if (req.path.startsWith("/api/")) {
            return res.status(503).json({
                success: false,
                code: "PLATFORM_MAINTENANCE",
                maintenance: true,
                message: settings.message,
                reason: settings.reason || null,
                expectedReturnAt: settings.expected_return_at || null
            });
        }

        // Customer pages receive the branded maintenance screen.
        return sendMaintenancePage(res, 503);

    } catch (error) {
        console.error(
            "WIN Maintenance guard database error:",
            error.message
        );

        // Fail safely when maintenance status cannot be checked.
        return sendMaintenanceUnavailable(req, res);
    }
}

module.exports = maintenanceGuard;