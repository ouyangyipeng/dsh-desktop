const canvas = document.querySelector('#particle-field')
const context = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d', { alpha: true }) : null
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const coarsePointer = window.matchMedia('(pointer: coarse)')
const pointer = { x: -1000, y: -1000, previousX: -1000, previousY: -1000, deltaX: 0, deltaY: 0, velocity: 0, active: false }
const wakeParticles = []
let particles = []; let frame = 0; let previous = 0; let width = innerWidth; let height = innerHeight
const debug = { pointerEvents: 0, wakeCount: 0, lastVelocity: 0 }
Object.defineProperty(window, '__dshDesktopMotionDebug', { value: debug, writable: false })

function hash(value) { const number = Math.sin(value) * 43758.5453; return number - Math.floor(number) }
function resize() {
  if (!context || !(canvas instanceof HTMLCanvasElement)) return
  width = innerWidth; height = innerHeight
  const ratio = Math.min(devicePixelRatio || 1, 1.75)
  canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio)
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const count = Math.min(110, Math.max(32, Math.floor(width * height / 24000)))
  particles = Array.from({ length: count }, (_, index) => ({ x: hash(index * 13.17) * width, y: hash(index * 29.41) * height, baseX: hash(index * 13.17) * width, baseY: hash(index * 29.41) * height, vx: 0, vy: 0, radius: .5 + hash(index * 7.7), alpha: .1 + hash(index * 5.1) * .35 }))
}
function move(event) {
  const dx = event.clientX - pointer.previousX; const dy = event.clientY - pointer.previousY
  pointer.deltaX = pointer.active ? dx : 0; pointer.deltaY = pointer.active ? dy : 0
  pointer.velocity = Math.min(55, pointer.velocity * .35 + (pointer.active ? Math.hypot(dx, dy) : 0) * .65)
  pointer.x = pointer.previousX = event.clientX; pointer.y = pointer.previousY = event.clientY; pointer.active = true
  debug.pointerEvents += 1; debug.lastVelocity = Number(pointer.velocity.toFixed(2))
  if (pointer.velocity > 2 && !reduceMotion.matches && !coarsePointer.matches) spawnWake()
}
function spawnWake() {
  const count = Math.min(4, Math.max(1, Math.round(pointer.velocity / 12)))
  for (let index = 0; index < count && wakeParticles.length < 70; index++) wakeParticles.push({ x: pointer.x, y: pointer.y, vx: -pointer.deltaX * .04 + (hash(index + debug.pointerEvents) - .5) * .3, vy: -pointer.deltaY * .04, life: 1 })
  debug.wakeCount = wakeParticles.length
}
function draw(time) {
  if (!context || document.hidden) return
  const delta = Math.min(34, time - previous || 16); previous = time; context.clearRect(0, 0, width, height)
  for (const particle of particles) {
    const dx = particle.x - pointer.x; const dy = particle.y - pointer.y; const distance = Math.hypot(dx, dy)
    if (pointer.active && distance > 0 && distance < 160) { const force = (1 - distance / 160) * .04 * delta; particle.vx += dx / distance * force; particle.vy += dy / distance * force }
    particle.vx += (particle.baseX - particle.x) * .00005 * delta; particle.vy += (particle.baseY - particle.y) * .00005 * delta; particle.vx *= .9; particle.vy *= .9; particle.x += particle.vx; particle.y += particle.vy
  }
  for (let a = 0; a < particles.length; a++) for (let b = a + 1; b < particles.length; b++) { const distance = Math.hypot(particles[a].x - particles[b].x, particles[a].y - particles[b].y); if (distance < 110) { context.beginPath(); context.moveTo(particles[a].x, particles[a].y); context.lineTo(particles[b].x, particles[b].y); context.strokeStyle = `rgba(77,165,235,${(1 - distance / 110) * .09})`; context.stroke() } }
  for (const particle of particles) { context.beginPath(); context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); context.fillStyle = `rgba(135,203,255,${particle.alpha})`; context.fill() }
  for (let index = wakeParticles.length - 1; index >= 0; index--) { const wake = wakeParticles[index]; wake.life -= delta / 650; if (wake.life <= 0) { wakeParticles.splice(index, 1); continue } wake.x += wake.vx * delta; wake.y += wake.vy * delta; context.beginPath(); context.arc(wake.x, wake.y, 1.5 * wake.life, 0, Math.PI * 2); context.fillStyle = `rgba(80,180,255,${wake.life * .5})`; context.fill() }
  debug.wakeCount = wakeParticles.length; pointer.velocity *= .82; frame = requestAnimationFrame(draw)
}
function restart() { cancelAnimationFrame(frame); previous = 0; if (!document.hidden && !reduceMotion.matches && !coarsePointer.matches) frame = requestAnimationFrame(draw) }
if (context && canvas instanceof HTMLCanvasElement) { resize(); restart(); addEventListener('pointermove', move, { passive: true }); addEventListener('pointerleave', () => { pointer.active = false }, { passive: true }); addEventListener('resize', () => { resize(); restart() }, { passive: true }); document.addEventListener('visibilitychange', restart); reduceMotion.addEventListener('change', restart); coarsePointer.addEventListener('change', restart) }
