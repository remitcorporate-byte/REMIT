import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Check, Menu, ShieldCheck, X } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './landing.css'

type AuthMode = 'login' | 'register'

type LandingPageProps = {
  onAuth: (mode: AuthMode) => void
}

const payrollSteps = [
  {
    number: '01',
    name: 'Fund',
    detail: 'Add money to a dedicated wallet before the run begins.',
  },
  {
    number: '02',
    name: 'Prepare',
    detail: 'Build payroll from verified employee and bank details.',
  },
  {
    number: '03',
    name: 'Approve',
    detail: 'Release funds only through the roles you have assigned.',
  },
  {
    number: '04',
    name: 'Reconcile',
    detail: 'Track each transfer through completion, failure, or reversal.',
  },
]

const roles = ['Owner', 'Admin', 'Finance', 'Viewer', 'Employee']

export function LandingPage({ onAuth }: LandingPageProps) {
  const root = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.landing-nav', { y: -24, opacity: 0, duration: 0.7 })
        .from('.landing-hero-line', { yPercent: 115, duration: 0.9, stagger: 0.08 }, '-=0.25')
        .from('.landing-hero-copy, .landing-hero-actions', { y: 24, opacity: 0, duration: 0.65 }, '-=0.45')
        .from('.landing-hero-art', { x: 80, rotate: 2, opacity: 0, duration: 1 }, '-=0.85')

      gsap.to('.landing-hero-art', {
        yPercent: 11,
        ease: 'none',
        scrollTrigger: {
          trigger: '.landing-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.7,
        },
      })

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
        gsap.from(element, {
          y: 56,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 84%',
            once: true,
          },
        })
      })

      gsap.from('.landing-step', {
        xPercent: 22,
        opacity: 0,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.landing-flow-track',
          start: 'top 75%',
          end: 'bottom 70%',
          scrub: 0.5,
        },
      })

      gsap.to('.landing-role-art', {
        xPercent: -4,
        rotate: -0.8,
        ease: 'none',
        scrollTrigger: {
          trigger: '.landing-roles',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.8,
        },
      })
    }, root)

    return () => context.revert()
  }, [])

  const navigateTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <div className="landing" ref={root}>
      <header className="landing-nav">
        <button className="landing-wordmark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          REMIT
        </button>
        <nav className={menuOpen ? 'landing-nav-links is-open' : 'landing-nav-links'} aria-label="Main navigation">
          <button onClick={() => navigateTo('how-it-works')}>How it works</button>
          <button onClick={() => navigateTo('control')}>Control</button>
          <button onClick={() => navigateTo('security')}>Security</button>
        </nav>
        <div className="landing-nav-actions">
          <button className="landing-text-button" onClick={() => onAuth('login')}>Sign in</button>
          <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>
            Start payroll <ArrowRight size={18} />
          </button>
        </div>
        <button
          className="landing-menu-button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-content">
            <h1>
              <span className="landing-line-mask"><span className="landing-hero-line">PAYDAY,</span></span>
              <span className="landing-line-mask"><span className="landing-hero-line landing-blue">WITHOUT</span></span>
              <span className="landing-line-mask"><span className="landing-hero-line landing-blue">THE PANIC.</span></span>
            </h1>
            <p className="landing-hero-copy">
              Fund your wallet, approve payroll, pay every employee, and reconcile every transfer from one clear workspace.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>
                Start payroll <ArrowRight size={20} />
              </button>
              <button className="landing-link-button" onClick={() => navigateTo('how-it-works')}>
                How it works <ArrowDown size={19} />
              </button>
            </div>
          </div>
          <img
            className="landing-hero-art"
            src="/landing/remit-payroll-motion.png"
            alt="Payroll wallet, payment cards, employee profiles, and transfer receipts moving through REMIT"
          />
          <div className="landing-hero-edge" aria-hidden="true">
            <span>Wallet funded</span>
            <span>Employees prepared</span>
            <span>Approvals complete</span>
            <span>Transfers reconciled</span>
          </div>
        </section>

        <section className="landing-flow" id="how-it-works">
          <div className="landing-flow-heading" data-reveal>
            <h2>FROM FUNDED<br /><span>TO FINISHED.</span></h2>
            <p>One controlled flow. Every decision visible.</p>
          </div>
          <p className="landing-flow-intro" data-reveal>
            Wallet balance, role-based approvals, Paystack transfers, and automatic reconciliation stay connected.
          </p>
          <div className="landing-flow-track">
            {payrollSteps.map((step) => (
              <article className="landing-step" key={step.number}>
                <div className="landing-step-marker"><Check size={20} /></div>
                <div className="landing-step-title">
                  <strong>{step.number}</strong>
                  <h3>{step.name}</h3>
                </div>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
          <div className="landing-status-rail" id="security" data-reveal>
            <ShieldCheck aria-hidden="true" />
            <strong>Built for controlled money movement</strong>
            <span>Permission-based access</span>
            <span>Signed Paystack webhooks</span>
            <span>Durable payroll queue</span>
            <span>Transfer reconciliation</span>
          </div>
        </section>

        <section className="landing-roles" id="control">
          <div className="landing-role-copy" data-reveal>
            <h2>CONTROL<br /><span>FOR THE PEOPLE</span><br /><span>WHO CARRY PAYDAY.</span></h2>
            <p>
              Owners set the rules. Finance prepares the run. Approvers release it. Everyone sees only what their role allows.
            </p>
          </div>
          <div className="landing-role-media" data-reveal>
            <span className="landing-role-ghost" aria-hidden="true">PAYDAY</span>
            <img
              className="landing-role-art"
              src="/landing/remit-role-team.png"
              alt="Five Nigerian professionals representing REMIT access roles"
            />
            <div className="landing-role-labels" aria-label="Supported account roles">
              {roles.map((role) => <span key={role}>{role}</span>)}
            </div>
          </div>
        </section>

        <section className="landing-closing">
          <div className="landing-closing-copy" data-reveal>
            <h2>MAKE THE NEXT<br /><span>PAYDAY BORING.</span></h2>
            <p>That’s the point.</p>
            <div className="landing-closing-actions">
              <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>
                Start payroll <ArrowRight size={20} />
              </button>
              <button className="landing-button landing-button-dark" onClick={() => onAuth('login')}>
                Sign in <ArrowRight size={20} />
              </button>
            </div>
          </div>
          <div className="landing-closing-object" aria-hidden="true">
            <span>R</span>
          </div>
          <ArrowRight className="landing-closing-arrow" size={90} aria-hidden="true" />
          <footer className="landing-footer">
            <strong>REMIT</strong>
            <a href="#security">Security</a>
            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/health`}>API status</a>
            <span>Privacy</span>
            <small>Payroll operations for Nigerian companies.</small>
          </footer>
        </section>
      </main>
    </div>
  )
}
