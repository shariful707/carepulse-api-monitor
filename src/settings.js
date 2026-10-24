// Settings remain on the server; the browser receives readiness flags, never saved passwords.
import {readFileSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {ValidationError} from './validation.js';

const editable = ['provider','openaiKey','openaiModel','geminiKey','geminiModel','ollamaBaseUrl','ollamaModel',
  'emailMode','emailTo','emailFrom','smtpHost','smtpPort','smtpSecure','smtpUser','smtpPassword','smtpRequireTLS'];
const secrets = ['openaiKey','geminiKey','smtpPassword']; // Empty password fields preserve previously saved credentials.
const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

export function validateSettings(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Settings must be an object');
  if (Object.keys(input).some(key => !editable.includes(key))) throw new ValidationError('Unknown settings field');
  const next = {...current};
  for (const [key,value] of Object.entries(input)) {
    if (secrets.includes(key) && value === '') continue; // Never erase a saved secret accidentally.
    if (['smtpSecure','smtpRequireTLS'].includes(key)) {
      if (typeof value !== 'boolean') throw new ValidationError(`${key} must be true or false`);
    } else if (key === 'smtpPort') {
      if (!Number.isInteger(value) || value < 1 || value > 65535) throw new ValidationError('SMTP port must be 1–65535');
    } else if (typeof value !== 'string' || value.length > 500 || /[\r\n\0]/.test(value)) {
      throw new ValidationError(`${key} must be a single line of at most 500 characters`);
    }
    next[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (!['none','openai','ollama','gemini'].includes(next.provider)) throw new ValidationError('Choose a supported AI provider');
  if (!['off','preview','smtp'].includes(next.emailMode)) throw new ValidationError('Choose off, preview or SMTP email mode');
  for (const key of ['openaiModel','geminiModel','ollamaModel']) {
    if (!next[key]) throw new ValidationError(`${key} cannot be empty`);
  }
  let url;
  try { url = new URL(next.ollamaBaseUrl); } catch { throw new ValidationError('Enter a valid Ollama server URL'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ValidationError('Ollama URL must be an HTTP(S) server address without a path or credentials');
  }
  for (const key of ['emailTo','emailFrom']) {
    if (next[key] && !address.test(next[key]) && !(key === 'emailFrom' && next[key] === 'carepulse@localhost')) {
      throw new ValidationError(`${key} must be one valid email address`);
    }
  }
  if (next.emailMode === 'smtp' && (!next.smtpHost || !next.emailTo || !address.test(next.emailFrom))) {
    throw new ValidationError('SMTP delivery needs a server, recipient and valid sender address');
  }
  return next;
}

export function publicSettings(cfg) {
  const view = Object.fromEntries(editable.filter(key => !secrets.includes(key)).map(key => [key,cfg[key]]));
  return {...view, openaiKeySet:!!cfg.openaiKey, geminiKeySet:!!cfg.geminiKey, smtpPasswordSet:!!cfg.smtpPassword,
    writeKeyRequired:!!cfg.apiKey, slowThresholdMs:cfg.slowThresholdMs, maxBatchSize:cfg.maxBatchSize};
}

export function createSettingsStore(base) {
  let current = {...base};
  try { current = validateSettings(JSON.parse(readFileSync(base.settingsPath,'utf8')),base); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Saved settings could not be loaded: ${error.message}`); }
  return {
    get: () => ({...current}), // Snapshot avoids configuration changes midway through a batch.
    save(input) {
      const next = validateSettings(input,current);
      const persisted = Object.fromEntries(editable.map(key => [key,next[key]]));
      mkdirSync(dirname(base.settingsPath),{recursive:true});
      writeFileSync(`${base.settingsPath}.tmp`,JSON.stringify(persisted,null,2),{mode:0o600}); // Plaintext secrets stay in ignored local data.
      renameSync(`${base.settingsPath}.tmp`,base.settingsPath); // Atomic replacement prevents a partial settings file.
      current = next;
      return publicSettings(current);
    }
  };
}
