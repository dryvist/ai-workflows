const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { isIP } = require('node:net');
const path = require('node:path');

const MAX_MESSAGE_LENGTH = 400;
const GATEWAY_CLASSIFIER = path.join(__dirname, '..', '..', 'scripts', 'shared', 'gateway-failure.sh');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeMessage(message, secrets = [], hostnames = []) {
  let sanitized = String(message ?? '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const value of [...secrets, ...hostnames].filter((item) => typeof item === 'string' && item)) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(value), 'gi'), '[REDACTED]');
  }

  return sanitized
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b((?:[\w-]*)(?:token|api[_-]?key|secret|password|authorization))\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(?:github_pat_|gh[pousr]_|sk-ant-|sk-|xox[baprs]-)[A-Za-z0-9._-]{8,}/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[HOST]')
    .replace(/\[?[a-f\d:]{2,}\]?/gi, (value) => isIP(value.replace(/^\[|\]$/g, '')) === 6 ? '[HOST]' : value)
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\b/gi, '[HOST]')
    .replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+(?=:\d{2,5}\b)/gi, '[HOST]')
    .slice(0, MAX_MESSAGE_LENGTH);
}

function buildErrorLine(result, stepOutcome, secrets = [], hostnames = []) {
  const failed = stepOutcome === 'failure' || result?.is_error === true || (result?.subtype && result.subtype !== 'success') || (Array.isArray(result?.errors) && result.errors.length > 0);
  if (!failed) return undefined;

  const subtype = typeof result?.subtype === 'string' && /^[\w.-]{1,80}$/.test(result.subtype)
    ? result.subtype
    : 'unknown';
  const errors = Array.isArray(result?.errors) ? result.errors.filter((error) => typeof error === 'string') : [];
  const message = typeof result?.result === 'string' && result.result.trim()
    ? result.result
    : errors.join(', ');
  const safeMessage = sanitizeMessage(message, secrets, hostnames) || 'unavailable';

  return `Claude error: subtype=${subtype} message=${JSON.stringify(safeMessage)} exit_code=1`;
}

function reportError() {
  const executionFile = process.env.EXECUTION_FILE || (process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'claude-execution-output.json'));
  let result;

  if (executionFile) {
    try {
      const messages = JSON.parse(fs.readFileSync(executionFile, 'utf8'));
      result = Array.isArray(messages) ? messages.filter((message) => message?.type === 'result').pop() : undefined;
    } catch {
      // The step may fail before the SDK writes its result file.
    }
  }

  const line = buildErrorLine(
    result,
    process.env.STEP_OUTCOME,
    [process.env.ROUTER_API_KEY, process.env.CLAUDE_GITHUB_TOKEN],
    [process.env.HOSTNAME, process.env.RUNNER_NAME],
  );
  if (!line) return;
  console.log(line);

  // The classifier is the shared shell script; it reads the sanitized line.
  const reason = execFileSync('bash', [GATEWAY_CLASSIFIER, 'classify', '-'], { input: line, encoding: 'utf8' }).trim();
  if (reason && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `gateway_class=${reason}\n`);
}

if (require.main === module) reportError();

module.exports = { buildErrorLine, sanitizeMessage };
