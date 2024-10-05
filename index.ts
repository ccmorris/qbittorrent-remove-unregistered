import type { Torrent, TorrentTrackers } from '@ctrl/qbittorrent'

const protocol = process.env.QRU_PROTOCOL || 'http'
const host = process.env.QRU_HOST
const port = process.env.QRU_PORT || '8081'
const basePath = process.env.QRU_BASE_PATH || '/api/v2'

const username = process.env.QRU_USERNAME || 'admin'
const password = process.env.QRU_PASSWORD

const baseUrl = `${protocol}://${host}:${port}${basePath}`

if (!host) throw new Error('QRU_HOST is required')
if (!password) throw new Error('QRU_PASSWORD is required')

const loginResult = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  body: new URLSearchParams({ username, password }),
  headers: {
    Referrer: baseUrl,
  },
  credentials: 'include',
})
if (!loginResult.ok) {
  console.error(
    `Failed to login:\n${loginResult.status} ${
      loginResult.statusText
    }: ${await loginResult.text()}`
  )
  process.exit(1)
}
console.log(`Login result: ${await loginResult.text()}`)

const torrentsResponse = await fetch(`${baseUrl}/torrents/info`, {
  method: 'GET',
  credentials: 'include',
  headers: {
    Referrer: baseUrl,
  },
})
const allTorrents = (await torrentsResponse.json()) as Torrent[]

const torrentsWithTracker = await Promise.all(
  allTorrents.map(async (torrent) => {
    const trackerResponse = await fetch(
      `${baseUrl}/torrents/trackers?hash=${encodeURIComponent(torrent.hash)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    )
    const trackers = (await trackerResponse.json()) as TorrentTrackers[]
    return { torrent, trackers }
  })
)

const unregisteredTorrents = torrentsWithTracker.filter(
  ({ torrent, trackers }) =>
    trackers.find(
      (tracker) =>
        tracker.url.startsWith('http') &&
        tracker.msg.includes('Unregistered torrent') &&
        torrent.state === 'stalledUP'
    )
)

if (!unregisteredTorrents.length) {
  console.log('Found 0 unregistered torrents.')
  process.exit()
}

console.dir(
  unregisteredTorrents.map(({ torrent, trackers }) => ({
    name: torrent.name,
    tracker: trackers.find((tracker) => tracker.url.startsWith('http'))?.url,
    state: torrent.state,
  })),
  { depth: 2 }
)

const confirmResults = await confirm(
  `Delete ${unregisteredTorrents.length}/${allTorrents.length} torrents? Y/n `
)
if (!confirmResults) {
  console.log('Exiting')
  process.exit()
}

const hashes = unregisteredTorrents.map(({ torrent }) => torrent.hash).join('|')
const deleteTorrentsResponse = await fetch(`${baseUrl}/torrents/delete`, {
  method: 'POST',
  body: new URLSearchParams({ hashes, deleteFiles: 'false' }),
  credentials: 'include',
})
console.log(await deleteTorrentsResponse.text())

console.log('✅')
