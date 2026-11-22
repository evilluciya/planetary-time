import {DAY, SUN_HORIZON, moonAltitude, moonPhase, phases, sunAltitude} from './ephemeris.mjs'

export const planets = ['♄', '♃', '♂', '☉', '♀', '☿', '☽']
const rulers = [3, 6, 2, 5, 1, 4, 0]
const formatters = new Map()
const caches = new WeakMap()

function formatter(zone) {
    if (!formatters.has(zone)) {
        formatters.set(zone, new Intl.DateTimeFormat('sv-SE', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }))
    }
    return formatters.get(zone)
}
export const localDate = (ms, zone) => formatter(zone).format(ms).slice(0, 10)
const utcDate = ms => new Date(ms).toISOString().slice(0, 10)
export const shiftDate = (date, days) => utcDate(Date.parse(date) + days * DAY)

function midnight(date, zone) {
    const utc = Date.parse(date)
    let lo = utc - DAY
    let hi = utc + DAY
    while (hi - lo > 1) {
        const middle = Math.floor((lo + hi) / 2)
        if (localDate(middle, zone) < date) lo = middle
        else hi = middle
    }
    return hi
}

export function wallTime(date, zone, time) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
    const start = midnight(date, zone)
    const end = midnight(shiftDate(date, 1), zone)
    const format = formatter(zone)
    for (let ms = start; ms < end; ms += 60_000) {
        if (format.format(ms).slice(11, 16) === time) return ms
    }
    return null
}

function crossing(lo, hi, above, altitude) {
    while (hi - lo > 1000) {
        const middle = (lo + hi) / 2
        if ((altitude(middle) >= 0) === above) lo = middle
        else hi = middle
    }
    return Math.round((lo + hi) / 2)
}

function scan(from, to, altitude) {
    const events = {rise: null, set: null, noon: null}
    const step = 300_000
    let best = from
    let previous = from
    let bestHeight = altitude(from)
    let previousHeight = bestHeight
    while (previous < to) {
        const current = Math.min(previous + step, to)
        const height = altitude(current)
        if (height > bestHeight) {
            best = current
            bestHeight = height
        }
        if ((previousHeight >= 0) !== (height >= 0)) {
            const name = previousHeight >= 0 ? 'set' : 'rise'
            events[name] ??= crossing(previous, current, previousHeight >= 0, altitude)
        }
        previous = current
        previousHeight = height
    }
    let lo = Math.max(from, best - step)
    let hi = Math.min(to, best + step)
    while (hi - lo > 1000) {
        const left = (2 * lo + hi) / 3
        const right = (lo + 2 * hi) / 3
        if (altitude(left) < altitude(right)) lo = left
        else hi = right
    }
    events.noon = Math.round((lo + hi) / 2)
    events.above = bestHeight >= 0
    return events
}

export function skyEvents(date, place, body = 'sun') {
    if (!caches.has(place)) caches.set(place, new Map())
    const cache = caches.get(place)
    const key = body + date
    if (!cache.has(key)) {
        if (cache.size >= 110) cache.delete(cache.keys().next().value)
        const from = midnight(date, place.zone)
        const to = midnight(shiftDate(date, 1), place.zone)
        const altitude = body === 'moon'
            ? ms => moonAltitude(ms, place)
            : ms => sunAltitude(ms, place) - SUN_HORIZON
        cache.set(key, scan(from, to, altitude))
    }
    return cache.get(key)
}

export function planetaryDay(date, place) {
    const {rise, set, noon} = skyEvents(date, place)
    if (rise == null) return null
    const tomorrow = skyEvents(shiftDate(date, 1), place)
    const sunset = set > rise ? set : tomorrow.set
    if (sunset == null || sunset <= rise) return null
    const nextRise = tomorrow.rise > sunset ? tomorrow.rise
        : skyEvents(shiftDate(date, 2), place).rise
    // A day with a missing sunrise or sunset in the solar cycle has no 24-hour dial.
    if (nextRise == null || nextRise <= sunset || sunset - rise > 26 * 3_600_000 || nextRise - sunset > 26 * 3_600_000) return null
    const ruler = rulers[new Date(date + 'T00:00:00Z').getUTCDay()]
    const hours = Array.from({length: 24}, (_, index) => {
        const night = index >= 12
        const origin = night ? sunset : rise
        const length = night ? nextRise - sunset : sunset - rise
        const number = index % 12 + 1
        return {index, night, number, planet: (ruler + index) % 7,
            start: origin + Math.floor(length * (number - 1) / 12),
            end: origin + Math.floor(length * number / 12)}
    })
    return {date, rise, sunset, nextRise, noon, ruler, hours}
}
export function dayAt(ms, place) {
    const today = localDate(ms, place.zone)
    for (const date of [today, shiftDate(today, -1)]) {
        const day = planetaryDay(date, place)
        if (day && day.rise <= ms && ms < day.nextRise) return day
    }
    return null
}
export function lunarSnapshot(ms, place) {
    const date = localDate(ms, place.zone)
    const {previous, next} = phases(ms)
    let lunarDay = 1
    let hadRise = false
    for (let cursor = localDate(previous, place.zone); cursor <= date; cursor = shiftDate(cursor, 1)) {
        const rise = skyEvents(cursor, place, 'moon').rise
        hadRise ||= rise != null
        if (rise > previous && rise <= ms) lunarDay++
    }
    return {...moonPhase(ms), ...skyEvents(date, place, 'moon'), next,
        age: (ms - previous) / DAY, lunarDay: Math.min(30, hadRise ? lunarDay : 1 + Math.floor((ms - previous) / DAY))}
}

export function nextSignal(rule, place, after, afterDate = '') {
    if (rule.type === 'fixed') {
        const time = rule.fixed + rule.offset * 60_000
        return time > after ? {time, date: localDate(rule.fixed, place.zone)} : null
    }
    const startDate = shiftDate(localDate(after, place.zone), -2)
    const limit = rule.date ? dayDistance(startDate, rule.date) + 1 : 15
    let next = null
    for (let offset = 0; offset < limit; offset++) {
        const date = shiftDate(startDate, offset)
        if (date <= afterDate || (rule.date && date !== rule.date)) continue
        let events
        switch (rule.type) {
            case 'clock':
                events = [wallTime(date, place.zone, rule.time)]
                break
            case 'moon-rise':
            case 'moon-set':
                events = [skyEvents(date, place, 'moon')[rule.type.slice(5)]]
                break
            case 'hour':
                events = planetaryDay(date, place)?.hours.filter(hour =>
                    (rule.planet === -1 || hour.planet === rule.planet) &&
                    (rule.half === 'all' || hour.night === (rule.half === 'night'))).map(hour => hour.start) ?? []
                break
            default:
                events = [skyEvents(date, place)[rule.type]]
        }
        for (const event of events) {
            if (event == null) continue
            const time = event + rule.offset * 60_000
            if (time > after && (!next || time < next.time)) next = {time, date}
        }
        if (next && offset >= dayDistance(startDate, localDate(next.time, place.zone)) + 1) break
    }
    return next
}
const dayDistance = (first, last) => Math.round((Date.parse(last) - Date.parse(first)) / DAY)
