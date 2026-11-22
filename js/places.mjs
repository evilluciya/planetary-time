const fold = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const countryAliases = {
    россия: 'RU', рф: 'RU', russia: 'RU', russland: 'RU', rusia: 'RU',
    сша: 'US', usa: 'US', eeuu: 'US', america: 'US',
    uk: 'GB', англия: 'GB', britain: 'GB', 'great britain': 'GB',
    украина: 'UA', украіна: 'UA', ukraina: 'UA', белоруссия: 'BY'
}
let database

async function load() {
    const response = await fetch(new URL('../data/places.pack', import.meta.url))
    if (!response.ok) throw new Error('Place database unavailable')
    const data = await response.blob()
    const stream = data.stream().pipeThrough(new DecompressionStream('gzip'))
    const lines = (await new Response(stream).text()).trimEnd().split('\n')
    const zones = lines.shift().split('\t').slice(1)
    const areas = new Map(lines.shift().split('\t').slice(1).map(field => field.split('=')))
    const byCountry = new Map()
    for (const line of lines) {
        const nameEnd = line.indexOf('\t')
        const keysEnd = line.indexOf('\t', nameEnd + 1)
        const country = line.slice(keysEnd + 1, keysEnd + 3)
        if (!byCountry.has(country)) byCountry.set(country, [])
        const largest = byCountry.get(country)
        if (largest.length < 12) largest.push(line)
    }
    return {zones, areas, lines, byCountry}
}
const db = () => database ??= load().catch(error => { database = null; throw error })

function unpack(line, data, locale) {
    const [name, keys, country, area, lat, lon, zone] = line.split('\t')
    const localName = locale === 'ru' ? keys.split('|').find(key => /[а-я]/u.test(key)) : null
    const localized = localName?.replace(/(^|[ -])\p{L}/gu, value => value.toUpperCase())
    const region = data.areas.get(country + '.' + area)
    return {name: localized || name, country, region, lat: Number(lat), lon: Number(lon), zone: data.zones[zone]}
}

function countryMatch(key, locale, countries) {
    const alias = Object.hasOwn(countryAliases, key) ? countryAliases[key] : null
    if (alias && countries.has(alias)) return alias
    const local = new Intl.DisplayNames([locale], {type: 'region'})
    const english = new Intl.DisplayNames(['en'], {type: 'region'})
    for (const code of countries.keys()) {
        if (fold(local.of(code)) === key || fold(english.of(code)) === key) return code
    }
    return null
}

export async function searchPlaces(query, locale) {
    const key = fold(query)
    if (key.length < 2) return []
    const data = await db()
    const country = countryMatch(key, locale, data.byCountry)
    if (country) return data.byCountry.get(country).map(line => unpack(line, data, locale))

    const exact = []
    const prefix = []
    for (const line of data.lines) {
        const start = line.indexOf('\t') + 1
        const names = line.slice(start, line.indexOf('\t', start)).split('|')
        if (names.includes(key)) {
            exact.push(line)
            if (exact.length === 12) break
        } else if (prefix.length < 12 && names.some(name => name.startsWith(key))) {
            prefix.push(line)
        }
    }
    return [...exact, ...prefix].slice(0, 12).map(line => unpack(line, data, locale))
}

export async function nearestPlace(lat, lon, locale) {
    const data = await db()
    const rad = Math.PI / 180
    const cosLat = Math.cos(lat * rad)
    const sinLat = Math.sin(lat * rad)
    let greatest = -Infinity
    let nearest
    for (const line of data.lines) {
        const row = line.split('\t')
        const phi = Number(row[4]) * rad
        const dl = (Number(row[5]) - lon) * rad
        const cosine = sinLat * Math.sin(phi) + cosLat * Math.cos(phi) * Math.cos(dl)
        if (cosine > greatest) {
            greatest = cosine
            nearest = line
        }
    }
    return {...unpack(nearest, data, locale), lat, lon}
}
