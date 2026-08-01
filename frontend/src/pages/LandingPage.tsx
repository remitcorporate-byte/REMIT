import { useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CircleCheck,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './landing.css'

type AuthMode = 'login' | 'register'

type LandingPageProps = {
  onAuth: (mode: AuthMode) => void
}

const payrollRows = [
  ['Aisha Adeyemi', 'Product Designer', '₦850,000'],
  ['Oluwatosin Ogunleye', 'Backend Engineer', '₦950,000'],
  ['Blessing Anokwuru', 'Product Manager', '₦1,200,000'],
  ['Ifeanyi Chukwu', 'Data Analyst', '₦650,000'],
]

const payrollSteps = [
  ['01', 'Fund', 'Load the payroll wallet'],
  ['02', 'Prepare', 'Confirm people and amounts'],
  ['03', 'Approve', 'Release with the right role'],
  ['04', 'Reconcile', 'See every final outcome'],
]

const permissions = [
  ['Create payroll', true, true, true, false, false],
  ['Approve payroll', true, true, true, false, false],
  ['View wallet', true, true, true, true, true],
  ['Manage team', true, true, false, false, false],
]

const roles = ['Owner', 'Admin', 'Finance', 'Viewer', 'Employee']

function RemitMark() {
  return (
    <span className="remit-brand" aria-label="REMIT">
      <span className="remit-mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <strong>REMIT</strong>
    </span>
  )
}

export function LandingPage({ onAuth }: LandingPageProps) {
  const root = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.landing-nav', { y: -20, opacity: 0, duration: 0.65 })
        .from('.landing-hero-copy > *', { y: 30, opacity: 0, stagger: 0.08, duration: 0.65 }, '-=0.3')
        .from('.payroll-preview', { x: 55, opacity: 0, duration: 0.85 }, '-=0.7')

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
        gsap.from(element, {
          y: 42,
          opacity: 0,
          duration: 0.75,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: 'top 86%', once: true },
        })
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
        <button className="landing-brand-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <RemitMark />
        </button>
        <nav className={menuOpen ? 'landing-nav-links is-open' : 'landing-nav-links'} aria-label="Main navigation">
          <button onClick={() => navigateTo('product')}>Product</button>
          <button onClick={() => navigateTo('how-it-works')}>How it works</button>
          <button onClick={() => navigateTo('security')}>Security</button>
        </nav>
        <div className="landing-nav-actions">
          <button className="landing-button landing-button-quiet" onClick={() => onAuth('login')}>Sign in</button>
          <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>Run payroll</button>
        </div>
        <button className="landing-menu-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        <section className="landing-hero" id="product">
          <div className="landing-hero-copy">
            <h1>Payroll that <span>lands.</span><br />Every time.</h1>
            <p>Fund, approve, pay, and reconcile your team from one controlled workspace.</p>
            <div className="landing-hero-actions">
              <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>Run payroll <ArrowRight size={18} /></button>
              <button className="landing-button landing-button-outline" onClick={() => navigateTo('how-it-works')}>See how it works <ArrowDownRight size={18} /></button>
            </div>
          </div>

          <div className="payroll-preview" aria-label="REMIT payroll overview preview">
            <div className="preview-sidebar">
              <RemitMark />
              {['Overview', 'Wallet', 'Employees', 'Payroll', 'Approvals', 'Reconciliation'].map((item, index) => (
                <span className={index === 0 ? 'is-active' : ''} key={item}>{item}</span>
              ))}
              <small>Acme Ltd.</small>
            </div>
            <div className="preview-main">
              <div className="preview-heading"><h2>Payroll overview</h2><button>Review payroll</button></div>
              <div className="preview-stats">
                <div className="is-mint"><small>Ready to approve</small><strong>12 employees</strong></div>
                <div className="is-orange"><small>Payroll amount</small><strong>₦8,450,000</strong></div>
                <div><small>Approval progress</small><strong>2 of 3</strong><span className="progress"><i /></span></div>
              </div>
              <div className="preview-table">
                <div className="preview-table-head"><span>Employee</span><span>Role</span><span>Net pay</span><span>Status</span></div>
                {payrollRows.map(([name, role, amount], index) => (
                  <div className="preview-row" key={name}>
                    <span><i>{name.split(' ').map((part) => part[0]).join('')}</i>{name}</span>
                    <span>{role}</span><span>{amount}</span><span><em>{index < 3 ? 'Ready' : 'Review'}</em></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-flow" id="how-it-works">
          <div className="landing-section-heading" data-reveal>
            <h2>One run. Full control.</h2>
            <p>Every stage of payroll stays connected, visible, and accountable.</p>
          </div>
          <div className="landing-flow-track" data-reveal>
            {payrollSteps.map(([number, title, detail], index) => (
              <article className="landing-step" key={number}>
                <div><strong>{number}</strong>{index < payrollSteps.length - 1 && <ArrowRight aria-hidden="true" />}</div>
                <h3>{title}</h3><p>{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-control">
          <div className="landing-control-copy" data-reveal>
            <h2>The right access<br />at the right moment.</h2>
            <p>Owners set policy. Finance prepares. Approvers release. Every role sees only what it needs.</p>
          </div>
          <div className="role-matrix" data-reveal>
            <div className="role-row role-head"><span>Permission</span>{roles.map((role) => <strong key={role}>{role}</strong>)}</div>
            {permissions.map(([label, ...values]) => (
              <div className={label === 'Approve payroll' ? 'role-row is-highlighted' : 'role-row'} key={String(label)}>
                <span>{label}</span>{values.map((allowed, index) => <i key={roles[index]}>{allowed ? <Check size={18} /> : '—'}</i>)}
              </div>
            ))}
          </div>
        </section>

        <section className="landing-security" id="security">
          {([
            ['Permission-based access', ShieldCheck],
            ['Signed Paystack webhooks', CircleCheck],
            ['Durable payroll processing', CircleCheck],
            ['Transfer reconciliation', CircleCheck],
          ] as const).map(([label, Icon]) => (
            <div key={String(label)}><span><Icon size={22} /></span><strong>{label}</strong></div>
          ))}
        </section>

        <section className="landing-closing">
          <div data-reveal><h2>Make the next payday<br />feel routine.</h2><p>Set up your workspace and run payroll with confidence.</p></div>
          <div className="landing-closing-actions">
            <button className="landing-button landing-button-primary" onClick={() => onAuth('register')}>Run payroll</button>
            <button className="landing-button landing-button-outline" onClick={() => onAuth('login')}>Sign in</button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <RemitMark />
        <button onClick={() => navigateTo('product')}>Product</button>
        <button onClick={() => navigateTo('security')}>Security</button>
        <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/health`}>API status</a>
        <small>Payroll operations for Nigerian companies.</small>
      </footer>
    </div>
  )
}
