import {planets} from './clock.mjs'

const ns = 'http://www.w3.org/2000/svg'
const tau = 2 * Math.PI
const center = 230
const polar = (r, turn) => [center + r * Math.sin(turn * tau), center - r * Math.cos(turn * tau)]
const point = (r, turn) => polar(r, turn).map(n => n.toFixed(2)).join(' ')
const arc = (r, first, last) => ['M', point(r, first), 'A', r, r, 0, Number(last - first > .5), 1, point(r, last)].join(' ')

function svg(parent, type, attributes, text) {
    const el = document.createElementNS(ns, type)
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value)
    if (text != null) el.textContent = text
    parent.append(el)
    return el
}
function ring(parent, radius, attrs) {
    return svg(parent, 'circle', {cx: center, cy: center, r: radius, fill: 'none', ...attrs})
}
function line(parent, start, end, turn, attrs) {
    const [x1, y1] = polar(start, turn)
    const [x2, y2] = polar(end, turn)
    return svg(parent, 'line', {x1, y1, x2, y2, ...attrs})
}

export function makeDial(element, day, emblem) {
    element.replaceChildren()
    const defs = svg(element, 'defs', {})
    const metal = svg(defs, 'linearGradient', {id: 'metal', x1: '0%', y1: '0%', x2: '90%', y2: '100%'})
    for (const [offset, color] of [['0%', '#343434'], ['27%', '#b3b3b3'], ['49%', '#484848'], ['76%', '#969696'], ['100%', '#353535']]) {
        svg(metal, 'stop', {offset, 'stop-color': color})
    }
    const glass = svg(defs, 'radialGradient', {id: 'glass'})
    for (const [offset, color] of [['0%', '#202020'], ['64%', '#101010'], ['100%', '#080808']]) {
        svg(glass, 'stop', {offset, 'stop-color': color})
    }
    const disc = svg(element, 'g', {})
    ring(disc, 200, {fill: 'url(#glass)', stroke: '#4b4b4b', 'stroke-width': 4})
    for (const [radius, width] of [[212, .65], [205, 1.5], [194, .8], [187, .6], [151, .8], [140, 1], [127, .7], [116, .55]]) {
        ring(disc, radius, {stroke: 'url(#metal)', 'stroke-width': width})
    }
    for (let i = 0; i < 120; i++) {
        const major = i % 5 === 0
        line(disc, major ? 197 : 200, 204, i / 120, {stroke: major ? '#c1c1c1' : '#686868', 'stroke-width': major ? 1.4 : .65})
    }
    const ornaments = svg(disc, 'g', {fill: 'none', stroke: '#828282', 'stroke-opacity': .29})
    for (let i = 0; i < 4; i++) {
        svg(ornaments, 'path', {d: 'M' + point(218, i / 4) + ' L' + point(213, i / 4 + .006) + ' L' + point(208, i / 4) + ' L' + point(213, i / 4 - .006) + ' Z', fill: '#d01722', 'stroke-opacity': 1})
    }
    if (emblem !== 'none') {
        const mark = svg(ornaments, 'image', {class: 'dial-emblem', href: 'data/' + emblem + '.svg', x: 121, y: 121, width: 218, height: 218, opacity: .36})
        mark.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    }
    if (!day) return () => {}
    const duration = day.nextRise - day.rise
    const fraction = time => (time - day.rise) / duration
    const segments = day.hours.map(hour => {
        const start = fraction(hour.start)
        const end = fraction(hour.end)
        const path = arc(169, start + .0017, end - .0017)
        const segment = svg(disc, 'path', {d: path, fill: 'none', 'stroke-width': 33})
        line(disc, 143, 152, start, {stroke: hour.night ? '#555555' : '#bdbdbd', 'stroke-width': .9})
        const [x, y] = polar(169, (start + end) / 2)
        const glyph = svg(disc, 'text', {x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': '"Segoe UI Symbol", "DejaVu Sans", serif', 'font-size': 19, 'pointer-events': 'none'}, planets[hour.planet])
        return {segment, glyph, night: hour.night}
    })
    const pointer = svg(disc, 'g', {})
    svg(pointer, 'path', {d: 'M226 34 L230 44 L234 34 Z', fill: '#ed242d'})
    svg(pointer, 'path', {d: 'M230 44 V90', stroke: '#ed242d', 'stroke-width': 1.65, style: 'filter:drop-shadow(0 0 4px #b50a16)'})
    svg(pointer, 'circle', {cx: 230, cy: 90, r: 3.5, fill: '#ed242d'})
    let lastIndex
    return (now, activeIndex) => {
        if (lastIndex !== activeIndex) {
            for (const [index, {segment, glyph, night}] of segments.entries()) {
                const active = index === activeIndex
                segment.setAttribute('stroke', active ? '#a80c17' : night ? '#303030' : '#ffffff')
                glyph.setAttribute('fill', active ? '#ffffff' : night ? '#d2d2d2' : '#191416')
            }
            lastIndex = activeIndex
        }
        pointer.setAttribute('transform', 'rotate(' + (fraction(now) * 360) + ' 230 230)')
    }
}

function randomGenerator(seed) {
    return () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
        return seed / 4294967296
    }
}

export function animateSky(canvas) {
    const ctx = canvas.getContext('2d')
    const random = randomGenerator(72)
    const stars = Array.from({length: 150}, () => [random(), random(), random(), random()])
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    function resize() {
        const scale = Math.min(devicePixelRatio || 1, 2)
        canvas.width = Math.round(canvas.clientWidth * scale)
        canvas.height = Math.round(canvas.clientHeight * scale)
    }
    function draw(ms) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        for (const [x, y, size, pulse] of stars) {
            const brightness = reduced.matches ? .35 : .36 + .25 * Math.sin(ms / 950 + pulse * tau)
            ctx.fillStyle = (pulse < .065 ? 'rgba(199,19,29,' : 'rgba(224,224,224,') + brightness + ')'
            const radius = 1 + size * 2.3
            ctx.fillRect(x * canvas.width, y * canvas.height, radius, radius)
        }
    }
    resize()
    addEventListener('resize', () => { resize(); draw(performance.now()) })
    draw(0)
    setInterval(() => { if (!document.hidden && !reduced.matches) draw(performance.now()) }, 110)
}

