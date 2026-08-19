// ============================================
// 统一动画模块 — 所有 GSAP 动画的单一入口
// ============================================

import gsap from 'gsap'

// ─── 动画常量 ───

const ANIMATION = {
  BOUNCE_HEIGHT: -10,
  BOUNCE_DURATION: 0.15,
  BOUNCE_RETURN_RATIO: 2.33,

  PULSE_SCALE: 1.1,
  PULSE_DURATION: 0.2,

  FADE_DURATION: 0.3,
  FADE_DISPLACEMENT: 8,

  SHAKE_INTENSITY: 6,
  SHAKE_REPEATS: 5,
  SHAKE_DURATION: 0.12,

  JUMP_HEIGHT: -12,
  JUMP_UP_DURATION: 0.12,
  JUMP_LAND_DURATION: 0.35,

  EYE_MAX_DIST: 5,
  EYE_DURATION: 0.05,

  FACE_MAX_X: 8,
  FACE_MAX_Y: 6,
  FACE_DURATION: 0.05,

  LOADING_STAGGER: 0.12,
  LOADING_UP_DURATION: 0.45,
  LOADING_DOWN_RATIO: 0.8,
  LOADING_JUMP_HEIGHT: -18,
  LOADING_SCALE: 1.25,
  LOADING_EASE_UP: 'elastic.out(1, 0.5)',
  LOADING_EASE_DOWN: 'power2.in',
  LOADING_REPEAT_DELAY: 0.15,
} as const

// ─── 工具函数 ───

function getElement(el: string | HTMLElement): HTMLElement {
  return typeof el === 'string' ? document.querySelector(el) as HTMLElement : el
}

// ─── 基础动画 ───

export function bounce(el: string | HTMLElement, height = ANIMATION.BOUNCE_HEIGHT): void {
  const target = getElement(el)
  if (!target) return
  gsap.killTweensOf(target, 'y')
  gsap.to(target, { y: height, duration: ANIMATION.BOUNCE_DURATION, ease: 'power2.out' })
  gsap.to(target, {
    y: 0,
    duration: ANIMATION.BOUNCE_DURATION * ANIMATION.BOUNCE_RETURN_RATIO,
    ease: 'bounce.out',
    delay: ANIMATION.BOUNCE_DURATION,
  })
}

export function pulse(el: string | HTMLElement, scale = ANIMATION.PULSE_SCALE): void {
  const target = getElement(el)
  if (!target) return
  gsap.killTweensOf(target, 'scale')
  gsap.to(target, { scale, duration: ANIMATION.PULSE_DURATION, ease: 'back.out(1.5)' })
  gsap.to(target, { scale: 1, duration: ANIMATION.PULSE_DURATION, ease: 'power2.out', delay: ANIMATION.PULSE_DURATION })
}

export function fadeIn(el: string | HTMLElement, delay = 0): void {
  const target = getElement(el)
  if (!target) return
  gsap.fromTo(
    target,
    { opacity: 0, y: ANIMATION.FADE_DISPLACEMENT },
    { opacity: 1, y: 0, duration: ANIMATION.FADE_DURATION, delay, ease: 'power2.out' }
  )
}

export function fadeOut(el: string | HTMLElement): void {
  const target = getElement(el)
  if (!target) return
  gsap.to(target, { opacity: 0, y: -ANIMATION.FADE_DISPLACEMENT, duration: ANIMATION.FADE_DURATION * 0.7, ease: 'power2.in' })
}

export function shake(el: string | HTMLElement, intensity = ANIMATION.SHAKE_INTENSITY, repeats = ANIMATION.SHAKE_REPEATS): void {
  const target = getElement(el)
  if (!target) return
  gsap.killTweensOf(target, 'rotation')
  gsap.to(target, {
    rotation: intensity,
    duration: ANIMATION.SHAKE_DURATION,
    yoyo: true,
    repeat: repeats,
    ease: 'power2.inOut',
  })
  gsap.to(target, {
    rotation: 0,
    duration: ANIMATION.SHAKE_DURATION * 2,
    ease: 'power2.out',
    delay: ANIMATION.SHAKE_DURATION * repeats * 2,
  })
}

export function jump(el: string | HTMLElement, height = ANIMATION.JUMP_HEIGHT): void {
  const target = getElement(el)
  if (!target) return
  gsap.killTweensOf(target, 'y')
  gsap.to(target, { y: height, duration: ANIMATION.JUMP_UP_DURATION, ease: 'power2.out' })
  gsap.to(target, { y: 0, duration: ANIMATION.JUMP_LAND_DURATION, ease: 'bounce.out', delay: ANIMATION.JUMP_UP_DURATION })
}

export function eyeFollow(
  pupil: HTMLElement,
  dx: number,
  dy: number,
  maxDist = ANIMATION.EYE_MAX_DIST,
): void {
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist)
  const angle = Math.atan2(dy, dx)
  gsap.to(pupil, {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    duration: ANIMATION.EYE_DURATION,
    ease: 'power1.out',
  })
}

export function blink(eyes: HTMLElement | HTMLElement[]): void {
  const targets = Array.isArray(eyes) ? eyes : [eyes]
  for (const eye of targets) {
    gsap.to(eye, { scaleY: 0.1, duration: ANIMATION.EYE_DURATION, ease: 'power2.in' })
    gsap.to(eye, { scaleY: 1, duration: ANIMATION.EYE_DURATION * 1.5, ease: 'power2.out', delay: ANIMATION.EYE_DURATION * 1.5 })
  }
}

export function faceFollow(face: HTMLElement, dx: number, dy: number): void {
  const fx = Math.max(-ANIMATION.FACE_MAX_X, Math.min(ANIMATION.FACE_MAX_X, dx / 12))
  const fy = Math.max(-ANIMATION.FACE_MAX_Y, Math.min(ANIMATION.FACE_MAX_Y, dy / 18))
  gsap.to(face, { x: fx, y: fy, duration: ANIMATION.FACE_DURATION, ease: 'power1.out' })
}

export function loadingDots(container: HTMLElement, dots: HTMLElement[]): gsap.core.Timeline {
  const tl = gsap.timeline({ repeat: -1, repeatDelay: ANIMATION.LOADING_REPEAT_DELAY })
  dots.forEach((dot, i) => {
    tl.fromTo(
      dot,
      { y: 0, scale: 1 },
      {
        y: ANIMATION.LOADING_JUMP_HEIGHT,
        scale: ANIMATION.LOADING_SCALE,
        duration: ANIMATION.LOADING_UP_DURATION,
        ease: ANIMATION.LOADING_EASE_UP,
      },
      i * ANIMATION.LOADING_STAGGER
    )
    tl.to(
      dot,
      {
        y: 0,
        scale: 1,
        duration: ANIMATION.LOADING_UP_DURATION * ANIMATION.LOADING_DOWN_RATIO,
        ease: ANIMATION.LOADING_EASE_DOWN,
      },
      i * ANIMATION.LOADING_STAGGER + ANIMATION.LOADING_UP_DURATION * 0.3
    )
  })
  return tl
}

export function reset(el: string | HTMLElement): void {
  const target = getElement(el)
  if (!target) return
  gsap.killTweensOf(target)
  gsap.set(target, { x: 0, y: 0, scale: 1, rotation: 0, skewX: 0 })
}

export function setTransform(el: string | HTMLElement, props: gsap.TweenVars): void {
  const target = getElement(el)
  if (!target) return
  gsap.set(target, props)
}
