// Meeus chapters 25, 47 and 49, ported from Planetary hours (Astro.kt).
const {sin, cos, tan, asin, atan2, acos} = Math
const DEG = Math.PI / 180
export const DAY = 86_400_000
export const SUN_HORIZON = -0.833
export const wrap = degrees => ((degrees % 360) + 360) % 360
const julian = ms => ms / DAY + 2440587.5
const deltaT = jd => {
    const t = (jd - 2451545) / 365.25
    return 62.92 + 0.32217 * t + 0.005589 * t * t
}
const centuriesTT = jd => (jd + deltaT(jd) / 86400 - 2451545) / 36525
const obliquity = t => (23.4392911 - 0.0130042 * t - 1.64e-7 * t ** 2 + 5.04e-7 * t ** 3) * DEG

function sun(ms) {
    const t = centuriesTT(julian(ms))
    const l0 = wrap(280.46646 + 36000.76983 * t + 0.0003032 * t ** 2)
    const m = wrap(357.52911 + 35999.05029 * t - 0.0001537 * t ** 2) * DEG
    const c = (1.914602 - 0.004817 * t - 0.000014 * t ** 2) * sin(m)
        + (0.019993 - 0.000101 * t) * sin(2 * m) + 0.000289 * sin(3 * m)
    const omega = (125.04 - 1934.136 * t) * DEG
    const lon = wrap(l0 + c - 0.00569 - 0.00478 * sin(omega))
    const lambda = lon * DEG
    const eps = obliquity(t) + 0.00256 * DEG * cos(omega)
    const dist = (1.000140612 - 0.016708617 * cos(m) - 0.000139589 * cos(2 * m)) * 149_597_870.7
    return {lon, ra: atan2(cos(eps) * sin(lambda), cos(lambda)), dec: asin(sin(eps) * sin(lambda)), dist}
}

function moon(ms) {
    const t = centuriesTT(julian(ms))

    const lp = wrap(218.3164477 + 481267.88123421 * t - 0.0015786 * t * t)
    const d = wrap(297.8501921 + 445267.1114034 * t - 0.0018819 * t * t) * DEG
    const m = wrap(357.5291092 + 35999.0502909 * t - 0.0001536 * t * t) * DEG
    const mp = wrap(134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) * DEG
    const f = wrap(93.2720950 + 483202.0175233 * t - 0.0036539 * t * t) * DEG

    const lonSum =
        6288.016 * sin(mp) +
            1274.242 * sin(2 * d - mp) +
            658.314 * sin(2 * d) +
            214.818 * sin(2 * mp) +
            -185.116 * sin(m) +
            -114.332 * sin(2 * f) +
            58.793 * sin(2 * d - 2 * mp) +
            57.066 * sin(2 * d - m - mp) +
            53.322 * sin(2 * d + mp) +
            45.758 * sin(2 * d - m) +
            -40.923 * sin(m - mp) +
            -34.720 * sin(d) +
            -30.383 * sin(m + mp) +
            15.327 * sin(2 * d - 2 * f) +
            -12.528 * sin(mp + 2 * f) +
            10.980 * sin(mp - 2 * f) +
            10.675 * sin(4 * d - mp) +
            10.034 * sin(3 * mp) +
            8.548 * sin(4 * d - 2 * mp) +
            -7.888 * sin(2 * d + m - mp) +
            -6.766 * sin(2 * d + m) +
            -5.163 * sin(d - mp) +
            4.987 * sin(d + m) +
            4.036 * sin(2 * d - m + mp) +
            3.994 * sin(2 * d + 2 * mp) +
            3.861 * sin(4 * d) +
            3.665 * sin(2 * d - 3 * mp)

    const latSum =
        5128.122 * sin(f) +
            280.602 * sin(mp + f) +
            277.693 * sin(mp - f) +
            173.237 * sin(2 * d - f) +
            55.413 * sin(2 * d - mp + f) +
            46.271 * sin(2 * d - mp - f) +
            32.573 * sin(2 * d + f) +
            17.198 * sin(2 * mp + f) +
            9.266 * sin(2 * d + mp - f) +
            8.822 * sin(2 * mp - f) +
            8.216 * sin(2 * d - m - f) +
            4.324 * sin(2 * d - 2 * mp - f) +
            4.200 * sin(2 * d + mp + f)

    // Meeus tabulates the radius series in metres; these coefficients are
    // already divided by a thousand, so the sum is in kilometres.
    const distSum =
        -20905.355 * cos(mp) +
            -3699.111 * cos(2 * d - mp) +
            -2955.968 * cos(2 * d) +
            -569.925 * cos(2 * mp) +
            48.888 * cos(m) +
            -3.149 * cos(2 * f) +
            246.158 * cos(2 * d - 2 * mp) +
            -152.138 * cos(2 * d - m - mp) +
            -170.733 * cos(2 * d + mp) +
            -204.586 * cos(2 * d - m) +
            -129.620 * cos(m - mp) +
            108.743 * cos(d) +
            104.755 * cos(m + mp) +
            79.661 * cos(mp - 2 * f) +
            -34.782 * cos(4 * d) +
            -23.210 * cos(3 * mp) +
            -21.636 * cos(4 * d - mp) +
            -16.675 * cos(d - m) +
            -16.100 * cos(m + 2 * mp) +
            14.019 * cos(2 * d - 2 * m) +
            -12.710 * cos(2 * mp + 2 * f) +
            -10.980 * cos(m - 2 * mp)

    const lon = wrap(lp + lonSum / 1000.0)
    const lat = latSum / 1000.0
    const dist = 385000.56 + distSum

    const eps = obliquity(t)
    const lr = lon * DEG
    const br = lat * DEG
    const ra = atan2(sin(lr) * cos(eps) - tan(br) * sin(eps), cos(lr))
    const dec = asin(sin(br) * cos(eps) + cos(br) * sin(eps) * sin(lr))
    return {lon, dist, ra, dec}
}

