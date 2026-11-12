function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please log in to continue."
        });
    }

    const user = req.session.user;

    if (!user.id || !user.business_id) {
        return res.status(401).json({
            success: false,
            message: "Invalid session. Please log in again."
        });
    }

    next();
}

module.exports = requireAuth;