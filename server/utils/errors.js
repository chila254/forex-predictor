// Only leak internal error details when a developer opts in explicitly.
// Deliberately NOT tied to NODE_ENV: a missing NODE_ENV on Vercel should not
// start exposing upstream URLs and stack-derived messages to clients.
const EXPOSE_ERRORS = process.env.EXPOSE_ERRORS === 'true';

function publicError(message) {
  return EXPOSE_ERRORS ? message : undefined;
}

module.exports = { EXPOSE_ERRORS, publicError };