function phaseJulian(k) {
    const t = k / 1236.85
    const e = 1 - 0.002516 * t - 0.0000074 * t * t
    const m = (2.5534 + 29.10535670 * k - 0.0000014 * t * t) * DEG
    const mp = (201.5643 + 385.81693528 * k + 0.0107582 * t * t) * DEG
    const f = (160.7108 + 390.67050284 * k - 0.0016118 * t * t) * DEG
    const omega = (124.7746 - 1.56375588 * k + 0.0020672 * t * t) * DEG

    let jde = 2451550.09766 + 29.530588861 * k +
        0.00015437 * t * t - 0.000000150 * t * t * t + 0.00000000073 * t * t * t * t

    const quarter = ((k % 1.0) + 1.0) % 1.0
    
        if (quarter === 0) {
            jde += -0.40720 * sin(mp) +
                0.17241 * e * sin(m) +
                0.01608 * sin(2 * mp) +
                0.01039 * sin(2 * f) +
                0.00739 * e * sin(mp - m) +
                -0.00514 * e * sin(mp + m) +
                0.00208 * e * e * sin(2 * m) +
                -0.00111 * sin(mp - 2 * f) +
                -0.00057 * sin(mp + 2 * f) +
                0.00056 * e * sin(2 * mp + m) +
                -0.00042 * sin(3 * mp) +
                0.00042 * e * sin(m + 2 * f) +
                0.00038 * e * sin(m - 2 * f) +
                -0.00024 * e * sin(2 * mp - m) +
                -0.00017 * sin(omega)

        } else if (quarter === 0.5) {
            jde += -0.40614 * sin(mp) +
                0.17302 * e * sin(m) +
                0.01614 * sin(2 * mp) +
                0.01043 * sin(2 * f) +
                0.00734 * e * sin(mp - m) +
                -0.00515 * e * sin(mp + m) +
                0.00209 * e * e * sin(2 * m) +
                -0.00111 * sin(mp - 2 * f) +
                -0.00057 * sin(mp + 2 * f) +
                0.00056 * e * sin(2 * mp + m) +
                -0.00042 * sin(3 * mp) +
                0.00042 * e * sin(m + 2 * f) +
                0.00038 * e * sin(m - 2 * f) +
                -0.00024 * e * sin(2 * mp - m) +
                -0.00017 * sin(omega)

        } else {
            jde += -0.62801 * sin(mp) +
                0.17172 * e * sin(m) +
                -0.01183 * e * sin(mp + m) +
                0.00862 * sin(2 * mp) +
                0.00804 * sin(2 * f) +
                0.00454 * e * sin(mp - m) +
                0.00204 * e * e * sin(2 * m) +
                -0.00180 * sin(mp - 2 * f) +
                -0.00070 * sin(mp + 2 * f) +
                -0.00040 * sin(3 * mp) +
                -0.00034 * e * sin(2 * mp + m) +
                0.00032 * e * sin(m + 2 * f) +
                0.00032 * e * sin(m - 2 * f) +
                -0.00028 * e * e * sin(mp + 2 * m) +
                0.00027 * e * sin(2 * mp - m) +
                -0.00017 * sin(omega) +
                -0.00005 * sin(mp - m - 2 * f) +
                0.00004 * sin(2 * mp + 2 * f) +
                -0.00004 * sin(mp + m + 2 * f) +
                0.00004 * sin(mp - 2 * m) +
                0.00003 * sin(mp + m - 2 * f) +
                0.00003 * sin(3 * m) +
                0.00002 * sin(2 * mp - 2 * f) +
                0.00002 * sin(mp - m + 2 * f) +
                -0.00002 * sin(3 * mp + m)
            const w = 0.00306 - 0.00038 * e * cos(m) + 0.00026 * cos(mp) -
                0.00002 * cos(mp - m) + 0.00002 * cos(mp + m) + 0.00002 * cos(2 * f)
            jde += quarter < 0.5 ? w : -w
        }
    return jde + planetaryCorrections(k, t)
}

