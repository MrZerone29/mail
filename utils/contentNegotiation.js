/**
 * Content negotiation helper.
 * Returns true if the client explicitly wants JSON (no HTML acceptance).
 * Browsers typically accept text/html, so they get HTML.
 * API clients using Accept: application/json get JSON.
 */
function isApiRequest(req) {
  return req.accepts(['json', 'html']) === 'json';
}

module.exports = { isApiRequest };