const craters = (() => {
    const rng = randomGenerator(719)
    return Array.from({length: 80}, () => [rng() * 2 - 1, rng() * 2 - 1, .018 + rng() ** 2 * .14])
})()

export function drawMoon(canvas, phase) {
    const ctx = canvas.getContext('2d')
    const size = canvas.width
    const px = ctx.createImageData(size, size)
    const r = size * .425
    const toward = phase.illumination * 2 - 1
    const across = Math.sqrt(1 - toward ** 2) * (phase.waxing ? 1 : -1)
    const rng = randomGenerator(42)
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x - size / 2) / r
            const v = (y - size / 2) / r
            const d = Math.hypot(u, v)
            if (d > 1) continue
            const z = Math.sqrt(1 - d * d)
            const sun = u * across + z * toward
            const texture = 10 * Math.sin(10 * u + 4 * v) + 9 * Math.sin(18 * v - 10 * u + 3 * Math.sin(12 * u)) + 17 * Math.sin(u * 4 - v * 5) + rng() * 15
            let relief = 0
            for (const [cx, cy, scale] of craters) {
                const delta = ((u - cx) ** 2 + (v - cy) ** 2) / scale ** 2
                if (delta < 1.8) relief += delta < .68 ? -19 : 16 * (u - cx) / scale
            }
            const light = Math.max(0, sun)
            const material = Math.max(0, 170 + texture + relief)
            const color = 10 + .15 * texture + material * (Math.min(1, light * 17) * .40 + light * .60)
            const i = (y * size + x) * 4
            px.data[i] = color
            px.data[i + 1] = color
            px.data[i + 2] = color
            px.data[i + 3] = Math.min(255, (1 - d) * r * 255)
        }
    }
    ctx.putImageData(px, 0, 0)
    ctx.strokeStyle = '#797979'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r + 5, 0, tau)
    ctx.stroke()
    ctx.strokeStyle = '#464646'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, r + 13, 0, tau)
    ctx.stroke()
}
