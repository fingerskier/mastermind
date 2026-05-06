import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

const cliPath = join(import.meta.dirname, '..', 'bin', 'landsraad.js')
const dogfoodCouncil = join(import.meta.dirname, '..', '..', '.dogfood-council')
const screenshotPath = join(import.meta.dirname, '..', 'test-results', 'dashboard-dogfood.png')

test('dogfood council dashboard renders overview and run detail', async () => {
  let child
  let browser
  try {
    child = spawn(process.execPath, [cliPath, '--council', dogfoodCouncil, '--json', 'dashboard', '--host', '127.0.0.1', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const launch = await readJsonLine(child)

    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
    await page.goto(launch.url)
    await page.getByRole('heading', { name: /Landsraad Product Development Council/i }).waitFor()
    await page.getByRole('button', { name: 'Runs' }).click()
    const mvpRun = page.getByRole('button', { name: /MVP Vertical Slice/i }).first()
    await mvpRun.waitFor()
    await mvpRun.click()
    await page.getByText(/Local CLI Adapter Output/i).waitFor()

    await mkdir(join(import.meta.dirname, '..', 'test-results'), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    assert.match(await page.locator('body').innerText(), /Run Detail/)
  } finally {
    await browser?.close()
    child?.kill()
    await onceExit(child)
  }
})

async function readJsonLine(child) {
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for dashboard launch. stderr: ${stderr}`)), 10_000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      const line = stdout.split(/\r?\n/).find((candidate) => candidate.trim())
      if (!line) return
      clearTimeout(timer)
      try {
        resolve(JSON.parse(line))
      } catch (error) {
        reject(error)
      }
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      if (!stdout.trim()) {
        clearTimeout(timer)
        reject(new Error(`Dashboard process exited with code ${code}. stderr: ${stderr}`))
      }
    })
  })
}

async function onceExit(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => child.once('exit', resolve))
}
