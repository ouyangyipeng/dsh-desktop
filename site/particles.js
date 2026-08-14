const canvas = document.querySelector('#particle-field')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const context = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d', { alpha: true }) : null
let particles = []
let frame = 0
let previous = 0

function resize() {
  if (!context || !(canvas instanceof HTMLCanvasElement)) return
  const ratio = Math.min(window.devicePixelRatio || 1, 1.7)
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = Math.floor(width * ratio)
  canvas.height = Math.floor(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const capability = Math.max(0.45, Math.min(1, (navigator.hardwareConcurrency || 4) / 8))
  const count = Math.min(120, Math.max(28, Math.floor((width * height) / 22000 * capability)))
  particles = Array.from({ length: count }, (_, index) => ({
    x: hash(index * 13.17) * width,
    y: hash(index * 29.41) * height,
    radius: 0.45 + hash(index * 7.73) * 1.15,
    drift: 3 + hash(index * 17.91) * 9,
    phase: hash(index * 47.3) * Math.PI * 2,
    alpha: 0.12 + hash(index * 5.11) * 0.45,
  }))
}

function draw(time) {
  if (!context || !(canvas instanceof HTMLCanvasElement) || reduceMotion.matches || document.hidden) return
  const delta = Math.min(40, time - previous || 16)
  previous = time
  context.clearRect(0, 0, window.innerWidth, window.innerHeight)
  for (const particle of particles) {
    particle.y -= particle.drift * delta / 1000
    if (particle.y < -8) particle.y = window.innerHeight + 8
    const x = particle.x + Math.sin(time / 4200 + particle.phase) * 12
    context.beginPath()
    context.arc(x, particle.y, particle.radius, 0, Math.PI * 2)
    context.fillStyle = `rgba(160, 205, 244, ${particle.alpha})`
    context.fill()
  }
  frame = window.requestAnimationFrame(draw)
}

function restart() {
  window.cancelAnimationFrame(frame)
  context?.clearRect(0, 0, window.innerWidth, window.innerHeight)
  if (!reduceMotion.matches && !document.hidden) frame = window.requestAnimationFrame(draw)
}

function hash(value) {
  const x = Math.sin(value) * 43758.5453
  return x - Math.floor(x)
}

if (context && canvas instanceof HTMLCanvasElement) {
  resize()
  restart()
  window.addEventListener('resize', () => { resize(); restart() }, { passive: true })
  document.addEventListener('visibilitychange', restart)
  reduceMotion.addEventListener('change', restart)
}
