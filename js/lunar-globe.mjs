import * as THREE from './three-0.160.0.mjs'

const EARTH_VIEW = -Math.PI / 2
const START_ZOOM = 1
const clampZoom = value => Math.max(.9, Math.min(3.1, value))

export async function createLunarGlobe(stage, onContextLost) {
    const loader = new THREE.TextureLoader()
    const [surface, elevation] = await Promise.all([
        loader.loadAsync(new URL('../data/moon-color.jpg', import.meta.url).href),
        loader.loadAsync(new URL('../data/moon-height.jpg', import.meta.url).href)
    ])
    let renderer
    try {
        renderer = new THREE.WebGLRenderer({alpha: true, antialias: true})
    } catch (error) {
        surface.dispose()
        elevation.dispose()
        throw error
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0, 0)
    surface.colorSpace = THREE.SRGBColorSpace
    surface.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, .1, 50)
    camera.position.z = 5
    const geometry = new THREE.SphereGeometry(1, 96, 64)
    const material = new THREE.MeshStandardMaterial({
        map: surface, bumpMap: elevation, bumpScale: .018, roughness: 1, metalness: 0
    })
    const moon = new THREE.Mesh(geometry, material)
    moon.rotation.y = EARTH_VIEW
    scene.add(moon)
    const sunlight = new THREE.DirectionalLight(0xfff3e7, 2.6)
    sunlight.position.set(0, 0, 1)
    scene.add(sunlight, new THREE.AmbientLight(0xc8d5ec, .18))
    stage.prepend(renderer.domElement)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.className = 'moon-globe-canvas'

    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const aroundX = new THREE.Vector3(1, 0, 0)
    const aroundY = new THREE.Vector3(0, 1, 0)
    const contacts = new Map()
    let frame = 0
    let motionX = 0
    let motionY = 0
    let stopped = false

    function rotate(dx, dy) {
        moon.rotateOnWorldAxis(aroundY, dx)
        moon.rotateOnWorldAxis(aroundX, dy)
    }
    function draw() {
        frame = 0
        if (stopped || !stage.clientWidth) {
            motionX = motionY = 0
            return
        }
        if (!contacts.size && !reduced.matches && Math.hypot(motionX, motionY) > .002) {
            rotate(motionX, motionY)
            motionX *= .86
            motionY *= .86
            requestDraw()
        }
        renderer.render(scene, camera)
    }
    function requestDraw() {
        if (!stopped && !frame) frame = requestAnimationFrame(draw)
    }
    function resize() {
        if (!stage.clientWidth) return
        const {clientWidth: width, clientHeight: height} = stage
        if (!height) return
        const ratio = width / height
        camera.left = -1.35 * Math.max(1, ratio)
        camera.right = -camera.left
        camera.top = 1.35 * Math.max(1, 1 / ratio)
        camera.bottom = -camera.top
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
        requestDraw()
    }

    function zoom(factor) {
        camera.zoom = clampZoom(camera.zoom * factor)
        camera.updateProjectionMatrix()
        requestDraw()
    }
    function selectPhase({illumination, waxing}) {
        const toward = THREE.MathUtils.clamp(illumination * 2 - 1, -1, 1)
        sunlight.position.set((waxing ? 1 : -1) * Math.sqrt(1 - toward ** 2), 0, toward)
        requestDraw()
    }
    function reset() {
        motionX = motionY = 0
        moon.rotation.set(0, EARTH_VIEW, 0)
        camera.zoom = START_ZOOM
        camera.updateProjectionMatrix()
        requestDraw()
    }
    const point = e => ({x: e.clientX, y: e.clientY})
    const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

    stage.addEventListener('pointerdown', event => {
        if (stopped || event.button !== 0 || contacts.size >= 2) return
        motionX = motionY = 0
        contacts.set(event.pointerId, point(event))
        stage.setPointerCapture(event.pointerId)
        stage.dataset.dragging = ''
    })
    stage.addEventListener('pointermove', event => {
        const previous = contacts.get(event.pointerId)
        if (!previous || stopped) return
        const current = point(event)
        contacts.set(event.pointerId, current)
        if (contacts.size === 2) {
            const other = [...contacts].find(([id]) => id !== event.pointerId)[1]
            const before = gap(previous, other)
            if (before > 0) zoom(gap(current, other) / before)
            return
        }
        const scale = 3.1 / stage.clientWidth
        motionX = (current.x - previous.x) * scale
        motionY = (current.y - previous.y) * scale
        rotate(motionX, motionY)
        requestDraw()
    })
    function release(event) {
        if (contacts.delete(event.pointerId) && !contacts.size) {
            delete stage.dataset.dragging
            requestDraw()
        }
    }
    stage.addEventListener('pointerup', release)
    stage.addEventListener('pointercancel', release)
    stage.addEventListener('lostpointercapture', release)
    stage.addEventListener('wheel', event => {
        if (stopped) return
        event.preventDefault()
        const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1
        zoom(Math.exp(-THREE.MathUtils.clamp(event.deltaY * units, -180, 180) * .003))
    }, {passive: false})
    stage.addEventListener('keydown', event => {
        if (stopped) return
        const direction = {ArrowLeft: [-.14, 0], ArrowRight: [.14, 0],
            ArrowUp: [0, -.14], ArrowDown: [0, .14]}[event.key]
        if (direction) rotate(...direction)
        else if (event.key === '+' || event.key === '=') zoom(1.2)
        else if (event.key === '-') zoom(1 / 1.2)
        else if (event.key === '0') reset()
        else return
        event.preventDefault()
        requestDraw()
    })
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    renderer.domElement.addEventListener('webglcontextlost', () => {
        stopped = true
        cancelAnimationFrame(frame)
        observer.disconnect()
        contacts.clear()
        delete stage.dataset.dragging
        renderer.domElement.remove()
        renderer.dispose()
        geometry.dispose()
        material.dispose()
        surface.dispose()
        elevation.dispose()
        onContextLost()
    }, {once: true})
    resize()
    return {selectPhase, zoom, reset}
}
