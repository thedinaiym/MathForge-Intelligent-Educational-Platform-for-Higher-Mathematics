#!/usr/bin/env node
/**
 * translate_locales.js
 * ─────────────────────
 * Automatically fills missing or empty keys in en.json and kg.json
 * by translating from ru.json via Groq Llama-3.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_xxx node translate_locales.js          # translate & write
 *   GROQ_API_KEY=gsk_xxx node translate_locales.js --dry    # preview only
 *
 * Requires: Node 18+ (uses native globalThis.fetch)
 * No npm install needed — zero external dependencies.
 *
 * Rules baked into the Groq prompt:
 *   - {{variable}} placeholders are preserved exactly
 *   - Proper nouns (MathForge, SymPy, Groq, LaTeX, PDF, GitHub, Google) untouched
 *   - Keys that already have non-empty values in the target file are skipped
 */

'use strict'

const fs   = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY
const DRY_RUN      = process.argv.includes('--dry')
const BATCH_SIZE   = 25          // keys per Groq request (stays under token limit)
const MODEL        = 'llama-3.3-70b-versatile'
const LOCALES_DIR  = path.join(__dirname, 'src', 'locales')

const TARGET_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'kg', name: 'Kyrgyz'  },
]

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (!GROQ_API_KEY) {
    console.error('❌  GROQ_API_KEY environment variable is not set.')
    console.error('    Usage: GROQ_API_KEY=gsk_xxx node translate_locales.js')
    process.exit(1)
  }

  const ruPath = path.join(LOCALES_DIR, 'ru.json')
  if (!fs.existsSync(ruPath)) {
    console.error(`❌  Source file not found: ${ruPath}`)
    process.exit(1)
  }

  const ruFlat = flatten(JSON.parse(fs.readFileSync(ruPath, 'utf8')))
  console.log(`📖  Loaded ru.json — ${Object.keys(ruFlat).length} keys`)

  for (const { code, name } of TARGET_LANGS) {
    await processLanguage(code, name, ruFlat)
  }

  console.log('\n✅  Done.')
}

// ── Per-language processing ───────────────────────────────────────────────────

async function processLanguage(langCode, langName, ruFlat) {
  const filePath = path.join(LOCALES_DIR, `${langCode}.json`)
  const existing  = fs.existsSync(filePath)
    ? flatten(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    : {}

  // Find keys that are missing or empty in the target file
  const missing = {}
  for (const [key, value] of Object.entries(ruFlat)) {
    if (typeof value !== 'string') continue           // skip non-strings
    const current = existing[key]
    if (!current || current.trim() === '') {
      missing[key] = value                            // needs translation
    }
  }

  const missingCount = Object.keys(missing).length
  if (missingCount === 0) {
    console.log(`\n✔  ${langCode}.json — already complete, nothing to translate.`)
    return
  }

  console.log(`\n🌐  ${langCode}.json — ${missingCount} missing key(s) to translate into ${langName}…`)

  // Batch the missing keys
  const entries    = Object.entries(missing)
  const translated = {}
  const batches    = chunk(entries, BATCH_SIZE)

  for (let i = 0; i < batches.length; i++) {
    const batch = Object.fromEntries(batches[i])
    console.log(
      `   Batch ${i + 1}/${batches.length} — translating ${batches[i].length} key(s)…`
    )

    try {
      const result = await translateBatch(batch, langName)
      Object.assign(translated, result)
      // Small pause to be kind to the rate limiter
      if (i < batches.length - 1) await sleep(300)
    } catch (err) {
      console.warn(`   ⚠  Batch ${i + 1} failed: ${err.message} — skipping.`)
    }
  }

  const newTranslated = Object.keys(translated).length
  if (newTranslated === 0) {
    console.warn(`   ⚠  No translations received for ${langCode}.json — file unchanged.`)
    return
  }

  // Merge: existing keys take priority (we never overwrite existing translations)
  const merged = unflatten({ ...translated, ...existing })

  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would write ${newTranslated} new key(s) to ${langCode}.json`)
    console.log('   Preview (first 5):')
    Object.entries(translated).slice(0, 5).forEach(([k, v]) =>
      console.log(`     ${k}: "${v}"`)
    )
    return
  }

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
  console.log(`   ✔  Wrote ${newTranslated} new translation(s) to ${langCode}.json`)
}

// ── Groq API call ─────────────────────────────────────────────────────────────

async function translateBatch(keyValuePairs, targetLangName) {
  const systemPrompt = `You are a professional UI translator for an educational math platform.

Translate the JSON values from Russian into ${targetLangName}.

CRITICAL RULES:
1. Return ONLY valid JSON — same keys, translated values.
2. Preserve {{variable}} and {{n}} placeholders EXACTLY as-is.
3. Do NOT translate: MathForge, SymPy, Groq, LaTeX, PDF, GitHub, Google, KG, EN, RU.
4. Keep the same brevity and tone (UI labels should be short).
5. No markdown, no commentary — raw JSON only.`

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: 'Translate these UI strings:\n' + JSON.stringify(keyValuePairs, null, 2),
      },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  const json    = await res.json()
  const content = json?.choices?.[0]?.message?.content

  if (!content) throw new Error('Empty response from Groq')

  try {
    return JSON.parse(content)
  } catch {
    // Attempt to strip markdown code fences if model added them
    const match = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (match) return JSON.parse(match[1])
    throw new Error(`Groq returned non-JSON: ${content.slice(0, 200)}`)
  }
}

// ── JSON flatten / unflatten ──────────────────────────────────────────────────

function flatten(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

function unflatten(flat) {
  const result = {}
  for (const [dotKey, value] of Object.entries(flat)) {
    const parts   = dotKey.split('.')
    let   current = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
        current[parts[i]] = {}
      }
      current = current[parts[i]]
    }
    current[parts[parts.length - 1]] = value
  }
  return result
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('❌  Fatal error:', err.message)
  process.exit(1)
})
