// Optional cloud feature configuration. Keep this file free of server secrets.
// Clerk publishable keys are intended for browser use; the Clerk secret key belongs
// in the Cloudflare Worker secret store and must never be placed here.
window.WHITEBOARD_CLOUD_CONFIG = Object.freeze({
    apiBaseUrl: '', // e.g. https://whiteboard-api.example.workers.dev
    clerkPublishableKey: ''
});