function planetaryCorrections(k, t) {
    const a = [
        299.77 + 0.107408 * k - 0.009173 * t * t,
        251.88 + 0.016321 * k,
        251.83 + 26.651886 * k,
        349.42 + 36.412478 * k,
        84.66 + 18.206239 * k,
        141.74 + 53.303771 * k,
        207.14 + 2.453732 * k,
        154.84 + 7.306860 * k,
        34.52 + 27.261239 * k,
        207.19 + 0.121824 * k,
        291.34 + 1.844379 * k,
        161.72 + 24.198154 * k,
        239.56 + 25.513099 * k,
        331.55 + 3.592518 * k
    ]
    const c = [
        0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060,
        0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023
    ]
    return a.reduce((sum, value, i) => sum + c[i] * sin(value * DEG), 0)
}

function altitude(body, ms, {lat, lon}) {
    const d = julian(ms) - 2451545
    const t = d / 36525
    const gmst = wrap(280.46061837 + 360.98564736629 * d + 0.000387933 * t ** 2 - t ** 3 / 38_710_000)
    const hour = (gmst + lon) * DEG - body.ra
    const phi = lat * DEG
    return asin(sin(phi) * sin(body.dec) + cos(phi) * cos(body.dec) * cos(hour)) / DEG
}
export const sunAltitude = (ms, place) => altitude(sun(ms), ms, place)
export function moonAltitude(ms, place) {
    const body = moon(ms)
    return altitude(body, ms, place) - (0.7275 * asin(6378.14 / body.dist) / DEG - 0.5667)
}
const phaseTime = k => {
    const jde = phaseJulian(k)
    return Math.round((jde - deltaT(jde) / 86400 - 2440587.5) * DAY)
}
export function phases(ms) {
    const base = Math.floor((julian(ms) - 2451550.09766) / 29.530588861)
    const candidates = [base - 1, base, base + 1, base + 2]
    return {
        previous: candidates.map(phaseTime).reverse().find(time => time <= ms),
        next: [0, 0.25, 0.5, 0.75].map(q => candidates.map(k => phaseTime(k + q)).find(time => time > ms))
    }
}
export function moonPhase(ms) {
    const lunar = moon(ms)
    const solar = sun(ms)
    const elongation = wrap(lunar.lon - solar.lon)
    const dot = sin(solar.dec) * sin(lunar.dec) + cos(solar.dec) * cos(lunar.dec) * cos(solar.ra - lunar.ra)
    const psi = acos(Math.min(1, Math.max(-1, dot)))
    const angle = atan2(solar.dist * sin(psi), lunar.dist - solar.dist * cos(psi))
    const index = [7, 83, 97, 173, 187, 263, 277, 353, 361].findIndex(n => elongation < n) % 8
    return {
        illumination: (1 + cos(angle)) / 2, waxing: elongation < 180,
        index, distance: lunar.dist, moonSign: Math.floor(lunar.lon / 30), sunSign: Math.floor(solar.lon / 30)
    }
}
