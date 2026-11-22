import {dayAt, localDate, lunarSnapshot, nextSignal, planetaryDay, planets, shiftDate, skyEvents} from './clock.mjs'
import {animateSky, drawMoon, makeDial} from './graphics.mjs'
import {nearestPlace, searchPlaces} from './places.mjs'
import {celestial, messages} from './strings.mjs'

const $ = id => document.getElementById(id)
const all = selector => [...document.querySelectorAll(selector)]
const text = (id, value) => { $(id).textContent = value }
const tg = window.Telegram?.WebApp
const query = new URLSearchParams(location.search)
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const defaultPlace = {name: 'Київ', country: 'UA', lat: 50.4501, lon: 30.5234, zone: 'Europe/Kyiv'}
const prefix = 'oracle-planetary-v1:'
function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback }
    catch { return fallback }
}
function save(key, value) {
    try { localStorage.setItem(prefix + key, JSON.stringify(value)) }
    catch { /* The current session stays usable when storage is disabled. */ }
}
const fromTelegram = (query.get('lang') ?? tg?.initDataUnsafe?.user?.language_code ?? document.documentElement.lang).slice(0, 2)
const settings = load('settings', {lang: Object.hasOwn(messages, fromTelegram) ? fromTelegram : 'en', seconds: true, format: '24', emblem: 'nine'})
let place = load('place', defaultPlace)
let date = localDate(Date.now(), place.zone)
let view = 'now'
let makePointer = () => {}
let currentKey = ''
let moonKey = ''
let tableKey = ''
const fmt = new Map()
const t = key => messages[settings.lang][key]
const name = planet => celestial[settings.lang][0][planet]
const phaseName = phase => celestial[settings.lang][1][phase]
const signName = sign => celestial[settings.lang][2][sign]
const signalNames = {hour: 'planetaryHour', fixed: 'selectedHour', rise: 'sunrise', noon: 'noon', set: 'sunset', 'moon-rise': 'moonrise', 'moon-set': 'moonset', clock: 'clockTime'}

