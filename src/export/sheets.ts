import type { Audit, Brand, FindingFull } from '../lib/types'
import { CSV_COLUMNS, toRow } from './serialize'

/**
 * Google Sheets export.
 *
 * Scope is drive.file only, which Google classifies as non-sensitive: the app
 * can create files and touch files it created, and nothing else in the user's
 * Drive. That keeps this out of the sensitive-scope verification queue.
 *
 * Token flow is the implicit Google Identity Services client, so no server and
 * no refresh token is stored anywhere.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GSI = 'https://accounts.google.com/gsi/client'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string
            scope: string
            callback: (r: { access_token?: string; error?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Google script failed to load')))
      return
    }
    const s = document.createElement('script')
    s.src = GSI
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google script failed to load'))
    document.head.appendChild(s)
  })
}

export function sheetsConfigured(): boolean {
  // A real Google client id always ends in .apps.googleusercontent.com.
  // Checking the shape rather than just presence means a placeholder value
  // leaves the button disabled instead of enabling it to fail on click.
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return Boolean(id && id.endsWith('.apps.googleusercontent.com'))
}

async function getToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('Google export is not configured. Set VITE_GOOGLE_CLIENT_ID.')
  await loadGsi()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token)
        else reject(new Error(r.error ?? 'Google declined the request.'))
      },
    })
    client.requestAccessToken()
  })
}

async function api(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Creates a new spreadsheet and returns its URL. */
export async function exportToSheets(
  brand: Brand,
  audit: Audit,
  findings: FindingFull[],
): Promise<string> {
  const token = await getToken()
  const title = `${brand.name} / ${audit.title}`

  const created = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Findings', gridProperties: { frozenRowCount: 1 } } }],
    }),
  })

  const id: string = created.spreadsheetId
  const values = [CSV_COLUMNS as unknown as string[], ...findings.map((f) => toRow(f).map(cell))]

  await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Findings!A1?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  )

  // Bold the header and size the first columns so it opens readable.
  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 2 },
            properties: { pixelSize: 240 },
            fields: 'pixelSize',
          },
        },
      ],
    }),
  })

  return created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`
}

function cell(v: string | number | null): string | number {
  return v == null ? '' : v
}