function element(tag, content, className) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (content != null) node.textContent = content
    return node
}
function renderPairs(id, pairs) {
    $(id).replaceChildren(...pairs.map(([key, value]) => {
        const row = element('div')
        row.append(element('dt', key), element('dd', value))
        return row
    }))
}
function timeFormat(zone, long = false) {
    const key = [zone, long, settings.lang, settings.format].join('|')
    if (!fmt.has(key)) {
        fmt.set(key, new Intl.DateTimeFormat(settings.lang, {
            timeZone: zone, hour: '2-digit', minute: '2-digit',
            hourCycle: settings.format === '12' ? 'h12' : 'h23',
            ...(long ? {day: 'numeric', month: 'short'} : {})
        }))
    }
    return fmt.get(key)
}
const time = (ms, long = false, zone = place.zone) => ms == null ? '—' : timeFormat(zone, long).format(ms)
const dateLabel = iso => new Intl.DateTimeFormat(settings.lang, {timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'}).format(Date.parse(iso))
const duration = ms => ms == null ? '—' : Math.round(ms / 60_000) + ' ' + t('min')
const range = hour => time(hour.start) + ' – ' + time(hour.end)
const headline = rule => rule.label || (rule.type === 'hour' && rule.planet >= 0 ? name(rule.planet) : t(signalNames[rule.type]))
function countdown(ms) {
    const seconds = Math.ceil(ms / 1000)
    const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    if (!settings.seconds) {
        const minutes = Math.ceil(seconds / 60)
        return [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':')
    }
    return parts.map(n => String(n).padStart(2, '0')).join(':')
}
function placeName() {
    return place.manual ? t('coordinates') : place.name
}
function refreshStrings() {
    document.documentElement.lang = settings.lang
    document.title = t('title')
    for (const node of all('[data-text]')) node.textContent = t(node.dataset.text)
    for (const node of all('[data-label]')) node.setAttribute('aria-label', t(node.dataset.label))
    const choices = [element('option', t('all')), ...planets.map((glyph, i) => element('option', glyph + ' ' + name(i)))]
    choices.forEach((choice, i) => { choice.value = i - 1 })
    $('signal-planet').replaceChildren(...choices)
    $('language').value = settings.lang
    $('time-format').value = settings.format
    $('seconds').checked = settings.seconds
    $('emblem').value = settings.emblem
    drawPlace()
    currentKey = moonKey = tableKey = ''
    renderView()
}
function drawPlace() {
    text('place-name', placeName())
    text('coordinates', place.lat.toFixed(3) + '°, ' + place.lon.toFixed(3) + '°')
}
function showView(next) {
    view = next
    if (view === 'table') tableKey = ''
    for (const node of all('.view')) node.hidden = node.id !== view
    for (const tab of all('[data-view]')) {
        if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page')
        else tab.removeAttribute('aria-current')
    }
    syncBack()
    renderView()
    window.scrollTo(0, 0)
}
function renderView() {
    const now = Date.now()
    if (view === 'now') drawNow(now)
    if (view === 'table') drawTable(now)
    if (view === 'moon') drawLunar(now)
    if (view === 'signals') drawSignals()
}

function drawNow(now) {
    const today = localDate(now, place.zone)
    const day = dayAt(now, place)
    const active = day?.hours.find(hour => hour.start <= now && now < hour.end)
    const key = (day?.date ?? today) + '/' + (active?.index ?? '-')
    if (currentKey !== key) {
        if (currentKey.split('/')[0] !== key.split('/')[0] || !currentKey || currentKey.endsWith('/-') || !active) {
            makePointer = makeDial($('dial'), day, settings.emblem)
        }
        currentKey = key
        text('dial-date', dateLabel(day?.date ?? today))
        text('dial-zone', place.zone)
        text('dial-hour', active ? t(active.night ? 'night' : 'day') + ' · ' + active.number + ' / 12' : '')
        text('glow-glyph', active ? planets[active.planet] : '☉')
        text('current-planet', active ? name(active.planet) : '—')
        text('current-range', active ? range(active) : '')
        $('polar').hidden = Boolean(day)
        $('legend').hidden = !day
        if (!day) text('polar', t('polarDay'))
        text('ruler-name', day ? name(day.ruler) : '—')
        text('ruler-glyph', day ? planets[day.ruler] : '')
        const next = active && (day.hours[active.index + 1] ?? planetaryDay(shiftDate(day.date, 1), place)?.hours[0])
        text('next-hour', next ? planets[next.planet] + ' ' + name(next.planet) + ' · ' + time(next.start) : '—')
        const sun = skyEvents(day?.date ?? today, place)
        renderPairs('sun-readings', [
            [t('sunrise'), time(day?.rise ?? sun.rise)], [t('noon'), time(sun.noon)], [t('sunset'), time(day?.sunset ?? sun.set)],
            [t('dayLength'), duration(day && day.sunset - day.rise)],
            [t('nightLength'), duration(day && day.nextRise - day.sunset)],
            [t('dayHour'), duration(day && (day.sunset - day.rise) / 12)],
            [t('nightHour'), duration(day && (day.nextRise - day.sunset) / 12)]
        ])
    }
    makePointer(now, active?.index)
    text('countdown', active ? countdown(active.end - now) : '—')
    $('count-progress').value = active ? (now - active.start) / (active.end - active.start) : 0
}
function drawTable(now) {
    const day = planetaryDay(date, place)
    const currentHour = day?.hours.find(hour => hour.start <= now && now < hour.end)
    const key = date + '/' + (currentHour?.index ?? '-')
    if (tableKey === key) {
        for (const button of all('.hour-row:not(:disabled)')) {
            if (Number(button.dataset.start) <= now) button.disabled = true
        }
        return
    }
    tableKey = key
    $('table-date').value = date
    if (!day) {
        $('hours').replaceChildren(element('p', t('polarDay'), 'notice'))
        return
    }
    const sections = [false, true].map(night => {
        const group = element('section', null, 'hour-group')
        const list = element('ol', null, 'hour-list')
        group.append(element('h3', t(night ? 'night' : 'day')), list)
        for (const hour of day.hours.filter(item => item.night === night)) {
            const row = element('li')
            const button = element('button', null, 'hour-row')
            button.append(element('span', String(hour.number).padStart(2, '0'), 'hour-num'),
                element('span', planets[hour.planet], 'hour-symbol'), element('span', name(hour.planet)),
                element('span', range(hour) + ' · ' + duration(hour.end - hour.start), 'hour-range'))
            if (currentHour === hour) {
                button.dataset.active = ''
                button.setAttribute('aria-current', 'time')
            }
            button.dataset.start = hour.start
            button.disabled = hour.start <= now
            button.addEventListener('click', () => editSignal(hour))
            row.append(button)
            list.append(row)
        }
        return group
    })
    $('hours').replaceChildren(...sections)
}
function drawLunar(now) {
    const key = localDate(now, place.zone) + '/' + Math.floor(now / 60_000)
    if (moonKey === key) return
    moonKey = key
    const moon = lunarSnapshot(now, place)
    text('moon-date', dateLabel(localDate(now, place.zone)))
    text('phase-name', phaseName(moon.index))
    drawMoon($('moon-disc'), moon)
    const number = new Intl.NumberFormat(settings.lang, {maximumFractionDigits: 1})
    renderPairs('moon-readings', [
        [t('lunarDay'), moon.lunarDay], [t('age'), number.format(moon.age) + ' ' + t('days')],
        [t('illumination'), number.format(moon.illumination * 100) + '%'],
        [t('distance'), number.format(Math.round(moon.distance)) + ' ' + t('km')],
        [t('moonSign'), signName(moon.moonSign)], [t('sunSign'), signName(moon.sunSign)],
        [t('moonrise'), time(moon.rise)], [t('moonset'), time(moon.set)]
    ])
    renderPairs('moon-phases', moon.next.map((ms, i) => [phaseName(i * 2), ms]).sort((a, b) => a[1] - b[1])
        .map(([phase, ms]) => [phase, time(ms, true)]))
}

function syncBack() {
    const active = all('dialog[open]').length > 0 || view !== 'now'
    if (active) tg?.BackButton?.show()
    else tg?.BackButton?.hide()
}
function back() {
    const dialog = all('dialog[open]').at(-1)
    if (dialog) dialog.close()
    else showView('now')
}
function openDialog(id) {
    $(id).showModal()
    syncBack()
}
for (const dialog of all('dialog')) dialog.addEventListener('close', syncBack)
for (const button of all('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close())
for (const button of all('[data-view]')) button.addEventListener('click', () => showView(button.dataset.view))
for (const [id, direction] of [['date-previous', -1], ['date-next', 1]]) {
    $(id).addEventListener('click', () => { date = shiftDate(date, direction); renderView() })
}
$('today').addEventListener('click', () => { date = localDate(Date.now(), place.zone); renderView() })
$('table-date').addEventListener('change', event => {
    if (/^\d{4}-\d\d-\d\d$/.test(event.target.value) && event.target.value >= '1900-01-01' && event.target.value <= '2199-12-31') date = event.target.value
    else event.target.value = date
    renderView()
})
$('table-date').min = '1900-01-01'
$('table-date').max = '2199-12-31'

function setPlace(next) {
    place = next
    save('place', place)
    date = localDate(Date.now(), place.zone)
    $('place-dialog').close()
    refreshStrings()
}
$('place-button').addEventListener('click', () => {
    const form = $('coordinates-form')
    form.elements.lat.value = place.lat
    form.elements.lon.value = place.lon
    form.elements.zone.value = place.zone
    text('coordinates-error', '')
    openDialog('place-dialog')
})
let searchId = 0
let searchTimer
$('place-search').addEventListener('input', event => {
    clearTimeout(searchTimer)
    const id = ++searchId
    const value = event.target.value.trim()
    $('place-results').replaceChildren()
    text('place-status', value.length > 1 ? t('loading') : '')
    if (value.length < 2) return
    searchTimer = setTimeout(async () => {
        try {
            const matches = await searchPlaces(value, settings.lang)
            if (id !== searchId) return
            const countries = new Intl.DisplayNames([settings.lang], {type: 'region'})
            text('place-status', matches.length ? '' : t('emptySearch'))
            $('place-results').replaceChildren(...matches.map(result => {
                const button = element('button', result.name)
                button.append(element('small', ' · ' + [result.region, countries.of(result.country)].filter(Boolean).join(', ')))
                button.addEventListener('click', () => setPlace(result))
                return button
            }))
        } catch {
            if (id === searchId) text('place-status', t('placeError'))
        }
    }, 220)
})
function geolocation() {
    return new Promise((resolve, reject) => {
        const browserLocation = () => {
            if (!navigator.geolocation) { reject(); return }
            navigator.geolocation.getCurrentPosition(({coords}) => resolve([coords.latitude, coords.longitude]), reject, {timeout: 12_000})
        }
        const manager = tg?.initData ? tg.LocationManager : null
        if (!manager) { browserLocation(); return }
        manager.init(() => {
            if (!manager.isLocationAvailable) { browserLocation(); return }
            manager.getLocation(point => {
                if (point) resolve([point.latitude, point.longitude])
                else reject()
            })
        })
    })
}
$('locate').addEventListener('click', async () => {
    $('locate').disabled = true
    text('place-status', t('loading'))
    ++searchId
    $('place-results').replaceChildren()
    try {
        const [lat, lon] = await geolocation()
        let result
        try { result = await nearestPlace(lat, lon, settings.lang) }
        catch { result = {lat, lon, zone: deviceZone, manual: true} }
        text('place-status', '')
        if ($('place-dialog').open) setPlace(result)
    } catch {
        text('place-status', t('locationError'))
    } finally { $('locate').disabled = false }
})
$('coordinates-form').addEventListener('submit', event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const zone = fields.get('zone').trim()
    try { new Intl.DateTimeFormat('en', {timeZone: zone}) }
    catch { text('coordinates-error', t('zoneError')); return }
    setPlace({lat: Number(fields.get('lat')), lon: Number(fields.get('lon')), zone, manual: true})
})
for (const zone of new Set(['UTC', 'Europe/Kyiv', deviceZone, ...(Intl.supportedValuesOf?.('timeZone') ?? [])])) {
    const option = element('option')
    option.value = zone
    $('time-zones').append(option)
}
$('settings-button').addEventListener('click', () => openDialog('settings-dialog'))
for (const [id, key] of [['language', 'lang'], ['time-format', 'format'], ['seconds', 'seconds'], ['emblem', 'emblem']]) {
    $(id).addEventListener('change', event => {
        settings[key] = key === 'seconds' ? event.target.checked : event.target.value
        save('settings', settings)
        refreshStrings()
    })
}

let rules = load('signals', [])
let selectedHour
let alarm
let audio
let soundTimer
let alarmQueue = []
function unlockAudio() {
    try {
        const Audio = window.AudioContext ?? window.webkitAudioContext
        if (Audio) {
            audio ??= new Audio()
            audio.resume().catch(() => {})
        }
    } catch { /* The visual signal still works. */ }
}
document.addEventListener('pointerdown', unlockAudio, {passive: true})
document.addEventListener('keydown', unlockAudio)
function beep() {
    if (audio?.state !== 'running') return
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    const start = audio.currentTime
    oscillator.frequency.setValueAtTime(660, start)
    oscillator.frequency.setValueAtTime(880, start + .14)
    gain.gain.setValueAtTime(.16, start)
    gain.gain.exponentialRampToValueAtTime(.001, start + .38)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(start + .4)
}
function presentAlarm(rule) {
    if (alarm) { alarmQueue.push(rule); return }
    alarm = rule
    text('alarm-title', t('signalDue') + ' · ' + headline(rule))
    $('alarm-banner').hidden = false
    if (rule.ring) {
        beep()
        soundTimer = setInterval(beep, 1100)
        navigator.vibrate?.([300, 150, 300])
    } else { tg?.HapticFeedback?.notificationOccurred('warning') }
}
function stopAlarm(snooze) {
    if (!alarm) return
    clearInterval(soundTimer)
    $('alarm-banner').hidden = true
    navigator.vibrate?.(0)
    if (snooze) {
        const next = Date.now() + 300_000
        rules.push({...alarm, id: crypto.randomUUID(), type: 'fixed', label: headline(alarm), fixed: next, next, repeat: 'once', offset: 0})
        storeRules()
    }
    alarm = null
    if (alarmQueue.length) presentAlarm(alarmQueue.shift())
}
function storeRules() {
    save('signals', rules)
    if (view === 'signals') drawSignals()
}
function drawSignals() {
    if (!rules.length) {
        $('signal-list').replaceChildren(element('p', t('noSignals'), 'muted'))
        return
    }
    $('signal-list').replaceChildren(...[...rules].sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity)).map(rule => {
        const row = element('div', null, 'signal-item')
        const copy = element('div')
        const meta = [rule.next == null ? t('signalMissed') : time(rule.next, true, rule.place.zone), t(rule.repeat), rule.place.manual ? t('coordinates') : rule.place.name]
        copy.append(element('strong', headline(rule)), element('p', meta.join(' · '), 'mono'))
        const remove = element('button', t('remove'))
        remove.addEventListener('click', () => { rules = rules.filter(item => item.id !== rule.id); storeRules() })
        row.append(copy, remove)
        return row
    }))
}
function signalFields() {
    const form = $('signal-form')
    const type = form.elements.type.value
    $('hour-fields').hidden = type !== 'hour'
    $('clock-field').hidden = type !== 'clock'
    form.elements.repeat.disabled = type === 'fixed'
    form.elements.time.required = type === 'clock'
}
function editSignal(hour = null) {
    const form = $('signal-form')
    form.reset()
    selectedHour = hour
    $('signal-type').querySelector('[value="fixed"]').hidden = !hour
    if (hour) {
        form.elements.type.value = 'fixed'
        form.elements.label.value = name(hour.planet) + ' · ' + time(hour.start)
    }
    text('signal-error', '')
    signalFields()
    openDialog('signal-dialog')
}
$('add-signal').addEventListener('click', () => editSignal())
$('signal-type').addEventListener('change', signalFields)
$('signal-form').addEventListener('submit', event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const rule = {
        id: crypto.randomUUID(), place, label: fields.get('label').trim(), type: fields.get('type'),
        offset: Number(fields.get('offset')), planet: Number(fields.get('planet')), half: fields.get('half'),
        time: fields.get('time'), ring: fields.has('ring'), repeat: fields.get('repeat') ?? 'once',
        fixed: selectedHour?.start
    }
    schedule(rule, Date.now())
    if (rule.next == null && rule.repeat === 'once') { text('signal-error', t('noEvent')); return }
    rules.push(rule)
    storeRules()
    $('signal-dialog').close()
    showView('signals')
})
$('alarm-stop').addEventListener('click', () => stopAlarm(false))
$('alarm-snooze').addEventListener('click', () => stopAlarm(true))
function schedule(rule, now, afterDate) {
    const next = nextSignal(rule, rule.place, now, afterDate)
    rule.lastDate = afterDate
    rule.next = next?.time ?? null
    rule.nextDate = next?.date
}
let retryDate
function tick() {
    if (document.hidden) return
    const now = Date.now()
    const dateKey = new Date(now).toISOString().slice(0, 10)
    let changed = false
    for (const rule of [...rules]) {
        if (rule.next != null && rule.next <= now) {
            if (now - rule.next < 90_000) presentAlarm(rule)
            if (rule.repeat !== 'once') schedule(rule, now, rule.repeat === 'daily' ? rule.nextDate : undefined)
            else rules = rules.filter(item => item.id !== rule.id)
            changed = true
        } else if (rule.next == null && retryDate !== dateKey) {
            schedule(rule, now, rule.lastDate)
            changed ||= rule.next != null
        }
    }
    retryDate = dateKey
    if (changed) storeRules()
    if (view !== 'signals') renderView()
}

if (tg?.initData) {
    tg.ready()
    tg.expand()
    if (!tg.isVersionAtLeast || tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()
    if (tg.isVersionAtLeast?.('6.9')) tg.setHeaderColor?.('#050505')
    else tg.setHeaderColor?.('bg_color')
    tg.setBackgroundColor?.('#050505')
    tg.BackButton?.onClick(back)
    if (tg.openTelegramLink) {
        for (const link of all('[data-telegram]')) {
            link.addEventListener('click', event => {
                event.preventDefault()
                tg.openTelegramLink(link.href)
            })
        }
    }
    const safeArea = () => document.documentElement.style.setProperty('--tg-top', (tg.contentSafeAreaInset?.top || 0) + 'px')
    safeArea()
    tg.onEvent?.('contentSafeAreaChanged', safeArea)
}
animateSky($('stars'))
refreshStrings()
tick()
setInterval(tick, 500)
document.addEventListener('visibilitychange', tick)
